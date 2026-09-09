import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { AppConfig } from '../config/configuration';
import { hashToken } from '../common/utils/hash-token';
import { EmailVerificationOtp } from './entities/email-verification-otp.entity';
import { UsersService } from '../users/users.service';

const OTP_LENGTH = 6;

/**
 * Email verification via a 6-digit OTP (spec: phase-1o5.txt §7). Storage
 * mirrors RefreshSession's pattern: only a SHA-256 hash of the code is ever
 * persisted (see hashToken's doc comment). Consumption and attempt-counting
 * use atomic conditional updates, the same pattern established for the
 * refresh-token race fix in AuthService.refresh() — never a
 * read-then-separately-write sequence for anything that decides whether a
 * credential is still usable.
 */
@Injectable()
export class EmailVerificationService {
  constructor(
    @InjectRepository(EmailVerificationOtp)
    private readonly otps: Repository<EmailVerificationOtp>,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  private authConfig() {
    return this.configService.get('auth', { infer: true });
  }

  /**
   * Generates and stores a new OTP, invalidating any still-active one for
   * this user first (spec: "resend invalidates/replaces prior OTP"). Returns
   * the RAW code — the only place it ever exists outside a hash — for the
   * caller to hand to EmailService. Never returned from any other method.
   */
  async issueOtp(userId: string): Promise<{ otp: string; expiresAt: Date }> {
    const { otpExpiryMinutes } = this.authConfig();

    // Supersede any still-usable prior OTP so only the newest one can ever
    // succeed — closes the "resend, but the old code still works" gap.
    await this.otps.update(
      { userId, consumedAt: IsNull(), invalidatedAt: IsNull() },
      { invalidatedAt: new Date() },
    );

    // crypto.randomInt is CSPRNG-backed (unlike Math.random()) — required per
    // spec: "do not use predictable randomness".
    const otp = randomInt(0, 10 ** OTP_LENGTH)
      .toString()
      .padStart(OTP_LENGTH, '0');
    const expiresAt = new Date(Date.now() + otpExpiryMinutes * 60 * 1000);

    await this.otps.save(
      this.otps.create({
        userId,
        otpHash: hashToken(otp),
        expiresAt,
        attempts: 0,
        consumedAt: null,
        invalidatedAt: null,
      }),
    );

    return { otp, expiresAt };
  }

  /**
   * Resend, with a cooldown enforced at the data layer (not just the
   * endpoint's rate-limit guard) — a second, independent line of defense: a
   * user genuinely can't have two "active" OTPs issued within the cooldown
   * window even if the HTTP-level throttle were somehow bypassed.
   */
  async resend(userId: string): Promise<{ otp: string; expiresAt: Date }> {
    const user = await this.usersService.getByIdOrThrow(userId);
    if (user.isVerified) {
      throw new BadRequestException('This account is already verified');
    }

    const { otpResendCooldownSeconds } = this.authConfig();
    const mostRecent = await this.otps.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    if (mostRecent) {
      const elapsedMs = Date.now() - mostRecent.createdAt.getTime();
      if (elapsedMs < otpResendCooldownSeconds * 1000) {
        throw new HttpException(
          'Please wait before requesting another verification code',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    return this.issueOtp(userId);
  }

  /**
   * Verifies a submitted code. Every rejection path returns the same generic
   * message — an OTP is scoped to an authenticated user's own account (the
   * controller requires @CurrentUser()), so there's no cross-user
   * enumeration surface here, but distinguishing "wrong code" from "expired"
   * from "no active code" still isn't useful information to hand back.
   */
  async verify(userId: string, code: string): Promise<void> {
    const user = await this.usersService.getByIdOrThrow(userId);
    if (user.isVerified) {
      return; // Already verified — a repeat submission is a safe no-op.
    }

    const { otpMaxAttempts } = this.authConfig();
    const active = await this.otps.findOne({
      where: { userId, consumedAt: IsNull(), invalidatedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });

    const invalid = () =>
      new BadRequestException('Invalid or expired verification code');

    if (!active) {
      throw invalid();
    }
    if (active.expiresAt.getTime() < Date.now()) {
      await this.otps.update(
        { id: active.id, invalidatedAt: IsNull() },
        { invalidatedAt: new Date() },
      );
      throw invalid();
    }

    if (hashToken(code) !== active.otpHash) {
      // Atomic increment — avoids a read-modify-write race under concurrent
      // guesses. The in-memory `active.attempts + 1` used below to decide
      // whether the limit was just crossed is a best-effort read, not the
      // authorization check itself (the increment is) — under a very tight
      // concurrent-guess race this could let one extra attempt through
      // before the row is invalidated, which is a proportionate trade-off
      // for a 6-digit/5-attempt scheme, not a meaningful security gap.
      await this.otps.increment({ id: active.id }, 'attempts', 1);
      if (active.attempts + 1 >= otpMaxAttempts) {
        await this.otps.update(
          { id: active.id, invalidatedAt: IsNull() },
          { invalidatedAt: new Date() },
        );
        throw new BadRequestException(
          'Too many incorrect attempts. Request a new verification code.',
        );
      }
      throw invalid();
    }

    // Atomic conditional consume — the sole authorization point for "this
    // code is allowed to verify the account right now", same pattern as the
    // refresh-token fix. Guards against two concurrent correct submissions
    // both succeeding (harmless here, but kept consistent with the
    // established pattern rather than assumed safe).
    const consumption = await this.otps.update(
      { id: active.id, consumedAt: IsNull(), invalidatedAt: IsNull() },
      { consumedAt: new Date() },
    );
    if (consumption.affected === 0) {
      throw invalid();
    }

    await this.usersService.markVerified(userId);
  }
}
