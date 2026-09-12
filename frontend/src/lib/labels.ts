/**
 * Human-readable labels for domain enums — never show raw snake_case in the UI.
 */

import {
  ApplicationStatus,
  ApplicationType,
  DeadlineType,
  DocumentType,
  JourneyStatus,
  OpportunitySourceType,
  OpportunityType,
  RequirementStatus,
  RequirementType,
  SourceAuthorityLevel,
  StudyLevel,
  TaskDependencyType,
  TaskPriority,
  TaskStatus,
} from '@/lib/shared-types';

export function humanizeEnum(value: string): string {
  return value.replaceAll('_', ' ');
}

export const SOURCE_TYPE_LABELS: Record<OpportunitySourceType, string> = {
  [OpportunitySourceType.OFFICIAL_UNIVERSITY_WEBSITE]: 'Official university website',
  [OpportunitySourceType.SCHOLARSHIP_PROVIDER]: 'Scholarship provider site',
  [OpportunitySourceType.NEWSLETTER]: 'Newsletter',
  [OpportunitySourceType.SECONDARY_WEBSITE]: 'Article or other website',
  [OpportunitySourceType.UPLOADED_DOCUMENT]: 'Uploaded document',
  [OpportunitySourceType.FORWARDED_EMAIL]: 'Forwarded email',
  [OpportunitySourceType.MANUAL_ENTRY]: 'Manual notes',
};

export const SOURCE_TYPE_HINTS: Record<OpportunitySourceType, string> = {
  [OpportunitySourceType.OFFICIAL_UNIVERSITY_WEBSITE]:
    'Paste the university page URL and any key excerpt you want to keep.',
  [OpportunitySourceType.SCHOLARSHIP_PROVIDER]:
    'Paste the provider’s scholarship page and a short excerpt.',
  [OpportunitySourceType.NEWSLETTER]:
    'Note which newsletter it came from and paste the relevant section.',
  [OpportunitySourceType.SECONDARY_WEBSITE]:
    'Paste the article or listing URL and the useful excerpt.',
  [OpportunitySourceType.UPLOADED_DOCUMENT]:
    'Describe the document and paste any excerpt you captured from it.',
  [OpportunitySourceType.FORWARDED_EMAIL]:
    'Paste the useful part of the email — subject, sender, and key details.',
  [OpportunitySourceType.MANUAL_ENTRY]:
    'Write what you know in your own words. A link is optional.',
};

export const AUTHORITY_LABELS: Record<SourceAuthorityLevel, string> = {
  [SourceAuthorityLevel.OFFICIAL]: 'Official',
  [SourceAuthorityLevel.VERIFIED_THIRD_PARTY]: 'Verified third party',
  [SourceAuthorityLevel.UNVERIFIED]: 'Unverified',
};

export const CONTENT_ORIGIN_LABELS: Record<'manual' | 'fetched', string> = {
  manual: 'Typed by you',
  fetched: 'Fetched from URL',
};

export function enumOptions<T extends string>(
  values: readonly T[] | T[],
  labels?: Partial<Record<T, string>>,
): { value: T; label: string }[] {
  return values.map((value) => ({
    value,
    label: labels?.[value] ?? humanizeEnum(value),
  }));
}

export const STUDY_LEVEL_OPTIONS = enumOptions(Object.values(StudyLevel));
export const OPPORTUNITY_TYPE_OPTIONS = enumOptions(Object.values(OpportunityType));
export const APPLICATION_TYPE_OPTIONS = enumOptions(Object.values(ApplicationType));
export const APPLICATION_STATUS_OPTIONS = enumOptions(Object.values(ApplicationStatus));
export const JOURNEY_STATUS_OPTIONS = enumOptions(Object.values(JourneyStatus));
export const REQUIREMENT_TYPE_OPTIONS = enumOptions(Object.values(RequirementType));
export const REQUIREMENT_STATUS_OPTIONS = enumOptions(Object.values(RequirementStatus));
export const DEADLINE_TYPE_OPTIONS = enumOptions(Object.values(DeadlineType));
export const DOCUMENT_TYPE_OPTIONS = enumOptions(Object.values(DocumentType));
export const TASK_STATUS_OPTIONS = enumOptions(Object.values(TaskStatus));
export const TASK_PRIORITY_OPTIONS = enumOptions(Object.values(TaskPriority));
export const TASK_DEPENDENCY_OPTIONS = enumOptions(Object.values(TaskDependencyType));
export const SOURCE_TYPE_OPTIONS = enumOptions(
  Object.values(OpportunitySourceType),
  SOURCE_TYPE_LABELS,
);
export const AUTHORITY_OPTIONS = enumOptions(
  Object.values(SourceAuthorityLevel),
  AUTHORITY_LABELS,
);
