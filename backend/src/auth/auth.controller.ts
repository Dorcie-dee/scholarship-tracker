import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { plainToInstance } from 'class-transformer';
import type { CookieOptions, Request, Response } from 'express';
import { AppConfig } from '../config/configuration';
import { AuthService, IssuedTokens } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { PasswordResetService } from './password-reset.service';
import { EmailService } from '../common/email/email.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Public } from './decorators/public.decorator';
import { StrictRateLimit } from '../common/decorators/strict-rate-limit.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser } from './decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { SafeUser, AuthTokenResponse } from '../types';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly passwordResetService: PasswordResetService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @StrictRateLimit()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokenResponse> {
    const { user, tokens } = await this.authService.register(
      dto,
      requestMeta(req),
    );
    this.setRefreshCookie(res, tokens);
    return this.toAuthResponse(user, tokens);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @StrictRateLimit()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokenResponse> {
    const { user, tokens } = await this.authService.login(
      dto.email,
      dto.password,
      requestMeta(req),
    );
    this.setRefreshCookie(res, tokens);
    return this.toAuthResponse(user, tokens);
  }

  @Public()
  // Generous, since legitimate clients refresh routinely (e.g. on every page
  // load) — this is a backstop against gross abuse, not a tight limit; see
  // phase-1o5.txt §7/§12, "protect obvious abuse without breaking legitimate
  // token rotation behavior".
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @StrictRateLimit()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokenResponse> {
    const presented = this.readRefreshCookie(req);
    if (!presented) {
      throw new UnauthorizedException('No refresh token provided');
    }
    const { user, tokens } = await this.authService.refresh(
      presented,
      requestMeta(req),
    );
    this.setRefreshCookie(res, tokens);
    return this.toAuthResponse(user, tokens);
  }

  // @Public(): logout only acts on the refresh cookie, not on CurrentUser(), so
  // it must keep working even when the access token has already expired —
  // otherwise a user with a dead access token but valid refresh cookie could
  // never log out.
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const presented = this.readRefreshCookie(req);
    if (presented) {
      await this.authService.logout(presented);
    }
    this.clearRefreshCookie(res);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.logoutAll(user.userId);
    this.clearRefreshCookie(res);
  }

  @Get('sessions')
  async sessions(@CurrentUser() user: AuthenticatedUser) {
    const sessions = await this.authService.listActiveSessions(user.userId);
    return sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
    }));
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  // Authenticated (not @Public()) — deliberately: requiring a valid access
  // token as the sole gate means there is no email/code-guessing surface to
  // rate-limit against arbitrary accounts in the first place, on top of the
  // IP-based throttle below and the OTP's own attempt-limit.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @StrictRateLimit()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyEmailDto,
  ): Promise<{ verified: true }> {
    await this.emailVerificationService.verify(user.userId, dto.code);
    return { verified: true };
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @StrictRateLimit()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerification(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ sent: true }> {
    const { otp, expiresAt } = await this.emailVerificationService.resend(
      user.userId,
    );
    // Unlike register() (best-effort — the account must exist regardless)
    // and forgot-password (must never reveal delivery success/failure — see
    // below), the user here is actively, authenticatedly asking for a code
    // right now: a failed send is surfaced as a clear, actionable error
    // rather than silently pretending it worked. The OTP row itself already
    // exists either way (issued above) — nothing is left inconsistent by
    // this failing; the user can simply try resend again.
    try {
      await this.emailService.sendVerificationOtpEmail({
        to: user.email,
        otp,
        expiresAt,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to send verification email to user ${user.userId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw new ServiceUnavailableException(
        'Failed to send the verification email. Please try again shortly.',
      );
    }
    return { sent: true };
  }

  // Public: a locked-out user can't authenticate. The response is
  // deliberately identical whether or not the email belongs to an account —
  // see PasswordResetService.requestReset's doc comment. For that same
  // reason, a delivery failure here is swallowed (logged, not thrown) —
  // surfacing it would create a response-shape/timing oracle distinguishing
  // "account exists but email failed" from "account doesn't exist".
  @Public()
  @Throttle({ default: { limit: 3, ttl: 900_000 } })
  @StrictRateLimit()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    const result = await this.passwordResetService.requestReset(dto.email);
    if (result) {
      const { passwordResetExpiryMinutes } = this.configService.get('auth', {
        infer: true,
      });
      try {
        await this.emailService.sendPasswordResetEmail({
          to: result.user.email,
          rawToken: result.rawToken,
          expiryMinutes: passwordResetExpiryMinutes,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to send password-reset email to user ${result.user.id}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }
    return {
      message:
        'If an account exists for that email, password reset instructions have been sent.',
    };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @StrictRateLimit()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    await this.passwordResetService.resetPassword(dto.token, dto.newPassword);
    return { message: 'Password has been reset. Please log in again.' };
  }

  private toAuthResponse(user: User, tokens: IssuedTokens): AuthTokenResponse {
    return {
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt.toISOString(),
      user: plainToInstance(User, user) as unknown as SafeUser,
    };
  }

  private cookieOptions(maxAgeMs: number): CookieOptions {
    return {
      httpOnly: true,
      secure: this.configService.get('isProduction', { infer: true }),
      sameSite: 'lax',
      // Matches the global 'api' prefix (see main.ts) + this controller's 'auth' route.
      path: '/api/auth',
      maxAge: maxAgeMs,
    };
  }

  private setRefreshCookie(res: Response, tokens: IssuedTokens): void {
    const { refreshCookieName } = this.configService.get('auth', {
      infer: true,
    });
    const maxAgeMs = tokens.refreshTokenExpiresAt.getTime() - Date.now();
    res.cookie(
      refreshCookieName,
      tokens.refreshToken,
      this.cookieOptions(maxAgeMs),
    );
  }

  private clearRefreshCookie(res: Response): void {
    const { refreshCookieName } = this.configService.get('auth', {
      infer: true,
    });
    res.clearCookie(refreshCookieName, this.cookieOptions(0));
  }

  private readRefreshCookie(req: Request): string | undefined {
    const { refreshCookieName } = this.configService.get('auth', {
      infer: true,
    });
    return (req.cookies as Record<string, string> | undefined)?.[
      refreshCookieName
    ];
  }
}

function requestMeta(req: Request) {
  return {
    userAgent: req.headers['user-agent'] ?? null,
    ipAddress: req.ip ?? null,
  };
}
