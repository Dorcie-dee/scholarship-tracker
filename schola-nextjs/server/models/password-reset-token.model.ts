import { Schema, model, models, Types } from 'mongoose';
import { baseSchemaOptions } from '../lib/schema-utils';

export interface PasswordResetTokenDoc {
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  invalidatedAt: Date | null;
}

const schema = new Schema<PasswordResetTokenDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
    invalidatedAt: { type: Date, default: null },
  },
  baseSchemaOptions,
);

export const PasswordResetToken =
  models.PasswordResetToken ||
  model<PasswordResetTokenDoc>('PasswordResetToken', schema);
