import { beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { University } from '../../models/university.model';
import { Programme } from '../../models/programme.model';
import { runNormalizedNameBackfill } from '../backfill-normalized-names';

/**
 * Exercises the backfill script's actual logic against the real (in-memory
 * replica-set) test database — raw `collection.insertMany` is used to seed
 * documents the way a genuinely pre-existing, un-backfilled database would
 * have them (no `normalizedName`, inserted via the Mongoose collection
 * directly so the model's own `required: true` on that field can't get in
 * the way of setting up the scenario this script exists to handle).
 *
 * `vitest.setup.ts`'s `afterEach` clears documents but never drops indexes,
 * and this script's whole job is building an index that did NOT exist
 * before — so each test here explicitly drops both models' indexes first,
 * to start from a guaranteed "index not built yet" state regardless of
 * what an earlier test in this file already built.
 */
describe('runNormalizedNameBackfill', () => {
  beforeEach(async () => {
    await University.collection.dropIndexes().catch(() => undefined);
    await Programme.collection.dropIndexes().catch(() => undefined);
  });

  it('backfills normalizedName on pre-existing documents with none, and creates the indexes', async () => {
    const ownerId = new Types.ObjectId();
    await University.collection.insertMany([
      { ownerId, name: 'University of Twente', country: null, website: null, notes: null },
      { ownerId, name: 'Delft University of Technology', country: null, website: null, notes: null },
    ]);

    const result = await runNormalizedNameBackfill();

    expect(result.universityCollisions).toEqual([]);
    const docs = await University.find({ ownerId }).lean();
    expect(docs.map((d) => d.normalizedName).sort()).toEqual([
      'delft university of technology',
      'university of twente',
    ]);

    // The unique index now actually exists and is enforced.
    const indexes = await University.collection.indexes();
    const uniqueIndex = indexes.find((idx) => idx.key.ownerId === 1 && idx.key.normalizedName === 1);
    expect(uniqueIndex?.unique).toBe(true);
  });

  it('is idempotent — running it twice in a row is harmless', async () => {
    const ownerId = new Types.ObjectId();
    await University.collection.insertMany([{ ownerId, name: 'Repeat University' }]);

    await runNormalizedNameBackfill();
    const result = await runNormalizedNameBackfill();

    expect(result.universityCollisions).toEqual([]);
    expect(await University.countDocuments({ ownerId })).toBe(1);
  });

  it('detects a pre-existing University name collision, reports it, and does NOT create the index', async () => {
    const ownerId = new Types.ObjectId();
    // Two rows that will normalize to the exact same value — the kind of
    // pre-existing duplicate that could only have been created before this
    // feature's unique index existed.
    await University.collection.insertMany([
      { ownerId, name: 'University of Twente' },
      { ownerId, name: 'university of twente' },
    ]);

    const result = await runNormalizedNameBackfill();

    expect(result.universityCollisions).toHaveLength(1);
    expect(result.universityCollisions[0].names.sort()).toEqual(['University of Twente', 'university of twente']);

    // Collision handling never renames or deletes anything.
    const docs = await University.find({ ownerId }).lean();
    expect(docs.map((d) => d.name).sort()).toEqual(['University of Twente', 'university of twente']);
    expect(docs.every((d) => d.normalizedName === 'university of twente')).toBe(true);

    // And the index must not have been created while a collision is unresolved.
    const indexes = await University.collection.indexes();
    const uniqueIndex = indexes.find((idx) => idx.key.ownerId === 1 && idx.key.normalizedName === 1);
    expect(uniqueIndex).toBeUndefined();
  });

  it('does not let a University collision block an otherwise-clean Programme backfill, or vice versa', async () => {
    const ownerId = new Types.ObjectId();
    const uni = await University.create({
      ownerId,
      name: 'Clean University',
      normalizedName: 'clean university',
    });
    await University.collection.insertMany([
      { ownerId, name: 'Dup University' },
      { ownerId, name: 'dup university' },
    ]);
    await Programme.collection.insertMany([{ ownerId, universityId: uni._id, name: 'Clean Programme' }]);

    const result = await runNormalizedNameBackfill();

    expect(result.universityCollisions).toHaveLength(1);
    expect(result.programmeCollisions).toEqual([]);

    const programmeIndexes = await Programme.collection.indexes();
    const uniqueProgrammeIndex = programmeIndexes.find(
      (idx) => idx.key.ownerId === 1 && idx.key.universityId === 1 && idx.key.normalizedName === 1,
    );
    expect(uniqueProgrammeIndex?.unique).toBe(true);
  });

  it('scopes Programme collisions by universityId — the same name under two different universities is not a collision', async () => {
    const ownerId = new Types.ObjectId();
    const uniA = await University.create({ ownerId, name: 'University A', normalizedName: 'university a' });
    const uniB = await University.create({ ownerId, name: 'University B', normalizedName: 'university b' });
    await Programme.collection.insertMany([
      { ownerId, universityId: uniA._id, name: 'MSc Computer Science' },
      { ownerId, universityId: uniB._id, name: 'MSc Computer Science' },
    ]);

    const result = await runNormalizedNameBackfill();
    expect(result.programmeCollisions).toEqual([]);
  });
});
