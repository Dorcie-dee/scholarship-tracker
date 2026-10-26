import { Schema, model, models, Types } from 'mongoose';
import { baseSchemaOptions } from '../lib/schema-utils';

export interface ApplicantProfileDoc {
  userId: Types.ObjectId;
  nationality: string | null;
  dateOfBirth: string | null;
  summary: string | null;
  /** { institution, degree, field, startDate, endDate, gpa? }[] */
  education: Record<string, unknown>[];
  /** { organisation, role, startDate, endDate, description? }[] */
  experience: Record<string, unknown>[];
  /** plain skill strings or { name, level? }[] */
  skills: Record<string, unknown>[];
  /** { name, issuer, date? }[] */
  certifications: Record<string, unknown>[];
  /** { language, proficiency, testType?, score? }[] */
  languages: Record<string, unknown>[];
  metadata: Record<string, unknown>;
}

// Not constrained to `Schema<ApplicantProfileDoc>` here — mongoose@8's TS
// generics have no accepted `type:` form for a plain "array of Mixed" field
// (only a bare `Mixed` or an array of nested Schemas) once the Schema is
// pinned to an explicit DocType. The `model<ApplicantProfileDoc>()` call
// below still gives every consumer a fully-typed model; this is a types-only
// workaround; the runtime schema is unaffected.
const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    nationality: { type: String, default: null },
    dateOfBirth: { type: String, default: null },
    summary: { type: String, default: null },
    education: { type: [Schema.Types.Mixed], default: [] },
    experience: { type: [Schema.Types.Mixed], default: [] },
    skills: { type: [Schema.Types.Mixed], default: [] },
    certifications: { type: [Schema.Types.Mixed], default: [] },
    languages: { type: [Schema.Types.Mixed], default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  baseSchemaOptions,
);

export const ApplicantProfile =
  models.ApplicantProfile || model<ApplicantProfileDoc>('ApplicantProfile', schema);
