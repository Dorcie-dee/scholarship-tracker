/**
 * Domain enums + auth response shapes.
 *
 * IMPORTANT: this file is intentionally duplicated between `backend/` and
 * `frontend/` (see `frontend/src/lib/shared-types.ts`) rather than living in a
 * shared workspace package — backend and frontend are independent repos on
 * purpose (see docs/decisions.md, "Repo layout"). That means THIS FILE MUST BE
 * KEPT MANUALLY IN SYNC with its frontend counterpart whenever either changes;
 * nothing enforces that automatically. Keep both in sync with
 * docs/domain-model.md too.
 */

/** Lifecycle status of an ApplicationJourney (the overarching goal). */
export enum JourneyStatus {
  PLANNING = 'planning',
  ACTIVE = 'active',
  ON_HOLD = 'on_hold',
  COMPLETED = 'completed',
  ABANDONED = 'abandoned',
}

/** What kind of concrete process an Application represents. */
export enum ApplicationType {
  ADMISSION = 'admission',
  UNIVERSITY_SCHOLARSHIP = 'university_scholarship',
  EXTERNAL_SCHOLARSHIP = 'external_scholarship',
  OTHER_FUNDING = 'other_funding',
  OTHER = 'other',
}

/** Lifecycle status of an individual Application. */
export enum ApplicationStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  INTERVIEW = 'interview',
  OFFER = 'offer',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn',
}

/** The category of a Requirement. */
export enum RequirementType {
  NATIONALITY = 'nationality',
  ACADEMIC = 'academic',
  GPA = 'gpa',
  DEGREE = 'degree',
  LANGUAGE = 'language',
  WORK_EXPERIENCE = 'work_experience',
  DOCUMENT = 'document',
  RECOMMENDATION = 'recommendation',
  INTERVIEW = 'interview',
  APPLICATION_PORTAL = 'application_portal',
  OTHER = 'other',
}

/**
 * Whether/how a Requirement has been satisfied. AI-driven states
 * (PROFILE_MATCH, AI_ASSESSMENT) are part of the vocabulary now so the schema
 * doesn't need to change later, but nothing in this phase writes them —
 * see docs/decisions.md ("No AI yet").
 */
export enum RequirementStatus {
  UNKNOWN = 'unknown',
  CONFIRMED = 'confirmed',
  PROFILE_MATCH = 'profile_match',
  AI_ASSESSMENT = 'ai_assessment',
  NEEDS_VERIFICATION = 'needs_verification',
  NOT_MET = 'not_met',
  NOT_APPLICABLE = 'not_applicable',
  CONDITIONAL = 'conditional',
}

/** The kind of date a Deadline/Milestone represents. */
export enum DeadlineType {
  OPENING_DATE = 'opening_date',
  UNIVERSITY_DEADLINE = 'university_deadline',
  SCHOLARSHIP_DEADLINE = 'scholarship_deadline',
  RECOMMENDATION_DEADLINE = 'recommendation_deadline',
  INTERVIEW = 'interview',
  EXPECTED_DECISION = 'expected_decision',
  PROGRAMME_START = 'programme_start',
  OTHER = 'other',
}

export enum DeadlineStatus {
  UPCOMING = 'upcoming',
  DUE_SOON = 'due_soon',
  PASSED = 'passed',
  MET = 'met',
  MISSED = 'missed',
  CANCELLED = 'cancelled',
}

export enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  BLOCKED = 'blocked',
  DONE = 'done',
  CANCELLED = 'cancelled',
}

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

/**
 * How a Task relates to another Task it is informationally linked to.
 * IMPORTANT: this is metadata only. Neither value ever technically blocks the
 * user from acting — see docs/decisions.md, "Dependencies never block the user".
 */
export enum TaskDependencyType {
  HARD = 'hard',
  SOFT = 'soft',
}

export enum DocumentType {
  CV = 'cv',
  SOP = 'sop',
  MOTIVATION_LETTER = 'motivation_letter',
  TRANSCRIPT = 'transcript',
  CERTIFICATE = 'certificate',
  RECOMMENDATION_LETTER = 'recommendation_letter',
  PASSPORT = 'passport',
  RESEARCH_PROPOSAL = 'research_proposal',
  WRITING_SAMPLE = 'writing_sample',
  OTHER = 'other',
}

export enum OpportunityType {
  SCHOLARSHIP = 'scholarship',
  GRANT = 'grant',
  FELLOWSHIP = 'fellowship',
  FUNDING = 'funding',
  OTHER = 'other',
}

export enum StudyLevel {
  UNDERGRADUATE = 'undergraduate',
  MASTERS = 'masters',
  PHD = 'phd',
  POSTDOC = 'postdoc',
  OTHER = 'other',
}

export enum OpportunitySourceType {
  OFFICIAL_UNIVERSITY_WEBSITE = 'official_university_website',
  SCHOLARSHIP_PROVIDER = 'scholarship_provider',
  NEWSLETTER = 'newsletter',
  SECONDARY_WEBSITE = 'secondary_website',
  UPLOADED_DOCUMENT = 'uploaded_document',
  FORWARDED_EMAIL = 'forwarded_email',
  MANUAL_ENTRY = 'manual_entry',
}

/** Rough trust level of an OpportunitySource, informational only. */
export enum SourceAuthorityLevel {
  OFFICIAL = 'official',
  VERIFIED_THIRD_PARTY = 'verified_third_party',
  UNVERIFIED = 'unverified',
}

/**
 * How an ApplicationSnapshot came to exist. Both values require an explicit
 * user action — nothing ever creates a snapshot automatically (see
 * docs/decisions.md, "Application Snapshot creation model").
 *
 * MANUAL = the user selected "Create Snapshot" directly.
 * SUGGESTED = a future intelligent-suggestion layer proposed creating a
 * snapshot and the user explicitly accepted that suggestion. Nothing in this
 * phase writes SUGGESTED — no suggestion layer exists yet — but the value is
 * defined now so the schema won't need to change when it does.
 */
export enum SnapshotCreatedVia {
  MANUAL = 'manual',
  SUGGESTED = 'suggested',
}

/**
 * Minimal V1 RBAC foundation (Track 1, Group B) — see docs/decisions.md,
 * "RBAC: a minimal foundation, not a permissions system". USER is the
 * default and only role registration can ever produce; ADMIN is required to
 * mutate shared catalog data (University/Programme/Opportunity — see
 * universities.controller.ts et al.). Deliberately just two values — not a
 * permission matrix, not resource-level roles. Extend later if a genuine
 * need for finer granularity appears; do not pre-build it now.
 */
export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

/**
 * Shared shapes for auth API responses. Kept intentionally small — these mirror
 * what the auth module actually returns, not a general auth SDK.
 */

/** Safe, public-facing user representation — never includes passwordHash. */
export interface SafeUser {
  id: string;
  email: string;
  name: string | null;
  isVerified: boolean;
  role: UserRole;
  createdAt: string;
}

/** Response body for register/login/refresh — the refresh token itself never appears here. */
export interface AuthTokenResponse {
  accessToken: string;
  accessTokenExpiresAt: string;
  user: SafeUser;
}
