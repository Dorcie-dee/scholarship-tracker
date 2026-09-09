import { validate } from 'class-validator';
import { PASSWORD_MAX_BYTES, isWithinBcryptByteLimit } from './password-policy';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

/**
 * Track 1 hardening pass, §5 — Unicode/multibyte coverage for the bcrypt
 * 72-byte finding. The whole point of this validator is that CHARACTER
 * count and BYTE count diverge for non-ASCII input — every meaningful test
 * here has to actually use multibyte characters, not just long ASCII
 * strings, or it wouldn't be testing the thing that was actually broken.
 */
describe('password-policy — bcrypt byte-limit', () => {
  describe('isWithinBcryptByteLimit', () => {
    it('accepts a plain ASCII password at exactly the byte limit', () => {
      expect(isWithinBcryptByteLimit('a'.repeat(PASSWORD_MAX_BYTES))).toBe(
        true,
      );
    });

    it('rejects a plain ASCII password one byte over the limit', () => {
      expect(isWithinBcryptByteLimit('a'.repeat(PASSWORD_MAX_BYTES + 1))).toBe(
        false,
      );
    });

    it('rejects a password that is well under the 128-character max but over the byte limit once emoji are counted', () => {
      // Each of these emoji is 4 bytes in UTF-8 — 20 of them is 80 bytes,
      // over the 72-byte limit, despite being only 20 *characters* (nowhere
      // near PASSWORD_MAX_LENGTH=128). This is exactly the case that would
      // previously be silently truncated by bcrypt rather than rejected.
      const password = '🎉'.repeat(20);
      expect(password.length).toBeLessThan(128);
      expect(isWithinBcryptByteLimit(password)).toBe(false);
    });

    it('accepts a password with accented/multibyte characters that still fits within the byte limit', () => {
      // é is 2 bytes in UTF-8 — 30 of them is 60 bytes, under the limit.
      const password = 'é'.repeat(30);
      expect(isWithinBcryptByteLimit(password)).toBe(true);
    });

    it('rejects a password with accented characters once the byte count (not character count) crosses the limit', () => {
      // 40 × 2 bytes = 80 bytes — over the limit, even though 40 characters
      // alone would be well within any reasonable length policy.
      const password = 'é'.repeat(40);
      expect(isWithinBcryptByteLimit(password)).toBe(false);
    });
  });

  describe('RegisterDto and ResetPasswordDto enforce the identical policy', () => {
    it('RegisterDto rejects an emoji-heavy password that silently exceeds 72 bytes', async () => {
      const dto = new RegisterDto();
      dto.email = 'person@example.invalid';
      dto.password = '🎉'.repeat(20);

      const errors = await validate(dto);
      expect(
        errors.some(
          (e) => e.constraints && 'isWithinBcryptByteLimit' in e.constraints,
        ),
      ).toBe(true);
    });

    it('ResetPasswordDto rejects the SAME emoji-heavy password the same way', async () => {
      const dto = new ResetPasswordDto();
      dto.token = 'irrelevant-for-this-check';
      dto.newPassword = '🎉'.repeat(20);

      const errors = await validate(dto);
      expect(
        errors.some(
          (e) => e.constraints && 'isWithinBcryptByteLimit' in e.constraints,
        ),
      ).toBe(true);
    });

    it('both accept a normal, reasonable password with no violations', async () => {
      const register = new RegisterDto();
      register.email = 'person@example.invalid';
      register.password = 'a reasonably strong passphrase';

      const reset = new ResetPasswordDto();
      reset.token = 'some-token';
      reset.newPassword = 'a reasonably strong passphrase';

      expect(await validate(register)).toHaveLength(0);
      expect(await validate(reset)).toHaveLength(0);
    });
  });
});
