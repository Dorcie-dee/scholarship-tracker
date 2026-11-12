import { Schema, model, models, type InferSchemaType } from 'mongoose';

/**
 * Backs both the per-route rate limiter and the account-scoped login
 * lockout (`server/lib/rate-limit.ts`) — a MongoDB-TTL-collection
 * replacement for the original NestJS backend's Redis-backed throttler
 * storage (`common/throttler/redis-throttler.storage.ts`) and
 * `login-guard.service.ts`. One instance per `key`; MongoDB's background TTL
 * sweep removes a counter once `resetAt` passes, which is exactly the
 * "self-recovering window" the original Redis `INCR` + `EXPIRE`-on-first-hit
 * pattern implemented — see this schema's `resetAt` TTL index below.
 */
const rateLimitCounterSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    count: { type: Number, required: true, default: 0 },
    resetAt: { type: Date, required: true },
  },
  { timestamps: false },
);

// expireAfterSeconds: 0 means "expire exactly at the stored Date", not 0s after insert.
rateLimitCounterSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });

export type RateLimitCounterDoc = InferSchemaType<typeof rateLimitCounterSchema>;

export const RateLimitCounter =
  models.RateLimitCounter || model('RateLimitCounter', rateLimitCounterSchema);
