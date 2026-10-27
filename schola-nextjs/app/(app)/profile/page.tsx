'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError, friendlyErrorMessage } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FieldError, Input, Label, Textarea } from '@/components/ui/form';
import {
  ApplicationsIcon,
  BookmarkIcon,
  FileIcon,
  GlobeIcon,
  PencilIcon,
  SparklesIcon,
} from '@/components/icons';
import { ListSection, type SectionField } from './list-section';
import {
  normalizeCertification,
  normalizeEducation,
  normalizeExperience,
  normalizeLanguage,
  normalizeSkill,
  profileCompleteness,
  type ApplicantProfile,
  type CertificationItem,
  type EducationItem,
  type ExperienceItem,
  type LanguageItem,
  type SkillItem,
} from './types';

function initials(name: string | null, email: string): string {
  const source = (name ?? email).trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

const EDUCATION_FIELDS: SectionField<EducationItem>[] = [
  { key: 'institution', label: 'Institution', required: true, placeholder: 'University of Ghana' },
  { key: 'degree', label: 'Degree', required: true, placeholder: 'BSc Computer Science' },
  { key: 'field', label: 'Field of study', placeholder: 'Computer Science' },
  { key: 'startDate', label: 'Start date', type: 'date' },
  { key: 'endDate', label: 'End date', type: 'date' },
  { key: 'gpa', label: 'GPA (optional)', placeholder: '3.8' },
];

const EXPERIENCE_FIELDS: SectionField<ExperienceItem>[] = [
  { key: 'organisation', label: 'Organisation', required: true, placeholder: 'Acme Corp' },
  { key: 'role', label: 'Role', required: true, placeholder: 'Research Assistant' },
  { key: 'startDate', label: 'Start date', type: 'date' },
  { key: 'endDate', label: 'End date', type: 'date' },
  { key: 'description', label: 'Description (optional)', type: 'textarea', placeholder: 'What you did and achieved' },
];

const SKILL_FIELDS: SectionField<SkillItem>[] = [
  { key: 'name', label: 'Skill', required: true, placeholder: 'Data analysis' },
  { key: 'level', label: 'Level (optional)', placeholder: 'Advanced' },
];

const LANGUAGE_FIELDS: SectionField<LanguageItem>[] = [
  { key: 'language', label: 'Language', required: true, placeholder: 'French' },
  { key: 'proficiency', label: 'Proficiency', required: true, placeholder: 'Fluent' },
  { key: 'testType', label: 'Test (optional)', placeholder: 'IELTS' },
  { key: 'score', label: 'Score (optional)', placeholder: '7.5' },
];

const CERTIFICATION_FIELDS: SectionField<CertificationItem>[] = [
  { key: 'name', label: 'Certification', required: true, placeholder: 'Project Management Professional' },
  { key: 'issuer', label: 'Issuer', required: true, placeholder: 'PMI' },
  { key: 'date', label: 'Date (optional)', type: 'date' },
];

export default function ProfilePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: () => apiFetch<ApplicantProfile>('/profile'),
    retry: (failureCount, err) => err instanceof ApiError && err.statusCode === 404 ? false : failureCount < 1,
  });

  const [patchError, setPatchError] = useState<string | null>(null);

  const patchMutation = useMutation({
    mutationFn: (patch: Partial<ApplicantProfile>) => apiFetch<ApplicantProfile>('/profile', { method: 'PATCH', body: patch }),
    onMutate: () => setPatchError(null),
    onSuccess: (updated) => queryClient.setQueryData(['profile'], updated),
    onError: (err) => setPatchError(friendlyErrorMessage(err)),
  });

  const [editingAbout, setEditingAbout] = useState(false);
  const [aboutDraft, setAboutDraft] = useState({ nationality: '', dateOfBirth: '', summary: '' });

  function startEditAbout(profile: ApplicantProfile) {
    setAboutDraft({
      nationality: profile.nationality ?? '',
      dateOfBirth: profile.dateOfBirth ?? '',
      summary: profile.summary ?? '',
    });
    setEditingAbout(true);
  }

  function saveAbout() {
    patchMutation.mutate(
      {
        nationality: aboutDraft.nationality,
        dateOfBirth: aboutDraft.dateOfBirth,
        summary: aboutDraft.summary,
      },
      { onSuccess: () => setEditingAbout(false) },
    );
  }

  if (profileQuery.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-primary"
          role="status"
          aria-label="Loading profile"
        />
      </div>
    );
  }

  const is404 = profileQuery.error instanceof ApiError && profileQuery.error.statusCode === 404;

  if (profileQuery.isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Card className="p-6 text-center">
          <h1 className="font-display text-xl font-semibold text-ink">
            {is404 ? "We can't find your profile yet" : "We couldn't load your profile"}
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            {is404
              ? "Your applicant profile hasn't been set up. Try refreshing, or contact support if this keeps happening."
              : friendlyErrorMessage(profileQuery.error)}
          </p>
          <Button className="mt-4" onClick={() => profileQuery.refetch()}>
            Try again
          </Button>
        </Card>
      </div>
    );
  }

  const profile = profileQuery.data!;
  const completeness = profileCompleteness(profile);
  const education = profile.education.map(normalizeEducation);
  const experience = profile.experience.map(normalizeExperience);
  const skills = profile.skills.map(normalizeSkill);
  const languages = profile.languages.map(normalizeLanguage);
  const certifications = profile.certifications.map(normalizeCertification);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Profile</h1>
          <p className="mt-1.5 max-w-xl text-sm text-ink-soft">
            Keep this up to date — it powers your AI requirement suggestions, which check your applications'
            requirements against what's here.
          </p>
        </div>
        <Link href="/settings" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
          Account settings
        </Link>
      </div>

      {/* Summary card */}
      <Card className="mt-6 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-accent-soft text-lg font-bold text-accent">
              {user ? initials(user.name, user.email) : '··'}
            </span>
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">{user?.name || 'Your profile'}</h2>
              <p className="text-sm text-ink-soft">{profile.nationality || 'Nationality not set'}</p>
            </div>
          </div>
          {!editingAbout && (
            <button
              type="button"
              onClick={() => startEditAbout(profile)}
              aria-label="Edit profile summary"
              className="flex h-8 w-8 flex-none items-center justify-center rounded-md text-ink-faint hover:bg-line-soft hover:text-ink"
            >
              <PencilIcon size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs font-semibold text-ink-soft">
            <span>Profile completeness</span>
            <span>
              {completeness.filled} of {completeness.total}
            </span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-line-soft">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${completeness.percent}%` }}
              role="progressbar"
              aria-valuenow={completeness.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Profile completeness"
            />
          </div>
        </div>

        {editingAbout ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveAbout();
            }}
            className="mt-5 flex flex-col gap-3 border-t border-line pt-4"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="nationality">Nationality</Label>
                <Input
                  id="nationality"
                  value={aboutDraft.nationality}
                  placeholder="e.g. Ghanaian"
                  onChange={(e) => setAboutDraft({ ...aboutDraft, nationality: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="dateOfBirth">Date of birth</Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={aboutDraft.dateOfBirth}
                  onChange={(e) => setAboutDraft({ ...aboutDraft, dateOfBirth: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="summary">Short summary</Label>
              <Textarea
                id="summary"
                value={aboutDraft.summary}
                placeholder="A couple of sentences about your background and goals"
                onChange={(e) => setAboutDraft({ ...aboutDraft, summary: e.target.value })}
              />
            </div>
            <FieldError>{patchError}</FieldError>
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={patchMutation.isPending}>
                {patchMutation.isPending ? 'Saving…' : 'Save'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setEditingAbout(false)}
                disabled={patchMutation.isPending}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <p className="mt-4 border-t border-line pt-4 text-sm text-ink-soft">
            {profile.summary || 'No summary yet — add a couple of sentences about your background and goals.'}
          </p>
        )}
      </Card>

      {patchError && !editingAbout && (
        <p className="mt-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-medium text-danger" role="alert">
          {patchError}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-6">
        <ListSection
          title="Education"
          description="Schools, degrees, and fields of study."
          icon={FileIcon}
          items={education}
          fields={EDUCATION_FIELDS}
          emptyItem={{ institution: '', degree: '', field: '', startDate: '', endDate: '' }}
          saving={patchMutation.isPending}
          onSave={(next) => patchMutation.mutate({ education: next })}
          addLabel="Add education"
          emptyLabel="No education added yet."
          renderSummary={(item) => ({
            primary: [item.degree, item.institution].filter(Boolean).join(' · '),
            secondary: [item.field, [item.startDate, item.endDate].filter(Boolean).join(' – ')]
              .filter(Boolean)
              .join(' · '),
          })}
        />

        <ListSection
          title="Experience"
          description="Work, research, or volunteer experience."
          icon={ApplicationsIcon}
          items={experience}
          fields={EXPERIENCE_FIELDS}
          emptyItem={{ organisation: '', role: '', startDate: '', endDate: '' }}
          saving={patchMutation.isPending}
          onSave={(next) => patchMutation.mutate({ experience: next })}
          addLabel="Add experience"
          emptyLabel="No experience added yet."
          renderSummary={(item) => ({
            primary: [item.role, item.organisation].filter(Boolean).join(' · '),
            secondary: [item.startDate, item.endDate].filter(Boolean).join(' – '),
          })}
        />

        <ListSection
          title="Skills"
          description="What you're good at — technical or otherwise."
          icon={SparklesIcon}
          items={skills}
          fields={SKILL_FIELDS}
          emptyItem={{ name: '' }}
          saving={patchMutation.isPending}
          onSave={(next) => patchMutation.mutate({ skills: next })}
          addLabel="Add skill"
          emptyLabel="No skills added yet."
          renderSummary={(item) => ({ primary: item.name, secondary: item.level })}
        />

        <ListSection
          title="Languages"
          description="Languages you speak and your proficiency."
          icon={GlobeIcon}
          items={languages}
          fields={LANGUAGE_FIELDS}
          emptyItem={{ language: '', proficiency: '' }}
          saving={patchMutation.isPending}
          onSave={(next) => patchMutation.mutate({ languages: next })}
          addLabel="Add language"
          emptyLabel="No languages added yet."
          renderSummary={(item) => ({
            primary: [item.language, item.proficiency].filter(Boolean).join(' · '),
            secondary: [item.testType, item.score].filter(Boolean).join(' '),
          })}
        />

        <ListSection
          title="Certifications"
          description="Certificates, licenses, and credentials."
          icon={BookmarkIcon}
          items={certifications}
          fields={CERTIFICATION_FIELDS}
          emptyItem={{ name: '', issuer: '' }}
          saving={patchMutation.isPending}
          onSave={(next) => patchMutation.mutate({ certifications: next })}
          addLabel="Add certification"
          emptyLabel="No certifications added yet."
          renderSummary={(item) => ({
            primary: [item.name, item.issuer].filter(Boolean).join(' · '),
            secondary: item.date,
          })}
        />
      </div>
    </div>
  );
}
