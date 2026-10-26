import mongoose from 'mongoose';
import { getConfig } from './config';

/**
 * Connection singleton, cached on `globalThis` — the standard Next.js +
 * Mongoose pattern. Without this, every route handler module reload in dev
 * (and every cold serverless invocation sharing a warm container) would open
 * a new connection, quickly exhausting Atlas's connection ceiling. One
 * connection (and one in-flight connect Promise, so concurrent callers
 * during startup await the same attempt rather than racing) per process.
 */
interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __scholaMongooseCache: MongooseCache | undefined;
}

const cache: MongooseCache = globalThis.__scholaMongooseCache ?? {
  conn: null,
  promise: null,
};
globalThis.__scholaMongooseCache = cache;

export async function connectToDatabase(): Promise<typeof mongoose> {
  // Always check the LIVE connection state rather than trusting a cached
  // reference blindly — it may be connected via some other path (e.g.
  // `server/lib/test-db.ts`'s direct `mongoose.connect()` against an
  // in-memory replica set in tests; mongoose's default connection is a
  // module-level singleton either way), or have gone stale after a
  // disconnect between test files sharing a worker process.
  if (mongoose.connection.readyState === 1) {
    cache.conn = mongoose;
    return mongoose;
  }
  cache.conn = null;

  if (!cache.promise) {
    const { mongodbUri, mongodbDbName } = getConfig();
    if (!mongodbUri) {
      throw new Error(
        'MONGODB_URI is not set. Copy .env.example to .env.local and fill it in (see "Database" section).',
      );
    }
    mongoose.set('strictQuery', true);
    cache.promise = mongoose
      .connect(mongodbUri, { dbName: mongodbDbName })
      .then((m) => m);
  }

  try {
    cache.conn = await cache.promise;
  } catch (err) {
    cache.promise = null;
    throw err;
  }
  return cache.conn;
}

/**
 * Runs `fn` inside a real MongoDB multi-document transaction (requires the
 * connection to be backed by a replica set — Atlas, or the in-memory replica
 * set `server/lib/test-db.ts` spins up for tests; see docs/decisions.md in
 * the original backend, "Connection pool sizing" and this project's own
 * README for why plain standalone MongoDB is not supported). Ported in place
 * of TypeORM's `dataSource.transaction()` calls throughout the original
 * services — every call site that used a Postgres transaction for atomicity
 * uses this instead.
 */
export async function withTransaction<T>(
  fn: (session: mongoose.ClientSession) => Promise<T>,
): Promise<T> {
  const conn = await connectToDatabase();
  const session = await conn.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
