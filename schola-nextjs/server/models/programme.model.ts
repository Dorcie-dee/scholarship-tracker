import { Schema, model, models, Types } from 'mongoose';
import { StudyLevel } from '../lib/enums';
import { baseSchemaOptions } from '../lib/schema-utils';

/** Personal workspace data — see `university.model.ts`'s doc comment. */
export interface ProgrammeDoc {
  ownerId: Types.ObjectId;
  universityId: Types.ObjectId;
  name: string;
  /** `normalizeName(name)` — backing field for the `{ ownerId, universityId, normalizedName }` unique index below. */
  normalizedName: string;
  studyLevel: StudyLevel | null;
  field: string | null;
  duration: string | null;
  website: string | null;
  notes: string | null;
}

const schema = new Schema<ProgrammeDoc>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    universityId: { type: Schema.Types.ObjectId, ref: 'University', required: true, index: true },
    name: { type: String, required: true },
    normalizedName: { type: String, required: true },
    studyLevel: { type: String, enum: Object.values(StudyLevel), default: null },
    field: { type: String, default: null },
    duration: { type: String, default: null },
    website: { type: String, default: null },
    notes: { type: String, default: null },
  },
  {
    ...baseSchemaOptions,
    // See university.model.ts's doc comment on `autoIndex: false` — same
    // reasoning applies here for the unique index below.
    autoIndex: false,
  },
);

schema.index({ ownerId: 1, name: 1, _id: 1 });

/** The actual dedup constraint, scoped per university — see `university.model.ts`'s equivalent index doc comment. */
schema.index({ ownerId: 1, universityId: 1, normalizedName: 1 }, { unique: true });

export const Programme = models.Programme || model<ProgrammeDoc>('Programme', schema);
