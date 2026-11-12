import { Schema, model, models, Types } from 'mongoose';
import { baseSchemaOptions } from '../lib/schema-utils';

export interface RefreshSessionDoc {
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  lastUsedAt: Date;
  revokedAt: Date | null;
  revokedDueToReuse: boolean;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const refreshSessionSchema = new Schema<RefreshSessionDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    lastUsedAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedDueToReuse: { type: Boolean, default: false },
    userAgent: { type: String, default: null },
    ipAddress: { type: String, default: null },
  },
  baseSchemaOptions,
);

export const RefreshSession =
  models.RefreshSession || model<RefreshSessionDoc>('RefreshSession', refreshSessionSchema);
