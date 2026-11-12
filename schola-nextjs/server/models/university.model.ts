import { Schema, model, models, Types } from 'mongoose';
import { baseSchemaOptions } from '../lib/schema-utils';

/**
 * Personal workspace data, not shared catalog — see `docs/decisions.md`,
 * "Catalog data vs. owned data (superseded)". Each user's University rows
 * are theirs alone, even if two users both add "University of Twente" —
 * this is a personal application tracker, not a shared/moderated directory.
 */
export interface UniversityDoc {
  ownerId: Types.ObjectId;
  name: string;
  /** `normalizeName(name)` — see that function's doc comment. Backing field for the `{ ownerId, normalizedName }` unique index below. */
  normalizedName: string;
  country: string | null;
  website: string | null;
  notes: string | null;
}

const schema = new Schema<UniversityDoc>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    normalizedName: { type: String, required: true },
    country: { type: String, default: null },
    website: { type: String, default: null },
    notes: { type: String, default: null },
  },
  {
    ...baseSchemaOptions,
    // `autoIndex: false` — this model's indexes (including the UNIQUE one
    // below) are never built implicitly on connect. A unique index on
    // `normalizedName` auto-building against a database that still has
    // pre-existing, not-yet-backfilled documents (or genuine collisions)
    // would fail unpredictably at connect time, in dev or production alike.
    // Indexes here are only ever created deliberately, by
    // `server/scripts/backfill-normalized-names.ts` after it confirms a
    // clean backfill with zero unresolved collisions — see that script's
    // doc comment — or by the test harness (`server/lib/test-db.ts`)
    // against a guaranteed-empty, freshly created database.
    autoIndex: false,
  },
);

// Default (no ?search=) keyset pagination sorts on (ownerId, name, _id) — every list is scoped by owner first.
schema.index({ ownerId: 1, name: 1, _id: 1 });

/**
 * The actual dedup constraint — see `universities.service.ts#createUniversity()`.
 * Deliberately on `normalizedName`, never on the raw `name`: "University of
 * Twente" and "university of twente " must collide, but "Univ. of Twente"
 * must not.
 */
schema.index({ ownerId: 1, normalizedName: 1 }, { unique: true });

export const University = models.University || model<UniversityDoc>('University', schema);
