/**
 * Central, typed application configuration loaded from environment variables.
 *
 * We use a single hand-rolled loader + validator rather than pulling in a schema
 * library (Joi/zod/etc.) — see docs/decisions.md ("Avoid adding a library without
 * a clear reason"). The surface here is small enough that explicit checks are
 * clearer than a schema DSL.
 */

export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  apiPort: number;
  frontendUrl: string;
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    ssl: boolean;
    url?: string;
  };
  auth: {
    accessTokenSecret: string;
    accessTokenExpiresIn: string;
    refreshTokenTtlDays: number;
    refreshCookieName: string;
    bcryptSaltRounds: number;
    otpExpiryMinutes: number;
    otpMaxAttempts: number;
    otpResendCooldownSeconds: number;
    passwordResetExpiryMinutes: number;
  };
  cloudinary: {
    cloudName?: string;
    apiKey?: string;
    apiSecret?: string;
  };
  /**
   * SMTP, not a vendor-specific SDK — every real provider this app might use
   * (SES, SendGrid, Postmark, Mailgun, a corporate relay, Resend's SMTP
   * endpoint) speaks SMTP, matching this project's existing preference for
   * portable, non-vendor-locked choices (generic POSTGRES_* naming, no
   * Swagger — see decisions.md). `host` unset in a non-production environment
   * means EmailService falls back to logging instead of sending — see
   * common/email/email.service.ts.
   */
  email: {
    smtpHost?: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser?: string;
    smtpPassword?: string;
    fromAddress: string;
    fromName: string;
  };
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(
      `Missing required environment variable "${key}". Copy sample.env to .env and fill it in.`,
    );
  }
  return value;
}

export default (): AppConfig => {
  const env = process.env;
  const nodeEnv = env.NODE_ENV ?? 'development';

  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    apiPort: Number(env.API_PORT ?? 8769),
    frontendUrl: env.FRONTEND_URL ?? 'http://localhost:3000',
    // Generic POSTGRES_* naming — works against a local Postgres, Docker, or a
    // managed provider (Neon, RDS, Heroku, ...). Managed providers typically
    // require SSL — set POSTGRES_SSL=true for those (see docs/decisions.md).
    database: {
      host: env.POSTGRES_HOST ?? 'localhost',
      port: Number(env.POSTGRES_PORT ?? 5432),
      name: env.POSTGRES_DB ?? 'scholarship_os_dev',
      user: env.POSTGRES_USER ?? 'scholarship_os',
      password: env.POSTGRES_PASSWORD ?? '',
      ssl: env.POSTGRES_SSL === 'true',
      url: env.DATABASE_URL,
    },
    auth: {
      // Only strictly required at runtime (not at import time), so app.module can
      // build the config object even in test contexts that stub other pieces —
      // AuthModule itself calls requireEnv again if this is empty when it matters.
      accessTokenSecret: env.JWT_ACCESS_SECRET ?? '',
      accessTokenExpiresIn: env.JWT_ACCESS_EXPIRES_IN ?? '15m',
      refreshTokenTtlDays: Number(env.REFRESH_TOKEN_TTL_DAYS ?? 30),
      refreshCookieName: env.REFRESH_COOKIE_NAME ?? 'refresh_token',
      bcryptSaltRounds: Number(env.BCRYPT_SALT_ROUNDS ?? 12),
      // These four encode a security/UX trade-off (how long a code/link stays
      // valid, how many guesses are allowed) that's genuinely likely to be
      // revisited per-deployment — unlike e.g. PASSWORD_MAX_BYTES, which is a
      // fixed property of bcrypt, not a policy choice. See
      // docs/decisions.md, "Rate-limit thresholds are code constants, not
      // env config" for why the abuse-protection limits (§7) are NOT here.
      otpExpiryMinutes: Number(env.OTP_EXPIRY_MINUTES ?? 10),
      otpMaxAttempts: Number(env.OTP_MAX_ATTEMPTS ?? 5),
      otpResendCooldownSeconds: Number(env.OTP_RESEND_COOLDOWN_SECONDS ?? 60),
      passwordResetExpiryMinutes: Number(
        env.PASSWORD_RESET_EXPIRY_MINUTES ?? 30,
      ),
    },
    cloudinary: {
      cloudName: env.CLOUDINARY_CLOUD_NAME,
      apiKey: env.CLOUDINARY_API_KEY,
      apiSecret: env.CLOUDINARY_API_SECRET,
    },
    email: {
      smtpHost: env.EMAIL_SMTP_HOST,
      smtpPort: Number(env.EMAIL_SMTP_PORT ?? 587),
      // Port 465 is implicit-TLS; 587/25 negotiate TLS via STARTTLS instead —
      // this only needs to be true for the former.
      smtpSecure: env.EMAIL_SMTP_SECURE === 'true',
      smtpUser: env.EMAIL_SMTP_USER,
      smtpPassword: env.EMAIL_SMTP_PASSWORD,
      fromAddress: env.EMAIL_FROM_ADDRESS ?? 'no-reply@scholarship-os.local',
      fromName: env.EMAIL_FROM_NAME ?? 'Scholarship OS',
    },
  };
};

export { requireEnv };
