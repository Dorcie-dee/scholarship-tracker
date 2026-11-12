/**
 * Frontend-local shapes for API responses. Deliberately kept separate from
 * ./shared-types.ts: these mirror what the UI actually renders, not the full
 * backend entity — shared-types.ts holds only what both apps need identically
 * (enums, auth response shapes), duplicated manually with backend/src/types.ts
 * since the two apps are independent repos (see docs/decisions.md).
 */
import type {
  ApplicationStatus,
  ApplicationType,
  ContentOrigin,
  DeadlineStatus,
  DeadlineType,
  DocumentType,
  JourneyStatus,
  OpportunitySourceType,
  OpportunityType,
  RequirementStatus,
  RequirementSuggestionSource,
  RequirementType,
  SnapshotCreatedVia,
  SourceAuthorityLevel,
  StudyLevel,
  TaskDependencyType,
  TaskPriority,
  TaskStatus,
  UserRole,
} from '@/lib/shared-types';

/**
 * Every keyset-paginated list endpoint returns exactly this shape — never a
 * bare array (see docs/api-reference.md, "Pagination"). `cursor` is opaque;
 * never construct one by hand, only ever pass back a `nextCursor` this app
 * already received.
 */
export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

export interface University {
  id: string;
  name: string;
  country: string | null;
  website: string | null;
  notes: string | null;
  createdAt: string;
}

export interface Programme {
  id: string;
  universityId: string;
  name: string;
  studyLevel: StudyLevel | null;
  field: string | null;
  duration: string | null;
  website: string | null;
  notes: string | null;
  createdAt: string;
}

export interface Opportunity {
  id: string;
  title: string;
  provider: string | null;
  opportunityType: OpportunityType;
  country: string | null;
  fundingType: string | null;
  fundingAmount: string | null;
  currency: string | null;
  duration: string | null;
  studyLevel: StudyLevel | null;
  field: string | null;
  eligibilitySummary: string | null;
  applicationMethod: string | null;
  applicationUrl: string | null;
  universityId: string | null;
  programmeId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  /** Present on GET /opportunities/:id detail loads. */
  sources?: OpportunitySource[];
  requirements?: Requirement[];
  deadlines?: Deadline[];
}

export interface OpportunitySource {
  id: string;
  opportunityId: string;
  sourceType: OpportunitySourceType;
  sourceName: string | null;
  sourceUrl: string | null;
  capturedAt: string;
  publishedAt: string | null;
  extractedContent: string | null;
  authorityLevel: SourceAuthorityLevel;
  contentOrigin: ContentOrigin;
  notes: string | null;
}

export interface UrlFetchPreview {
  url: string;
  finalUrl: string;
  title: string | null;
  extractedContent: string;
  contentType: string | null;
}

export interface ApplicationJourney {
  id: string;
  title: string;
  goal: string | null;
  status: JourneyStatus;
  universityId: string | null;
  programmeId: string | null;
  university?: University | null;
  programme?: Programme | null;
  notes: string | null;
  createdAt: string;
}

export interface Application {
  id: string;
  journeyId: string;
  title: string;
  applicationType: ApplicationType;
  status: ApplicationStatus;
  opportunityId: string | null;
  startDate: string | null;
  submissionDate: string | null;
  portal: string | null;
  externalUrl: string | null;
  notes: string | null;
  createdAt: string;
}

export interface Requirement {
  id: string;
  requirementType: RequirementType;
  description: string;
  status: RequirementStatus;
  opportunityId: string | null;
  applicationId: string | null;
  copiedFromRequirementId: string | null;
  notes: string | null;
  suggestedStatus: RequirementStatus | null;
  suggestedAt: string | null;
  suggestionRationale: string | null;
  suggestionSource: RequirementSuggestionSource | null;
  createdAt: string;
}

export interface Deadline {
  id: string;
  label: string;
  deadlineType: DeadlineType;
  date: string;
  status: DeadlineStatus;
  opportunityId: string | null;
  applicationId: string | null;
  taskId: string | null;
  requirementId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  completedAt: string | null;
  journeyId: string;
  applicationId: string | null;
  requirementId: string | null;
  dependsOnTaskId: string | null;
  dependencyType: TaskDependencyType | null;
  createdAt: string;
}

export interface AppDocument {
  id: string;
  ownerId: string;
  title: string;
  documentType: DocumentType;
  version: number;
  previousVersionId: string | null;
  cloudinaryPublicId: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  isCurrent: boolean;
  notes: string | null;
  createdAt: string;
}

export interface SignedDownloadUrl {
  url: string;
  expiresInSeconds: number;
}

export interface ApplicationDocument {
  id: string;
  applicationId: string;
  documentId: string;
  document?: AppDocument;
  label: string | null;
  attachedAt: string;
}

export interface ApplicationSnapshot {
  id: string;
  applicationId: string;
  label: string | null;
  createdVia: SnapshotCreatedVia;
  data: Record<string, unknown>;
  supersedesSnapshotId: string | null;
  createdAt: string;
}

export interface ApplicantProfile {
  id: string;
  nationality: string | null;
  dateOfBirth: string | null;
  summary: string | null;
  education: Record<string, unknown>[];
  experience: Record<string, unknown>[];
  skills: Record<string, unknown>[];
  certifications: Record<string, unknown>[];
  languages: Record<string, unknown>[];
  metadata?: Record<string, unknown>;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
  timestamp: string;
  requestId: string | null;
}

/**
 * ADMIN directory row from GET /users — only the safe projection fields.
 * Explicit UI model: never render arbitrary backend objects.
 */
export interface AdminDirectoryUser {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  isVerified: boolean;
  createdAt: string;
}
