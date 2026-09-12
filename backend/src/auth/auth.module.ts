import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { ProfileModule } from '../profile/profile.module';
import { EmailModule } from '../common/email/email.module';
import { RefreshSession } from './entities/refresh-session.entity';
import { EmailVerificationOtp } from './entities/email-verification-otp.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { User } from '../users/entities/user.entity';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { PasswordResetService } from './password-reset.service';
import { AuthCleanupService } from './auth-cleanup.service';
import { LoginGuardService } from './login-guard.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,
    ProfileModule,
    EmailModule,
    PassportModule,
    // No secret/signOptions here on purpose — AuthService passes them
    // per-call from ConfigService so both live in one place (configuration.ts).
    JwtModule.register({}),
    TypeOrmModule.forFeature([
      RefreshSession,
      EmailVerificationOtp,
      PasswordResetToken,
      // Registered here too (in addition to UsersModule) so
      // PasswordResetService can open a transaction spanning User +
      // RefreshSession without importing UsersModule's controller/service
      // surface for something that's purely a repository-level need — same
      // reasoning as ApplicationsModule registering Requirement directly
      // (see applications.module.ts).
      User,
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    EmailVerificationService,
    PasswordResetService,
    // Production hardening (Batch 2) — hourly cleanup of expired/consumed/
    // invalidated auth artifacts; see its own doc comment.
    AuthCleanupService,
    // Production hardening (Batch 2) — account-scoped login brute-force
    // protection, additive to the existing IP-based @Throttle() on
    // POST /auth/login; see its own doc comment.
    LoginGuardService,
    JwtStrategy,
  ],
  exports: [AuthService],
})
export class AuthModule {}
