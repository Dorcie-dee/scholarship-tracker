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
  JourneyStatus,
  StudyLevel,
  TaskDependencyType,
  TaskPriority,
  TaskStatus,
} from '@/lib/shared-types';

export interface University {
  id: string;
  name: string;
  country: string | null;
  website: string | null;
}

export interface Programme {
  id: string;
  universityId: string;
  name: string;
  studyLevel: StudyLevel | null;
  field: string | null;
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

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  completedAt: string | null;
  journeyId: string | null;
  applicationId: string | null;
  requirementId: string | null;
  dependsOnTaskId: string | null;
  dependencyType: TaskDependencyType | null;
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
}

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
  timestamp: string;
}
