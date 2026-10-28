import { randomBytes } from 'node:crypto';

/**
 * Centralized, typed env config — ported from the NestJS backend's
 * `src/config/configuration.ts`. Read once per process; Next.js API routes
 * import `getConfig()` rather than reading `process.env` directly, so every
 * default/parsing rule lives in exactly one place.
 */

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === 'true' || raw === '1';
}

function list(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * HS256 (used by `server/lib/auth.ts` to sign every access token) wants at
 * least 256 bits of key material — anything shorter makes the signature
 * brute-forceable. 32 *characters* is a conservative floor (most real
 * secrets are hex/base64, so 32 characters is already >= 128 bits even in
 * the worst case, and the generator below and `.env.example`'s own
 * suggested `randomBytes(48).toString('hex')` both produce 64+).
 */
const MIN_JWT_SECRET_LENGTH = 32;

/**
 * `JWT_ACCESS_SECRET` signs/verifies every access token in the system —
 * anyone who has it can mint a token for any user id and any role (see
 * `server/lib/auth.ts`). There is deliberately NO hardcoded fallback value:
 * a fixed string that is also committed in `.env.example` would be a
 * public, permanent authentication bypass for any deployment that forgets
 * to set the real one (exactly this shipped once — see git history). In
 * production this fails the process at startup rather than silently
 * running with a weak/missing key; outside production (local dev, CI,
 * tests not covered by `vitest.setup.ts`'s own `JWT_ACCESS_SECRET`) a
 * fresh random secret is generated per process instead of falling back to
 * any fixed string, so there is never a *known* default to forge against —
 * the only cost is that restarting the dev server invalidates existing
 * sessions, which is already true of this app's in-memory rate-limit state.
 */
function resolveJwtAccessSecret(isProduction: boolean): string {
  const configured = process.env.JWT_ACCESS_SECRET;

  if (configured) {
    if (configured.length < MIN_JWT_SECRET_LENGTH) {
      throw new Error(
        `JWT_ACCESS_SECRET is too short (${configured.length} characters; need at least ${MIN_JWT_SECRET_LENGTH}). ` +
          `Generate a strong one with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`,
      );
    }
    return configured;
  }

  if (isProduction) {
    throw new Error(
      'JWT_ACCESS_SECRET is not set. The app cannot start in production without it — see .env.example.',
    );
  }

  // eslint-disable-next-line no-console
  console.warn(
    'JWT_ACCESS_SECRET is not set — generated a random one for this process only. ' +
      'Every existing session will be invalidated on the next restart; set a real value in .env.local to avoid that.',
  );
  return randomBytes(48).toString('hex');
}

const DEFAULT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  /**
   * This app's own base URL — used to build links in emails
   * (verify-email/reset-password). Unlike the original two-repo backend
   * (which needed a separate `FRONTEND_URL` for CORS + email links across
   * two origins), frontend and backend are the same Next.js app/origin here,
   * so there is no separate CORS concern — only the email-link use remains.
   */
  appUrl: string;
  mongodbUri: string;
  mongodbDbName: string;
  auth: {
    jwtAccessSecret: string;
    jwtAccessExpiresIn: string;
    refreshTokenTtlDays: number;
    refreshCookieName: string;
    bcryptSaltRounds: number;
    otpExpiryMinutes: number;
    otpMaxAttempts: number;
    otpResendCooldownSeconds: number;
    passwordResetExpiryMinutes: number;
    artifactRetentionDays: number;
    loginLockout: { maxAttempts: number; windowSeconds: number };
  };
  email: {
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    smtpPassword: string;
    fromAddress: string;
    fromName: string;
  };
  cloudinary: {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
  };
  documents: {
    maxUploadBytes: number;
    allowedMimeTypes: string[];
    signedUrlTtlSeconds: number;
  };
  pagination: { defaultPageSize: number; maxPageSize: number };
  applications: { softDeleteRetentionDays: number };
  urlFetch: {
    timeoutMs: number;
    maxResponseBytes: number;
    maxRedirects: number;
  };
  requirementAi: { enabled: boolean; timeoutMs: number };
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cached) return cached;

  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';
  cached = {
    nodeEnv,
    isProduction,
    appUrl: process.env.APP_URL ?? 'http://localhost:3000',
    mongodbUri: process.env.MONGODB_URI ?? '',
    mongodbDbName: process.env.MONGODB_DB_NAME ?? 'schola',
    auth: {
      jwtAccessSecret: resolveJwtAccessSecret(isProduction),
      jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
      refreshTokenTtlDays: int('REFRESH_TOKEN_TTL_DAYS', 30),
      refreshCookieName: process.env.REFRESH_COOKIE_NAME ?? 'refresh_token',
      bcryptSaltRounds: int('BCRYPT_SALT_ROUNDS', 10),
      otpExpiryMinutes: int('OTP_EXPIRY_MINUTES', 10),
      otpMaxAttempts: int('OTP_MAX_ATTEMPTS', 5),
      otpResendCooldownSeconds: int('OTP_RESEND_COOLDOWN_SECONDS', 60),
      passwordResetExpiryMinutes: int('PASSWORD_RESET_EXPIRY_MINUTES', 30),
      artifactRetentionDays: int('AUTH_ARTIFACT_RETENTION_DAYS', 7),
      loginLockout: {
        maxAttempts: int('LOGIN_LOCKOUT_MAX_ATTEMPTS', 10),
        windowSeconds: int('LOGIN_LOCKOUT_WINDOW_SECONDS', 900),
      },
    },
    email: {
      smtpHost: process.env.EMAIL_SMTP_HOST ?? '',
      smtpPort: int('EMAIL_SMTP_PORT', 587),
      smtpSecure: bool('EMAIL_SMTP_SECURE', false),
      smtpUser: process.env.EMAIL_SMTP_USER ?? '',
      smtpPassword: process.env.EMAIL_SMTP_PASSWORD ?? '',
      fromAddress: process.env.EMAIL_FROM_ADDRESS ?? 'no-reply@schola.local',
      fromName: process.env.EMAIL_FROM_NAME ?? 'Schola',
    },
    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
      apiKey: process.env.CLOUDINARY_API_KEY ?? '',
      apiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
    },
    documents: {
      maxUploadBytes: int('DOCUMENT_MAX_UPLOAD_BYTES', 20_971_520),
      allowedMimeTypes: list(
        'DOCUMENT_ALLOWED_MIME_TYPES',
        DEFAULT_ALLOWED_MIME_TYPES,
      ),
      signedUrlTtlSeconds: int('DOCUMENT_SIGNED_URL_TTL_SECONDS', 300),
    },
    pagination: {
      defaultPageSize: int('PAGINATION_DEFAULT_PAGE_SIZE', 25),
      maxPageSize: int('PAGINATION_MAX_PAGE_SIZE', 100),
    },
    applications: {
      softDeleteRetentionDays: int(
        'APPLICATION_SOFT_DELETE_RETENTION_DAYS',
        30,
      ),
    },
    urlFetch: {
      timeoutMs: int('URL_FETCH_TIMEOUT_MS', 8000),
      maxResponseBytes: int('URL_FETCH_MAX_RESPONSE_BYTES', 1_048_576),
      maxRedirects: int('URL_FETCH_MAX_REDIRECTS', 3),
    },
    requirementAi: {
      enabled: bool('REQUIREMENT_AI_ENABLED', true),
      timeoutMs: int('REQUIREMENT_AI_TIMEOUT_MS', 5000),
    },
  };
  return cached;
}

/** Test-only: force the next getConfig() call to re-read process.env. */
export function resetConfigCache(): void {
  cached = null;
}
