import { Schema, model, models, Types } from 'mongoose';
import { baseSchemaOptions } from '../lib/schema-utils';

export interface EmailVerificationOtpDoc {
  userId: Types.ObjectId;
  otpHash: string;
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
  invalidatedAt: Date | null;
}

const schema = new Schema<EmailVerificationOtpDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    consumedAt: { type: Date, default: null },
    invalidatedAt: { type: Date, default: null },
  },
  baseSchemaOptions,
);

export const EmailVerificationOtp =
  models.EmailVerificationOtp ||
  model<EmailVerificationOtpDoc>('EmailVerificationOtp', schema);
