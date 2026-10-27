/**
 * Local types for the applicant profile. The backend stores `education` /
 * `experience` / `skills` / `certifications` / `languages` as loosely-typed
 * "record" arrays (Mongoose `Mixed`, see `server/models/applicant-profile.model.ts`'s
 * doc comment) — this file pins down the specific keys this UI reads/writes
 * for each, matching that model comment exactly.
 */

export interface ApplicantProfile {
  id: string;
  userId: string;
  nationality: string | null;
  dateOfBirth: string | null;
  summary: string | null;
  /** Raw loosely-typed arrays as stored by the backend — normalize with `normalizeEducation` etc before rendering. */
  education: Record<string, unknown>[];
  experience: Record<string, unknown>[];
  skills: unknown[];
  certifications: Record<string, unknown>[];
  languages: Record<string, unknown>[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * `{ institution, degree, field, startDate, endDate, gpa? }[]` per the model
 * comment. The index signature keeps this directly assignable back to the
 * backend's `Record<string, unknown>[]` field on PATCH without a cast.
 */
export interface EducationItem {
  [key: string]: unknown;
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  gpa?: string;
}

/** `{ organisation, role, startDate, endDate, description? }[]` per the model comment. */
export interface ExperienceItem {
  [key: string]: unknown;
  organisation: string;
  role: string;
  startDate: string;
  endDate: string;
  description?: string;
}

/**
 * The model comment allows either "plain skill strings or `{ name, level? }[]`".
 * This UI always *writes* the object form, but `normalizeSkill` below reads
 * either form back so existing plain-string data (if any) still renders.
 */
export interface SkillItem {
  [key: string]: unknown;
  name: string;
  level?: string;
}

/** `{ name, issuer, date? }[]` per the model comment. */
export interface CertificationItem {
  [key: string]: unknown;
  name: string;
  issuer: string;
  date?: string;
}

/** `{ language, proficiency, testType?, score? }[]` per the model comment. */
export interface LanguageItem {
  [key: string]: unknown;
  language: string;
  proficiency: string;
  testType?: string;
  score?: string;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function strOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function normalizeEducation(raw: Record<string, unknown>): EducationItem {
  return {
    institution: str(raw.institution),
    degree: str(raw.degree),
    field: str(raw.field),
    startDate: str(raw.startDate),
    endDate: str(raw.endDate),
    gpa: strOrUndefined(raw.gpa),
  };
}

export function normalizeExperience(raw: Record<string, unknown>): ExperienceItem {
  return {
    organisation: str(raw.organisation),
    role: str(raw.role),
    startDate: str(raw.startDate),
    endDate: str(raw.endDate),
    description: strOrUndefined(raw.description),
  };
}

/** Accepts either a plain string entry or `{ name, level? }` from existing data. */
export function normalizeSkill(raw: unknown): SkillItem {
  if (typeof raw === 'string') return { name: raw };
  const obj = (raw ?? {}) as Record<string, unknown>;
  return { name: str(obj.name), level: strOrUndefined(obj.level) };
}

export function normalizeCertification(raw: Record<string, unknown>): CertificationItem {
  return {
    name: str(raw.name),
    issuer: str(raw.issuer),
    date: strOrUndefined(raw.date),
  };
}

export function normalizeLanguage(raw: Record<string, unknown>): LanguageItem {
  return {
    language: str(raw.language),
    proficiency: str(raw.proficiency),
    testType: strOrUndefined(raw.testType),
    score: strOrUndefined(raw.score),
  };
}

/**
 * Client-side "how complete is this profile" estimate — purely a UX nudge,
 * not persisted anywhere. Counts 8 equally-weighted signals: 3 scalar fields
 * (nationality, dateOfBirth, summary) plus "has at least one entry" for each
 * of the 5 list sections. Simple and legible over a weighted scheme since
 * there's no backend signal for which fields actually matter more.
 */
export function profileCompleteness(profile: ApplicantProfile): { filled: number; total: number; percent: number } {
  const checks = [
    Boolean(profile.nationality),
    Boolean(profile.dateOfBirth),
    Boolean(profile.summary),
    profile.education.length > 0,
    profile.experience.length > 0,
    profile.skills.length > 0,
    profile.languages.length > 0,
    profile.certifications.length > 0,
  ];
  const filled = checks.filter(Boolean).length;
  const total = checks.length;
  return { filled, total, percent: Math.round((filled / total) * 100) };
}
