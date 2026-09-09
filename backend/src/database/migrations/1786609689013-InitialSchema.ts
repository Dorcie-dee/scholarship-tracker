import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1786609689013 implements MigrationInterface {
  name = 'InitialSchema1786609689013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Required for uuid_generate_v4(), used as every table's default primary key.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TABLE "refresh_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "token_hash" character varying(255) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "last_used_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "revoked_due_to_reuse" boolean NOT NULL DEFAULT false, "user_agent" character varying(512), "ip_address" character varying(64), CONSTRAINT "PK_9190032f6967b7971dca07d69f3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d76f5941d821678137ef15d965" ON "refresh_sessions" ("token_hash") `,
    );
    await queryRunner.query(
      `CREATE TABLE "applicant_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "nationality" character varying(255), "date_of_birth" character varying(255), "summary" text, "education" jsonb NOT NULL DEFAULT '[]', "experience" jsonb NOT NULL DEFAULT '[]', "skills" jsonb NOT NULL DEFAULT '[]', "certifications" jsonb NOT NULL DEFAULT '[]', "languages" jsonb NOT NULL DEFAULT '[]', "metadata" jsonb NOT NULL DEFAULT '{}', CONSTRAINT "REL_bd8d1ba3584e92ad7066a14f34" UNIQUE ("user_id"), CONSTRAINT "PK_24ea68bb240c91ff617a760c411" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."documents_document_type_enum" AS ENUM('cv', 'sop', 'motivation_letter', 'transcript', 'certificate', 'recommendation_letter', 'passport', 'research_proposal', 'writing_sample', 'other')`,
    );
    await queryRunner.query(
      `CREATE TABLE "documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "owner_id" uuid NOT NULL, "title" character varying(255) NOT NULL, "document_type" "public"."documents_document_type_enum" NOT NULL DEFAULT 'other', "version" integer NOT NULL DEFAULT '1', "previous_version_id" uuid, "cloudinary_public_id" character varying(255) NOT NULL, "cloudinary_url" character varying(1024) NOT NULL, "mime_type" character varying(100), "file_size_bytes" integer, "is_current" boolean NOT NULL DEFAULT true, "notes" text, CONSTRAINT "PK_ac51aa5181ee2036f5ca482857c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_888a4852e27627d1ebd8a094e9" ON "documents" ("owner_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "email" character varying(255) NOT NULL, "password_hash" character varying(255) NOT NULL, "name" character varying(255), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."programmes_study_level_enum" AS ENUM('undergraduate', 'masters', 'phd', 'postdoc', 'other')`,
    );
    await queryRunner.query(
      `CREATE TABLE "programmes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "university_id" uuid NOT NULL, "name" character varying(255) NOT NULL, "study_level" "public"."programmes_study_level_enum", "field" character varying(255), "duration" character varying(100), "website" character varying(512), "notes" text, CONSTRAINT "PK_116b5f8dbb9f632d76bc144404f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_aedd6d6184e8f16e6328d71ed6" ON "programmes" ("university_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "universities" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(255) NOT NULL, "country" character varying(255), "website" character varying(512), "notes" text, CONSTRAINT "PK_8da52f2cee6b407559fdbabf59e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."application_journeys_status_enum" AS ENUM('planning', 'active', 'on_hold', 'completed', 'abandoned')`,
    );
    await queryRunner.query(
      `CREATE TABLE "application_journeys" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "title" character varying(255) NOT NULL, "goal" text, "status" "public"."application_journeys_status_enum" NOT NULL DEFAULT 'planning', "university_id" uuid, "programme_id" uuid, "notes" text, CONSTRAINT "PK_a6ba468ac1104c4856c480bc0d9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_95d831c9f7528ee59510064608" ON "application_journeys" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bcd61395942c3dd3cd7ff23e1f" ON "application_journeys" ("university_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_178535e7a159b5f9c06d190418" ON "application_journeys" ("programme_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."opportunity_sources_source_type_enum" AS ENUM('official_university_website', 'scholarship_provider', 'newsletter', 'secondary_website', 'uploaded_document', 'forwarded_email', 'manual_entry')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."opportunity_sources_authority_level_enum" AS ENUM('official', 'verified_third_party', 'unverified')`,
    );
    await queryRunner.query(
      `CREATE TABLE "opportunity_sources" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "opportunity_id" uuid NOT NULL, "source_type" "public"."opportunity_sources_source_type_enum" NOT NULL DEFAULT 'manual_entry', "source_name" character varying(255), "source_url" character varying(1024), "captured_at" TIMESTAMP WITH TIME ZONE NOT NULL, "published_at" TIMESTAMP WITH TIME ZONE, "extracted_content" text, "authority_level" "public"."opportunity_sources_authority_level_enum" NOT NULL DEFAULT 'unverified', "notes" text, CONSTRAINT "PK_bf9cbe00e3625236e6acc99f28a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9bc1950b56207ecffbfa64e7d3" ON "opportunity_sources" ("opportunity_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."requirements_requirement_type_enum" AS ENUM('nationality', 'academic', 'gpa', 'degree', 'language', 'work_experience', 'document', 'recommendation', 'interview', 'application_portal', 'other')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."requirements_status_enum" AS ENUM('unknown', 'confirmed', 'profile_match', 'ai_assessment', 'needs_verification', 'not_met', 'not_applicable', 'conditional')`,
    );
    await queryRunner.query(
      `CREATE TABLE "requirements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "requirement_type" "public"."requirements_requirement_type_enum" NOT NULL DEFAULT 'other', "description" text NOT NULL, "status" "public"."requirements_status_enum" NOT NULL DEFAULT 'unknown', "opportunity_id" uuid, "application_id" uuid, "notes" text, CONSTRAINT "PK_4e966e20a0ebaf89e4c1ed664a4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_142d4c8e20df55f9365094aeb8" ON "requirements" ("opportunity_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_313b241ad406d1daa18ae85648" ON "requirements" ("application_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."deadlines_deadline_type_enum" AS ENUM('opening_date', 'university_deadline', 'scholarship_deadline', 'recommendation_deadline', 'interview', 'expected_decision', 'programme_start', 'other')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."deadlines_status_enum" AS ENUM('upcoming', 'due_soon', 'passed', 'met', 'missed', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TABLE "deadlines" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "label" character varying(255) NOT NULL, "deadline_type" "public"."deadlines_deadline_type_enum" NOT NULL DEFAULT 'other', "date" TIMESTAMP WITH TIME ZONE NOT NULL, "status" "public"."deadlines_status_enum" NOT NULL DEFAULT 'upcoming', "opportunity_id" uuid, "application_id" uuid, "task_id" uuid, "requirement_id" uuid, "notes" text, CONSTRAINT "PK_a9b8551c028a78298641a8e3470" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3a141eb795bdba333a1f3b4eb7" ON "deadlines" ("opportunity_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8c948d56483bd57b518c8904c1" ON "deadlines" ("application_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_173f9b02d87defc0877f3f77f2" ON "deadlines" ("task_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_199ffdeee8699daf76230b49e8" ON "deadlines" ("requirement_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."opportunities_opportunity_type_enum" AS ENUM('scholarship', 'grant', 'fellowship', 'funding', 'other')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."opportunities_study_level_enum" AS ENUM('undergraduate', 'masters', 'phd', 'postdoc', 'other')`,
    );
    await queryRunner.query(
      `CREATE TABLE "opportunities" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "title" character varying(255) NOT NULL, "provider" character varying(255), "opportunity_type" "public"."opportunities_opportunity_type_enum" NOT NULL DEFAULT 'scholarship', "country" character varying(255), "funding_type" character varying(100), "funding_amount" numeric(12,2), "currency" character varying(10), "duration" character varying(100), "study_level" "public"."opportunities_study_level_enum", "field" character varying(255), "eligibility_summary" text, "application_method" character varying(255), "application_url" character varying(1024), "university_id" uuid, "programme_id" uuid, "metadata" jsonb NOT NULL DEFAULT '{}', CONSTRAINT "PK_4bd9cd12ddc0ff48a5a97ddebce" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a336383efdef800f3bb7e6011b" ON "opportunities" ("university_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bf0752deef658d180e23c47403" ON "opportunities" ("programme_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "application_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "application_id" uuid NOT NULL, "document_id" uuid NOT NULL, "label" character varying(255), "attached_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_592142aa992e003beadf1409e9e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9ad8ab815e842d67e9aaec900c" ON "application_documents" ("application_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_728d97b7efa81eb4b8686945a1" ON "application_documents" ("document_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "application_snapshots" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "application_id" uuid NOT NULL, "label" character varying(255), "data" jsonb NOT NULL, CONSTRAINT "PK_0bce83c68db5fe6717d7ed7b0b6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f06909049cf73f9c9ff6ac7e58" ON "application_snapshots" ("application_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."applications_application_type_enum" AS ENUM('admission', 'university_scholarship', 'external_scholarship', 'other_funding', 'other')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."applications_status_enum" AS ENUM('not_started', 'in_progress', 'submitted', 'under_review', 'interview', 'offer', 'accepted', 'rejected', 'withdrawn')`,
    );
    await queryRunner.query(
      `CREATE TABLE "applications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "journey_id" uuid NOT NULL, "title" character varying(255) NOT NULL, "application_type" "public"."applications_application_type_enum" NOT NULL DEFAULT 'other', "status" "public"."applications_status_enum" NOT NULL DEFAULT 'not_started', "opportunity_id" uuid, "start_date" date, "submission_date" date, "portal" character varying(255), "external_url" character varying(1024), "notes" text, CONSTRAINT "PK_938c0a27255637bde919591888f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a61d3a7cb220083cfec35f20ec" ON "applications" ("journey_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_70ea0fea3f4ca26cbc2cfa21a8" ON "applications" ("opportunity_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tasks_status_enum" AS ENUM('todo', 'in_progress', 'blocked', 'done', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tasks_priority_enum" AS ENUM('low', 'medium', 'high', 'urgent')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tasks_dependency_type_enum" AS ENUM('hard', 'soft')`,
    );
    await queryRunner.query(
      `CREATE TABLE "tasks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "title" character varying(255) NOT NULL, "description" text, "status" "public"."tasks_status_enum" NOT NULL DEFAULT 'todo', "priority" "public"."tasks_priority_enum" NOT NULL DEFAULT 'medium', "due_date" date, "completed_at" TIMESTAMP WITH TIME ZONE, "application_id" uuid, "journey_id" uuid, "requirement_id" uuid, "depends_on_task_id" uuid, "dependency_type" "public"."tasks_dependency_type_enum", CONSTRAINT "PK_8d12ff38fcc62aaba2cab748772" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_abb18969c2d02905658dbb9916" ON "tasks" ("application_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e998b20a18684ad24eb9b5f44f" ON "tasks" ("journey_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e59c64a05e73b0ff02eb72206b" ON "tasks" ("requirement_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_sessions" ADD CONSTRAINT "FK_a7ab4fd82c654c85b9de53d971a" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "applicant_profiles" ADD CONSTRAINT "FK_bd8d1ba3584e92ad7066a14f34a" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" ADD CONSTRAINT "FK_888a4852e27627d1ebd8a094e98" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" ADD CONSTRAINT "FK_85bb251d329c62799e477bc9058" FOREIGN KEY ("previous_version_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "programmes" ADD CONSTRAINT "FK_aedd6d6184e8f16e6328d71ed6f" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_journeys" ADD CONSTRAINT "FK_95d831c9f7528ee595100646083" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_journeys" ADD CONSTRAINT "FK_bcd61395942c3dd3cd7ff23e1f1" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_journeys" ADD CONSTRAINT "FK_178535e7a159b5f9c06d190418f" FOREIGN KEY ("programme_id") REFERENCES "programmes"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "opportunity_sources" ADD CONSTRAINT "FK_9bc1950b56207ecffbfa64e7d3a" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "requirements" ADD CONSTRAINT "FK_142d4c8e20df55f9365094aeb8d" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "requirements" ADD CONSTRAINT "FK_313b241ad406d1daa18ae856482" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "deadlines" ADD CONSTRAINT "FK_3a141eb795bdba333a1f3b4eb77" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "deadlines" ADD CONSTRAINT "FK_8c948d56483bd57b518c8904c1f" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "deadlines" ADD CONSTRAINT "FK_173f9b02d87defc0877f3f77f21" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "deadlines" ADD CONSTRAINT "FK_199ffdeee8699daf76230b49e84" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "opportunities" ADD CONSTRAINT "FK_a336383efdef800f3bb7e6011b6" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "opportunities" ADD CONSTRAINT "FK_bf0752deef658d180e23c474033" FOREIGN KEY ("programme_id") REFERENCES "programmes"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_documents" ADD CONSTRAINT "FK_9ad8ab815e842d67e9aaec900cb" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_documents" ADD CONSTRAINT "FK_728d97b7efa81eb4b8686945a1b" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_snapshots" ADD CONSTRAINT "FK_f06909049cf73f9c9ff6ac7e580" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "applications" ADD CONSTRAINT "FK_a61d3a7cb220083cfec35f20ec3" FOREIGN KEY ("journey_id") REFERENCES "application_journeys"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "applications" ADD CONSTRAINT "FK_70ea0fea3f4ca26cbc2cfa21a8d" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "FK_abb18969c2d02905658dbb9916a" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "FK_e998b20a18684ad24eb9b5f44f7" FOREIGN KEY ("journey_id") REFERENCES "application_journeys"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "FK_e59c64a05e73b0ff02eb72206b6" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "FK_b888249fc72a742a8760c99ca22" FOREIGN KEY ("depends_on_task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP CONSTRAINT "FK_b888249fc72a742a8760c99ca22"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP CONSTRAINT "FK_e59c64a05e73b0ff02eb72206b6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP CONSTRAINT "FK_e998b20a18684ad24eb9b5f44f7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP CONSTRAINT "FK_abb18969c2d02905658dbb9916a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "applications" DROP CONSTRAINT "FK_70ea0fea3f4ca26cbc2cfa21a8d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "applications" DROP CONSTRAINT "FK_a61d3a7cb220083cfec35f20ec3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_snapshots" DROP CONSTRAINT "FK_f06909049cf73f9c9ff6ac7e580"`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_documents" DROP CONSTRAINT "FK_728d97b7efa81eb4b8686945a1b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_documents" DROP CONSTRAINT "FK_9ad8ab815e842d67e9aaec900cb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "opportunities" DROP CONSTRAINT "FK_bf0752deef658d180e23c474033"`,
    );
    await queryRunner.query(
      `ALTER TABLE "opportunities" DROP CONSTRAINT "FK_a336383efdef800f3bb7e6011b6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "deadlines" DROP CONSTRAINT "FK_199ffdeee8699daf76230b49e84"`,
    );
    await queryRunner.query(
      `ALTER TABLE "deadlines" DROP CONSTRAINT "FK_173f9b02d87defc0877f3f77f21"`,
    );
    await queryRunner.query(
      `ALTER TABLE "deadlines" DROP CONSTRAINT "FK_8c948d56483bd57b518c8904c1f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "deadlines" DROP CONSTRAINT "FK_3a141eb795bdba333a1f3b4eb77"`,
    );
    await queryRunner.query(
      `ALTER TABLE "requirements" DROP CONSTRAINT "FK_313b241ad406d1daa18ae856482"`,
    );
    await queryRunner.query(
      `ALTER TABLE "requirements" DROP CONSTRAINT "FK_142d4c8e20df55f9365094aeb8d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "opportunity_sources" DROP CONSTRAINT "FK_9bc1950b56207ecffbfa64e7d3a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_journeys" DROP CONSTRAINT "FK_178535e7a159b5f9c06d190418f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_journeys" DROP CONSTRAINT "FK_bcd61395942c3dd3cd7ff23e1f1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_journeys" DROP CONSTRAINT "FK_95d831c9f7528ee595100646083"`,
    );
    await queryRunner.query(
      `ALTER TABLE "programmes" DROP CONSTRAINT "FK_aedd6d6184e8f16e6328d71ed6f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" DROP CONSTRAINT "FK_85bb251d329c62799e477bc9058"`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" DROP CONSTRAINT "FK_888a4852e27627d1ebd8a094e98"`,
    );
    await queryRunner.query(
      `ALTER TABLE "applicant_profiles" DROP CONSTRAINT "FK_bd8d1ba3584e92ad7066a14f34a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_sessions" DROP CONSTRAINT "FK_a7ab4fd82c654c85b9de53d971a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e59c64a05e73b0ff02eb72206b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e998b20a18684ad24eb9b5f44f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_abb18969c2d02905658dbb9916"`,
    );
    await queryRunner.query(`DROP TABLE "tasks"`);
    await queryRunner.query(`DROP TYPE "public"."tasks_dependency_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."tasks_priority_enum"`);
    await queryRunner.query(`DROP TYPE "public"."tasks_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_70ea0fea3f4ca26cbc2cfa21a8"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a61d3a7cb220083cfec35f20ec"`,
    );
    await queryRunner.query(`DROP TABLE "applications"`);
    await queryRunner.query(`DROP TYPE "public"."applications_status_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."applications_application_type_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f06909049cf73f9c9ff6ac7e58"`,
    );
    await queryRunner.query(`DROP TABLE "application_snapshots"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_728d97b7efa81eb4b8686945a1"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9ad8ab815e842d67e9aaec900c"`,
    );
    await queryRunner.query(`DROP TABLE "application_documents"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bf0752deef658d180e23c47403"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a336383efdef800f3bb7e6011b"`,
    );
    await queryRunner.query(`DROP TABLE "opportunities"`);
    await queryRunner.query(
      `DROP TYPE "public"."opportunities_study_level_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."opportunities_opportunity_type_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_199ffdeee8699daf76230b49e8"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_173f9b02d87defc0877f3f77f2"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8c948d56483bd57b518c8904c1"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3a141eb795bdba333a1f3b4eb7"`,
    );
    await queryRunner.query(`DROP TABLE "deadlines"`);
    await queryRunner.query(`DROP TYPE "public"."deadlines_status_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."deadlines_deadline_type_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_313b241ad406d1daa18ae85648"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_142d4c8e20df55f9365094aeb8"`,
    );
    await queryRunner.query(`DROP TABLE "requirements"`);
    await queryRunner.query(`DROP TYPE "public"."requirements_status_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."requirements_requirement_type_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9bc1950b56207ecffbfa64e7d3"`,
    );
    await queryRunner.query(`DROP TABLE "opportunity_sources"`);
    await queryRunner.query(
      `DROP TYPE "public"."opportunity_sources_authority_level_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."opportunity_sources_source_type_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_178535e7a159b5f9c06d190418"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bcd61395942c3dd3cd7ff23e1f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_95d831c9f7528ee59510064608"`,
    );
    await queryRunner.query(`DROP TABLE "application_journeys"`);
    await queryRunner.query(
      `DROP TYPE "public"."application_journeys_status_enum"`,
    );
    await queryRunner.query(`DROP TABLE "universities"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_aedd6d6184e8f16e6328d71ed6"`,
    );
    await queryRunner.query(`DROP TABLE "programmes"`);
    await queryRunner.query(`DROP TYPE "public"."programmes_study_level_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_888a4852e27627d1ebd8a094e9"`,
    );
    await queryRunner.query(`DROP TABLE "documents"`);
    await queryRunner.query(
      `DROP TYPE "public"."documents_document_type_enum"`,
    );
    await queryRunner.query(`DROP TABLE "applicant_profiles"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d76f5941d821678137ef15d965"`,
    );
    await queryRunner.query(`DROP TABLE "refresh_sessions"`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS "uuid-ossp"`);
  }
}
