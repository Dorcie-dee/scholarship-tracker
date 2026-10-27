/**
 * Local, frontend-only type + enum-value declarations for the Application
 * Detail page and its tabs. Mirrors `server/models/*` / `server/lib/enums.ts`
 * shapes (string `id`, not `_id` — see `server/lib/schema-utils.ts`'s
 * `toJSON` transform) without importing from `server/` — this frontend layer
 * stays decoupled from the backend the same way the rest of `app/` does.
 *
 * `app/lib/status.ts` already owns every *status* label/tone mapping
 * (`applicationStatusMeta`, `requirementStatusMeta`, etc.) — that file is the
 * single source of truth for those and is reused here, not duplicated. The
 * small label maps below cover *category* enums (requirement/deadline/
 * document "type") that `status.ts` deliberately doesn't include.
 */

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

export interface Application {
  id: string;
  journeyId: string;
  title: string;
  applicationType: string;
  status: string;
  opportunityId: string | null;
  startDate: string | null;
  submissionDate: string | null;
  portal: string | null;
  externalUrl: string | null;
  notes: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Opportunity {
  id: string;
  title: string;
  provider: string | null;
  universityId: string | null;
}

export interface University {
  id: string;
  name: string;
  country: string | null;
}

export interface Requirement {
  id: string;
  requirementType: string;
  description: string;
  status: string;
  opportunityId: string | null;
  applicationId: string | null;
  copiedFromRequirementId: string | null;
  notes: string | null;
  suggestedStatus: string | null;
  suggestedAt: string | null;
  suggestionRationale: string | null;
  suggestionSource: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  completedAt: string | null;
  applicationId: string | null;
  journeyId: string;
  requirementId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Deadline {
  id: string;
  label: string;
  deadlineType: string;
  date: string;
  status: string;
  opportunityId: string | null;
  applicationId: string | null;
  taskId: string | null;
  requirementId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentRecord {
  id: string;
  ownerId: string;
  title: string;
  documentType: string;
  version: number;
  previousVersionId: string | null;
  cloudinaryUrl: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  isCurrent: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationDocumentLink {
  id: string;
  applicationId: string;
  documentId: string;
  label: string | null;
  attachedAt: string;
  document: DocumentRecord | null;
}

export interface ApplicationSnapshot {
  id: string;
  applicationId: string;
  label: string | null;
  createdVia: string;
  data: {
    application?: { status?: string; title?: string; applicationType?: string };
    requirements?: Array<{ requirementId: string; status: string; description: string }>;
    documents?: Array<{ documentId: string; version: number | null }>;
  } & Record<string, unknown>;
  supersedesSnapshotId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Enum value lists (for <select> options) — mirrors server/lib/enums.ts.
// ---------------------------------------------------------------------------

export const APPLICATION_STATUS_VALUES = [
  'not_started',
  'in_progress',
  'submitted',
  'under_review',
  'interview',
  'offer',
  'accepted',
  'rejected',
  'withdrawn',
] as const;

export const APPLICATION_TYPE_VALUES = [
  'admission',
  'university_scholarship',
  'external_scholarship',
  'other_funding',
  'other',
] as const;

export const APPLICATION_TYPE_LABELS: Record<string, string> = {
  admission: 'Admission',
  university_scholarship: 'University scholarship',
  external_scholarship: 'External scholarship',
  other_funding: 'Other funding',
  other: 'Other',
};
export function applicationTypeLabel(type: string): string {
  return APPLICATION_TYPE_LABELS[type] ?? type;
}

export const REQUIREMENT_TYPE_VALUES = [
  'nationality',
  'academic',
  'gpa',
  'degree',
  'language',
  'work_experience',
  'document',
  'recommendation',
  'interview',
  'application_portal',
  'other',
] as const;

export const REQUIREMENT_TYPE_LABELS: Record<string, string> = {
  nationality: 'Nationality',
  academic: 'Academic background',
  gpa: 'GPA',
  degree: 'Degree',
  language: 'Language',
  work_experience: 'Work experience',
  document: 'Document',
  recommendation: 'Recommendation',
  interview: 'Interview',
  application_portal: 'Application portal',
  other: 'Other',
};
export function requirementTypeLabel(type: string): string {
  return REQUIREMENT_TYPE_LABELS[type] ?? type;
}

export const REQUIREMENT_STATUS_VALUES = [
  'unknown',
  'confirmed',
  'profile_match',
  'needs_verification',
  'not_met',
  'not_applicable',
  'conditional',
] as const;

/** Statuses the backend treats as authoritative/final — requesting a new AI suggestion is rejected while one of these is set. */
export const REQUIREMENT_AUTHORITATIVE_STATUSES = new Set(['confirmed', 'not_met', 'not_applicable']);

export const TASK_STATUS_VALUES = ['todo', 'in_progress', 'blocked', 'done', 'cancelled'] as const;
export const TASK_PRIORITY_VALUES = ['low', 'medium', 'high', 'urgent'] as const;

export const DEADLINE_TYPE_VALUES = [
  'opening_date',
  'university_deadline',
  'scholarship_deadline',
  'recommendation_deadline',
  'interview',
  'expected_decision',
  'programme_start',
  'other',
] as const;

export const DEADLINE_TYPE_LABELS: Record<string, string> = {
  opening_date: 'Opening date',
  university_deadline: 'University deadline',
  scholarship_deadline: 'Scholarship deadline',
  recommendation_deadline: 'Recommendation deadline',
  interview: 'Interview',
  expected_decision: 'Expected decision',
  programme_start: 'Programme start',
  other: 'Other',
};
export function deadlineTypeLabel(type: string): string {
  return DEADLINE_TYPE_LABELS[type] ?? type;
}

export const DEADLINE_STATUS_VALUES = ['upcoming', 'due_soon', 'passed', 'met', 'missed', 'cancelled'] as const;

export const DOCUMENT_TYPE_VALUES = [
  'cv',
  'sop',
  'motivation_letter',
  'transcript',
  'certificate',
  'recommendation_letter',
  'passport',
  'research_proposal',
  'writing_sample',
  'other',
] as const;

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  cv: 'CV / Résumé',
  sop: 'Statement of purpose',
  motivation_letter: 'Motivation letter',
  transcript: 'Transcript',
  certificate: 'Certificate',
  recommendation_letter: 'Recommendation letter',
  passport: 'Passport',
  research_proposal: 'Research proposal',
  writing_sample: 'Writing sample',
  other: 'Other',
};
export function documentTypeLabel(type: string): string {
  return DOCUMENT_TYPE_LABELS[type] ?? type;
}

/** "2.4 MB" / "180 KB" — for document file-size display. */
export function formatFileSize(bytes: number | null): string {
  if (bytes === null || Number.isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
