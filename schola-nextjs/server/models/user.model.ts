import { Schema, model, models, type HydratedDocument } from 'mongoose';
import { UserRole } from '../lib/enums';
import { baseSchemaOptions } from '../lib/schema-utils';

export interface UserDoc {
  email: string;
  passwordHash: string;
  name: string | null;
  isVerified: boolean;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // select: false — defense in depth, same as the original `User.passwordHash`'s
    // `select: false` column + `@Exclude()`: never returned unless explicitly requested.
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, default: null },
    isVerified: { type: Boolean, default: false },
    role: { type: String, enum: Object.values(UserRole), default: UserRole.USER },
  },
  baseSchemaOptions,
);

// Admin directory keyset pagination: newest-first, and role-filtered browse.
userSchema.index({ createdAt: -1, _id: -1 });
userSchema.index({ role: 1, createdAt: -1, _id: -1 });

export type UserHydrated = HydratedDocument<UserDoc>;

export const User = models.User || model<UserDoc>('User', userSchema);
