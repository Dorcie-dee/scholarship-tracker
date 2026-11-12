import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { University } from '../../models/university.model';
import { paginate } from '../pagination';
import { withTransaction } from '../db';
import { assertNotRateLimited } from '../rate-limit';
import { TooManyRequestsError } from '../http-errors';
import { normalizeName } from '../normalize-name';

const ownerId = new Types.ObjectId();

describe('scaffold smoke test', () => {
  it('creates a document and reads it back with id (not _id)', async () => {
    const doc = await University.create({
      ownerId,
      name: 'University of Twente',
      normalizedName: normalizeName('University of Twente'),
      country: 'Netherlands',
    });
    const json = doc.toJSON();
    expect(json.id).toBeTypeOf('string');
    expect((json as Record<string, unknown>)._id).toBeUndefined();
  });

  it('paginates with a keyset cursor across two pages', async () => {
    for (let i = 0; i < 5; i++) {
      await University.create({ ownerId, name: `Uni ${i}`, normalizedName: normalizeName(`Uni ${i}`) });
    }
    const page1 = await paginate(University, { sortField: 'name', sortOrder: 'asc', limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.hasNextPage).toBe(true);
    expect(page1.nextCursor).toBeTypeOf('string');

    const page2 = await paginate(University, {
      sortField: 'name',
      sortOrder: 'asc',
      limit: 2,
      cursor: page1.nextCursor,
    });
    expect(page2.items).toHaveLength(2);
    const page1Names = page1.items.map((d) => d.name);
    const page2Names = page2.items.map((d) => d.name);
    expect(page1Names).not.toEqual(expect.arrayContaining(page2Names));
  });

  it('commits a multi-document transaction atomically', async () => {
    await withTransaction(async (session) => {
      await University.create([{ ownerId, name: 'Txn University A', normalizedName: normalizeName('Txn University A') }], { session });
      await University.create([{ ownerId, name: 'Txn University B', normalizedName: normalizeName('Txn University B') }], { session });
    });
    const count = await University.countDocuments({ name: /^Txn University/ });
    expect(count).toBe(2);
  });

  it('rate limiter blocks after the configured max within a window', async () => {
    const key = 'smoke-test-key';
    await assertNotRateLimited(key, { max: 2, windowSeconds: 60 });
    await assertNotRateLimited(key, { max: 2, windowSeconds: 60 });
    await expect(assertNotRateLimited(key, { max: 2, windowSeconds: 60 })).rejects.toThrow(
      TooManyRequestsError,
    );
  });
});
