import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { LoginDto } from './login.dto';
import { PASSWORD_MAX_LENGTH } from '../password-policy';

/**
 * Production hardening (Batch 8) — LoginDto previously had no MaxLength on
 * either field at all (unlike RegisterDto/ResetPasswordDto's password
 * fields), so a grossly oversized login payload would reach
 * LoginGuardService/bcrypt before anything rejected it. Proves the fix with
 * real `class-validator` `validate()` calls.
 */
describe('LoginDto — size limits (Batch 8)', () => {
  it('accepts a normal login payload', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'person@example.invalid',
      password: 'a-real-password',
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a password over PASSWORD_MAX_LENGTH', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'person@example.invalid',
      password: 'x'.repeat(PASSWORD_MAX_LENGTH + 1),
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('rejects a pathologically oversized password payload (DoS-shaped input)', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'person@example.invalid',
      password: 'x'.repeat(1_000_000),
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('rejects an oversized email', async () => {
    const dto = plainToInstance(LoginDto, {
      email: `${'a'.repeat(256)}@example.invalid`,
      password: 'a-real-password',
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });
});
