import { Schema, model, models } from 'mongoose';
import { baseSchemaOptions } from '../lib/schema-utils';

export interface UniversityDoc {
  name: string;
  country: string | null;
  website: string | null;
  notes: string | null;
}

const schema = new Schema<UniversityDoc>(
  {
    name: { type: String, required: true },
    country: { type: String, default: null },
    website: { type: String, default: null },
    notes: { type: String, default: null },
  },
  baseSchemaOptions,
);

// Default (no ?search=) keyset pagination sorts on (name, _id).
schema.index({ name: 1, _id: 1 });

export const University = models.University || model<UniversityDoc>('University', schema);
