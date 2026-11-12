import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { University } from '../models/university.model';
import { Programme } from '../models/programme.model';

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

  // University/Programme declare `autoIndex: false` (see their model files'
  // doc comments) so their unique `normalizedName` index is never built
  // implicitly against a database that might have un-backfilled or
  // colliding data. A freshly created, empty in-memory database can never
  // have either problem, so building the indexes here — once, right after
  // connecting — is safe and is what lets the concurrency/duplicate-key
  // tests in `universities.service.test.ts`/`programmes.service.test.ts`
  // exercise a REAL unique-index violation rather than an untested no-op.
  await Promise.all([University.createIndexes(), Programme.createIndexes()]);
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
