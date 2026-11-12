/**
 * One-time, manually-run, idempotent backfill for University/Programme's
 * `normalizedName` field, and the deliberate, explicit point where the
 * `{ ownerId, normalizedName }` / `{ ownerId, universityId, normalizedName }`
 * unique indexes actually get created.
 *
 *   npx tsx server/scripts/backfill-normalized-names.ts
 *
 * WHY THIS EXISTS AS A SEPARATE, MANUAL STEP (not automatic on app startup):
 * both models declare `autoIndex: false` (see their model files' doc
 * comments) specifically so a unique index is never built implicitly
 * against a database that might have pre-existing documents without
 * `normalizedName`, or genuine name collisions that predate this feature.
 * Letting Mongoose auto-build a unique index under those conditions would
 * fail unpredictably at connect time — in dev or production alike. This
 * script is the only thing that builds those indexes, and only after it has
 * confirmed, by actually checking, that doing so is safe.
 *
 * SEQUENCE (strict order, both for University and for Programme):
 *   1. Connect.
 *   2. Compute and $set `normalizedName` on EVERY existing document — this
 *      is a plain field patch via `bulkWrite`, never full-document
 *      validation/`.save()`, so it can't be blocked by the model's own
 *      `required: true` on that same field. Always recomputed from the
 *      current `name`, so re-running this script is harmless.
 *   3. Detect collisions: any `(ownerId[, universityId], normalizedName)`
 *      group with more than one document. This can only happen for
 *      documents that existed before this feature shipped — the live
 *      service functions (`createUniversity`/`createProgramme`) can no
 *      longer produce one going forward (see their atomic-upsert doc
 *      comments).
 *   4a. If any collision is found: report every one of them in full
 *       (owner, the colliding normalized name, every document's id and
 *       current `name`) and STOP — do not create the index. This script
 *       never renames, merges, or deletes anything to force the index to
 *       build; a human has to look at the report and decide.
 *   4b. If zero collisions: create the two indexes (`createIndexes()` —
 *       never `syncIndexes()`, which would also drop any other index not
 *       declared on the schema; `createIndexes()` only adds what's missing)
 *       and report success.
 *
 * On a brand-new/empty database (the expected case for anyone deploying
 * this app for the first time) this is instant and trivially collision-free
 * — there is nothing to backfill and nothing that can collide.
 */
import { pathToFileURL } from 'node:url';
import { connectToDatabase } from '../lib/db';
import { University, type UniversityDoc } from '../models/university.model';
import { Programme, type ProgrammeDoc } from '../models/programme.model';
import { normalizeName } from '../lib/normalize-name';

export interface CollisionGroup {
  key: string;
  ids: string[];
  names: string[];
}

async function backfillNormalizedNames<T extends { _id: unknown; name: string }>(
  model: { find: (filter: object) => Promise<T[]>; bulkWrite: (ops: unknown[]) => Promise<unknown> },
  label: string,
): Promise<void> {
  const docs = await model.find({});
  if (docs.length === 0) {
    console.log(`[backfill] ${label}: no documents — nothing to backfill.`);
    return;
  }
  const ops = docs.map((doc) => ({
    updateOne: {
      filter: { _id: doc._id },
      update: { $set: { normalizedName: normalizeName(doc.name) } },
    },
  }));
  await model.bulkWrite(ops);
  console.log(`[backfill] ${label}: backfilled normalizedName on ${docs.length} document(s).`);
}

/** Groups by `groupKeyFields` (already-normalized string values) and returns every group with more than one member. */
function findCollisions<T extends { _id: unknown; ownerId: unknown; normalizedName: string; name: string }>(
  docs: T[],
  extraKey: (doc: T) => string,
): CollisionGroup[] {
  const groups = new Map<string, T[]>();
  for (const doc of docs) {
    const key = `${String(doc.ownerId)}::${extraKey(doc)}::${doc.normalizedName}`;
    const existing = groups.get(key);
    if (existing) existing.push(doc);
    else groups.set(key, [doc]);
  }
  const collisions: CollisionGroup[] = [];
  for (const [key, group] of groups) {
    if (group.length > 1) {
      collisions.push({
        key,
        ids: group.map((d) => String(d._id)),
        names: group.map((d) => d.name),
      });
    }
  }
  return collisions;
}

function reportCollisions(label: string, collisions: CollisionGroup[]): void {
  console.error(`[backfill] ${label}: found ${collisions.length} unresolved collision group(s). Index NOT created.`);
  for (const group of collisions) {
    console.error(`  - key=${group.key}`);
    for (let i = 0; i < group.ids.length; i += 1) {
      console.error(`      id=${group.ids[i]} name=${JSON.stringify(group.names[i])}`);
    }
  }
  console.error(
    `[backfill] ${label}: resolve manually (rename or remove one side of each group above) and re-run this script. Nothing was merged, renamed, or deleted automatically.`,
  );
}

export interface BackfillResult {
  universityCollisions: CollisionGroup[];
  programmeCollisions: CollisionGroup[];
}

/**
 * The actual backfill-then-conditionally-index logic, exported and
 * side-effect-free with respect to the process (no `console`-gated
 * `process.exit`) so it can be driven directly from a test against the
 * isolated in-memory replica set, exactly as `main()` below drives it
 * against a real connection. Assumes the caller has already connected.
 */
export async function runNormalizedNameBackfill(): Promise<BackfillResult> {
  await backfillNormalizedNames(University as unknown as Parameters<typeof backfillNormalizedNames>[0], 'University');
  await backfillNormalizedNames(Programme as unknown as Parameters<typeof backfillNormalizedNames>[0], 'Programme');

  const universities = await University.find({}).lean<Array<UniversityDoc & { _id: unknown }>>();
  const universityCollisions = findCollisions(universities, () => '');
  if (universityCollisions.length > 0) {
    reportCollisions('University', universityCollisions);
  } else {
    await University.createIndexes();
    console.log('[backfill] University: no collisions — unique index created (or already present).');
  }

  const programmes = await Programme.find({}).lean<Array<ProgrammeDoc & { _id: unknown }>>();
  const programmeCollisions = findCollisions(programmes, (p) => String(p.universityId));
  if (programmeCollisions.length > 0) {
    reportCollisions('Programme', programmeCollisions);
  } else {
    await Programme.createIndexes();
    console.log('[backfill] Programme: no collisions — unique index created (or already present).');
  }

  return { universityCollisions, programmeCollisions };
}

async function main(): Promise<void> {
  await connectToDatabase();
  const { universityCollisions, programmeCollisions } = await runNormalizedNameBackfill();
  if (universityCollisions.length > 0 || programmeCollisions.length > 0) {
    process.exitCode = 1;
  }
}

// Only auto-run when this file is the process's actual entry point (`npx
// tsx server/scripts/backfill-normalized-names.ts`) — never when imported,
// e.g. by this script's own test file, against the isolated test database.
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main()
    .then(() => process.exit(process.exitCode ?? 0))
    .catch((err) => {
      console.error('[backfill] Failed:', err);
      process.exit(1);
    });
}
