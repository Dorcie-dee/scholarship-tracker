/**
 * Development seed script — resets the database to a small, realistic demo
 * state and exits. Run with `yarn seed` (see package.json).
 *
 * Deliberately goes through the real Nest services (AuthService, JourneysService,
 * etc.) rather than raw repository inserts, so seeded data is exercised through
 * the exact same validation/business logic real requests use.
 *
 * SAFETY: refuses to run when NODE_ENV=production, and wipes `users` +
 * `universities` (cascading to everything else) before reseeding — this is a
 * full reset, not an incremental seed. Only ever run against a local/dev DB.
 *
 * IMPORTANT: the seeded user's credentials come from SEED_USER_EMAIL /
 * SEED_USER_PASSWORD (see sample.env) — there is no hardcoded fallback
 * email/password here, so a real person's details never end up in source
 * control. Document upload is skipped: it requires real Cloudinary
 * credentials, which this environment does not have configured.
 */
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { AppConfig, requireEnv } from '../config/configuration';
import { AuthService } from '../auth/auth.service';
import { ProfileService } from '../profile/profile.service';
import { UniversitiesService } from '../universities/universities.service';
import { ProgrammesService } from '../programmes/programmes.service';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { OpportunitySourcesService } from '../opportunity-sources/opportunity-sources.service';
import { RequirementsService } from '../requirements/requirements.service';
import { DeadlinesService } from '../deadlines/deadlines.service';
import { JourneysService } from '../journeys/journeys.service';
import { ApplicationsService } from '../applications/applications.service';
import { TasksService } from '../tasks/tasks.service';
import {
  StudyLevel,
  OpportunityType,
  OpportunitySourceType,
  SourceAuthorityLevel,
  RequirementType,
  DeadlineType,
  JourneyStatus,
  ApplicationType,
  ApplicationStatus,
  TaskPriority,
  TaskDependencyType,
} from '../types';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });

  const configService = app.get(ConfigService<AppConfig, true>);
  if (configService.get('isProduction', { infer: true })) {
    console.error('Refusing to run the seed script with NODE_ENV=production.');
    await app.close();
    process.exit(1);
  }

  const seedEmail = requireEnv(process.env, 'SEED_USER_EMAIL');
  const seedPassword = requireEnv(process.env, 'SEED_USER_PASSWORD');

  const dataSource = app.get<DataSource>(getDataSourceToken());
  // Wipes everything owned by users and everything under the catalog tables.
  // FK cascades (see the initial migration) take care of every dependent table.
  await dataSource.query(
    'TRUNCATE TABLE "users", "universities" RESTART IDENTITY CASCADE',
  );

  console.log('Cleared existing data.');

  const authService = app.get(AuthService);
  const profileService = app.get(ProfileService);
  const universitiesService = app.get(UniversitiesService);
  const programmesService = app.get(ProgrammesService);
  const opportunitiesService = app.get(OpportunitiesService);
  const opportunitySourcesService = app.get(OpportunitySourcesService);
  const requirementsService = app.get(RequirementsService);
  const deadlinesService = app.get(DeadlinesService);
  const journeysService = app.get(JourneysService);
  const applicationsService = app.get(ApplicationsService);
  const tasksService = app.get(TasksService);

  // --- Catalog data -----------------------------------------------------
  const twente = await universitiesService.create({
    name: 'University of Twente',
    country: 'Netherlands',
    website: 'https://www.utwente.nl',
  });
  const twenteMsc = await programmesService.create({
    universityId: twente.id,
    name: 'MSc Computer Science',
    studyLevel: StudyLevel.MASTERS,
    field: 'Computer Science',
    duration: '2 years',
    website:
      'https://www.utwente.nl/en/education/master/programmes/computer-science/',
  });

  const tum = await universitiesService.create({
    name: 'Technical University of Munich',
    country: 'Germany',
    website: 'https://www.tum.de',
  });
  await programmesService.create({
    universityId: tum.id,
    name: 'MSc Data Engineering and Analytics',
    studyLevel: StudyLevel.MASTERS,
    field: 'Data Engineering',
    duration: '2 years',
  });

  // Registered early (before the opportunity-linked requirements/deadlines
  // below) purely so we have a real user id to pass into those service calls —
  // it's unused for ownership purposes when only opportunityId is set, but a
  // real id is clearer than a placeholder string.
  const { user } = await authService.register(
    { email: seedEmail, password: seedPassword, name: 'Demo Applicant' },
    {},
  );

  const scholarship = await opportunitiesService.create({
    title: 'Twente Excellence Scholarship',
    provider: 'University of Twente',
    opportunityType: OpportunityType.SCHOLARSHIP,
    country: 'Netherlands',
    fundingType: 'Full tuition + stipend',
    fundingAmount: '25000.00',
    currency: 'EUR',
    duration: '2 years',
    studyLevel: StudyLevel.MASTERS,
    field: 'Computer Science',
    eligibilitySummary:
      'Open to excellent non-EU/EEA students admitted to an eligible UT master’s programme.',
    applicationMethod:
      'Online form, submitted alongside programme admission application',
    applicationUrl:
      'https://www.utwente.nl/en/education/master/scholarships/utses/',
    universityId: twente.id,
    programmeId: twenteMsc.id,
  });
  await opportunitySourcesService.create({
    opportunityId: scholarship.id,
    sourceType: OpportunitySourceType.OFFICIAL_UNIVERSITY_WEBSITE,
    sourceName: 'University of Twente Scholarships page',
    sourceUrl: 'https://www.utwente.nl/en/education/master/scholarships/utses/',
    capturedAt: new Date().toISOString(),
    extractedContent:
      'The University of Twente Scholarship (UTS) offers a limited number of scholarships to excellent students from outside the EU/EEA for a two-year MSc programme.',
    authorityLevel: SourceAuthorityLevel.OFFICIAL,
  });
  await requirementsService.create(user.id, {
    requirementType: RequirementType.GPA,
    description:
      'Minimum GPA equivalent to a Dutch 8/10 in your bachelor’s degree',
    opportunityId: scholarship.id,
  });
  await requirementsService.create(user.id, {
    requirementType: RequirementType.LANGUAGE,
    description: 'IELTS Academic overall band 6.5, no subscore below 6.0',
    opportunityId: scholarship.id,
  });
  await deadlinesService.create(user.id, {
    label: 'Scholarship application deadline',
    deadlineType: DeadlineType.SCHOLARSHIP_DEADLINE,
    date: '2027-02-01T00:00:00.000Z',
    opportunityId: scholarship.id,
  });

  // --- Demo user's owned data (user was already registered above) --------
  await profileService.update(user.id, {
    nationality: 'Ghanaian',
    summary:
      'Aspiring MSc Computer Science student interested in distributed systems.',
    education: [
      {
        institution: 'University of Ghana',
        degree: 'BSc',
        field: 'Computer Science',
        startDate: '2020-09-01',
        endDate: '2024-06-30',
        gpa: '3.8/4.0',
      },
    ],
    skills: [
      { name: 'TypeScript' },
      { name: 'Distributed Systems' },
      { name: 'PostgreSQL' },
    ],
    languages: [
      {
        language: 'English',
        proficiency: 'Fluent',
        testType: 'IELTS',
        score: '7.5',
      },
    ],
  });

  const journey = await journeysService.create(user.id, {
    title: 'MSc Computer Science — University of Twente',
    goal: 'Pursue a fully-funded MSc in Computer Science, specializing in distributed systems.',
    status: JourneyStatus.ACTIVE,
    universityId: twente.id,
    programmeId: twenteMsc.id,
  });

  const application = await applicationsService.create(user.id, {
    journeyId: journey.id,
    title: 'Twente Excellence Scholarship Application',
    applicationType: ApplicationType.UNIVERSITY_SCHOLARSHIP,
    status: ApplicationStatus.IN_PROGRESS,
    opportunityId: scholarship.id,
    portal: 'UT Studielink + scholarship form',
  });

  await requirementsService.create(user.id, {
    requirementType: RequirementType.RECOMMENDATION,
    description: 'Submit two academic recommendation letters',
    applicationId: application.id,
  });

  await deadlinesService.create(user.id, {
    label: 'Submit scholarship application',
    deadlineType: DeadlineType.SCHOLARSHIP_DEADLINE,
    date: '2027-02-01T00:00:00.000Z',
    applicationId: application.id,
  });

  const requestLettersTask = await tasksService.create(user.id, {
    journeyId: journey.id,
    applicationId: application.id,
    title: 'Request recommendation letters from two professors',
    priority: TaskPriority.HIGH,
    dueDate: '2027-01-10',
  });
  await tasksService.create(user.id, {
    journeyId: journey.id,
    applicationId: application.id,
    title: 'Write personal statement',
    priority: TaskPriority.MEDIUM,
    dueDate: '2027-01-20',
    // Informational only — see task.entity.ts. Writing the statement doesn't
    // technically require the letters to exist first, but doing it after
    // tends to produce a stronger statement.
    dependsOnTaskId: requestLettersTask.id,
    dependencyType: TaskDependencyType.SOFT,
  });

  // NOTE: no Document rows are seeded — creating one requires uploading a real
  // file through CloudinaryService, and this environment has no Cloudinary
  // credentials configured (CLOUDINARY_* in .env). Upload one manually via
  // POST /api/documents once credentials are set, if you need seeded documents.

  console.log(
    `Seed complete. Log in as ${seedEmail} with the configured SEED_USER_PASSWORD.`,
  );

  await app.close();
}

main().catch((error) => {
  console.error('Seed script failed:', error);
  process.exit(1);
});
