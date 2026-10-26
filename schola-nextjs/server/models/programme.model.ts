import { Schema, model, models, Types } from 'mongoose';
import { StudyLevel } from '../lib/enums';
import { baseSchemaOptions } from '../lib/schema-utils';

export interface ProgrammeDoc {
  universityId: Types.ObjectId;
  name: string;
  studyLevel: StudyLevel | null;
  field: string | null;
  duration: string | null;
  website: string | null;
  notes: string | null;
}

const schema = new Schema<ProgrammeDoc>(
  {
    universityId: { type: Schema.Types.ObjectId, ref: 'University', required: true, index: true },
    name: { type: String, required: true },
    studyLevel: { type: String, enum: Object.values(StudyLevel), default: null },
    field: { type: String, default: null },
    duration: { type: String, default: null },
    website: { type: String, default: null },
    notes: { type: String, default: null },
  },
  baseSchemaOptions,
);

schema.index({ name: 1, _id: 1 });

export const Programme = models.Programme || model<ProgrammeDoc>('Programme', schema);
