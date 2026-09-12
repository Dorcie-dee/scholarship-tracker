import { IsString, Length, MaxLength, MinLength } from 'class-validator';
import {
  IsWithinBcryptByteLimit,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../password-policy';

export class ResetPasswordDto {
  // Production hardening (Batch 8) — previously just IsNotEmpty(), no upper
  // bound. `PasswordResetService` always issues exactly 64 hex characters
  // (`randomBytes(32).toString('hex')` — see password-reset.service.ts), so
  // any other length is definitely not a real token; rejecting it here is a
  // clear 400 instead of a wasted hash-and-lookup that was always going to
  // fail — same precision VerifyEmailDto already applies to its 6-digit code.
  @IsString()
  @Length(64, 64, { message: 'token must be a 64-character hex string' })
  token: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`,
  })
  @MaxLength(PASSWORD_MAX_LENGTH)
  @IsWithinBcryptByteLimit()
  newPassword: string;
}
