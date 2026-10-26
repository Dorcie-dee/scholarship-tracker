import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';

/**
 * Test-only: an ephemeral, single-node MongoDB **replica set** (not a plain
 * standalone instance) so transaction-dependent code (`withTransaction()` in
 * `./db.ts`) behaves identically to production Atlas. Used by vitest's setup
 * file — never imported from application code.
 */
let replSet: MongoMemoryReplSet | null = null;

export async function startTestDatabase(): Promise<void> {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replSet.getUri();
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { dbName: 'schola-test' });
}

export async function stopTestDatabase(): Promise<void> {
  await mongoose.disconnect();
  if (replSet) {
    await replSet.stop();
    replSet = null;
  }
}

export async function clearTestDatabase(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany({})),
  );
}
