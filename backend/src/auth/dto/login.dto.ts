import { IsEmail, IsString, MaxLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '../password-policy';
import { EMAIL_MAX_LENGTH } from '../../common/validators/text-limits';

export class LoginDto {
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email: string;

  // Production hardening (Batch 8) — previously unbounded, unlike
  // RegisterDto/ResetPasswordDto's password fields (which already had
  // PASSWORD_MAX_LENGTH + IsWithinBcryptByteLimit — see password-policy.ts).
  // Only a length cap here, not the bcrypt-byte-limit check: that check
  // exists to warn a user, AT CREATION TIME, that their intended password is
  // ambiguous once past 72 UTF-8 bytes — every password that could ever be
  // validly stored already satisfies it (enforced at register/reset), so
  // re-checking it here would only ever reject already-wrong credentials a
  // moment earlier, not close any real gap. The length cap alone is what
  // closes the actual gap: rejecting a grossly oversized login payload
  // before it reaches LoginGuardService/bcrypt at all.
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}
