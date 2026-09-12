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
  /**
   * Production hardening (see docs/decisions.md, "Trust proxy configuration")
   * — how many reverse-proxy hops in front of this process are trusted when
   * resolving the real client IP from `X-Forwarded-For`. `0` (the default)
   * trusts nothing — `req.ip` is the directly-connecting socket, correct for
   * local development and for a deployment with no reverse proxy at all.
   * A real production deployment sitting behind exactly one load
   * balancer/reverse proxy (the common case) should set this to `1` — NOT a
   * larger number "to be safe": trusting more hops than actually exist lets a
   * client forge the trusted portion of `X-Forwarded-For` themselves.
   */
  trustProxyHops: number;
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    ssl: boolean;
    url?: string;
    pool: {
      max: number;
      min: number;
      connectionTimeoutMillis: number;
      idleTimeoutMillis: number;
      statementTimeoutMillis: number;
    };
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
    /** How long past expiry/consumption an auth artifact is kept before the cleanup job purges it — see auth/auth-cleanup.service.ts. */
    authArtifactRetentionDays: number;
    /** Account-scoped login brute-force protection — see auth/login-guard.service.ts. */
    loginLockout: {
      maxAttempts: number;
      windowSeconds: number;
    };
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
  /**
   * Optional — absence means every process using rate limiting/shared state
   * falls back to safe, documented, in-memory behavior appropriate for a
   * single-instance deployment. See decisions.md, "Distributed rate limiting".
   */
  redis: {
    url?: string;
  };
  pagination: {
    defaultPageSize: number;
    maxPageSize: number;
  };
  documents: {
    maxUploadBytes: number;
    /** Comma-separated MIME allowlist — see documents/upload-validation.ts. */
    allowedMimeTypes: string[];
    /** How long a signed Cloudinary delivery URL stays valid — see common/cloudinary/cloudinary.service.ts. */
    signedUrlTtlSeconds: number;
  };
  applications: {
    /** How long a soft-deleted Application is kept before the hard-purge job removes it — see applications/application-purge.service.ts. */
    softDeleteRetentionDays: number;
  };
  urlFetch: {
    timeoutMs: number;
    maxResponseBytes: number;
    maxRedirects: number;
  };
  requirementAi: {
    /** When false, suggestion endpoints return 503. */
    enabled: boolean;
    provider: 'heuristic';
    timeoutMs: number;
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

/**
 * The exact placeholder value shipped in sample.env — never a real secret,
 * never logged, compared only by exact string equality.
 */
const KNOWN_SAMPLE_JWT_ACCESS_SECRET =
  'dev_only_access_secret_change_me_please_1234567890';

/**
 * Track 1 Group E — production must refuse to start if JWT_ACCESS_SECRET is
 * still the exact placeholder value committed in sample.env. Left unset
 * entirely is still handled separately (and deliberately not here — see the
 * `accessTokenSecret` field's own comment below): this check only closes the
 * *different* risk of someone copying sample.env's placeholder verbatim into
 * a real deployment despite the file's own warning to change it.
 *
 * Centralized here (the config boundary), not duplicated in AuthModule/
 * JwtStrategy/AuthService — same "one place validates, everything downstream
 * just reads an already-valid value" shape as EmailService's own production
 * fail-fast check for missing SMTP config. Development/test are deliberately
 * exempt: using the placeholder locally is the documented quick-start path
 * (see sample.env), not a mistake worth blocking.
 *
 * The message never includes the secret's actual value — nothing here needs
 * to, since the check is a fixed-string comparison, not a inspection of an
 * unknown value.
 */
function validateAuthSecret(
  accessTokenSecret: string,
  isProduction: boolean,
): void {
  if (isProduction && accessTokenSecret === KNOWN_SAMPLE_JWT_ACCESS_SECRET) {
    throw new Error(
      'JWT_ACCESS_SECRET is still set to the placeholder value from sample.env. ' +
        'Generate a real secret before running in production: ' +
        "node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"",
    );
  }
}

const DEFAULT_ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export default (): AppConfig => {
  const env = process.env;
  const nodeEnv = env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';
  const accessTokenSecret = env.JWT_ACCESS_SECRET ?? '';
  validateAuthSecret(accessTokenSecret, isProduction);

  return {
    nodeEnv,
    isProduction,
    apiPort: Number(env.API_PORT ?? 8769),
    frontendUrl: env.FRONTEND_URL ?? 'http://localhost:3000',
    // Default 0 (trust nothing) is the safe, conservative default — see the
    // AppConfig field's own doc comment. Only ever raise this to match a
    // real, known reverse-proxy topology.
    trustProxyHops: Number(env.TRUST_PROXY_HOPS ?? 0),
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
      pool: {
        // Sized for `<= N instances> x <this value> <= <provider connection
        // ceiling>` — see docs/decisions.md, "Connection pool sizing". 10 is
        // node-postgres's own historical default, kept as this app's default
        // too so behavior doesn't silently change for anyone already running
        // it — but now explicit and env-configurable rather than implicit.
        max: Number(env.DB_POOL_MAX ?? 10),
        min: Number(env.DB_POOL_MIN ?? 0),
        connectionTimeoutMillis: Number(
          env.DB_POOL_CONNECT_TIMEOUT_MS ?? 5_000,
        ),
        idleTimeoutMillis: Number(env.DB_POOL_IDLE_TIMEOUT_MS ?? 30_000),
        // Server-side backstop against a runaway query holding a connection
        // (and, at scale, a pool slot) indefinitely — separate from the
        // pool's own connect/idle timeouts, which govern the connection
        // itself, not a specific statement running on it.
        statementTimeoutMillis: Number(env.DB_STATEMENT_TIMEOUT_MS ?? 15_000),
      },
    },
    auth: {
      // Empty-string fallback (not requireEnv) is deliberate: this function must
      // stay able to build a config object even in a context that doesn't set
      // JWT_ACCESS_SECRET at all — JwtStrategy's own constructor is what fails
      // fast on an EMPTY secret, at the point it's actually needed (see its doc
      // comment). validateAuthSecret() above only rejects the one different
      // risk — a non-empty but still-the-sample-placeholder value — since an
      // empty check can't catch that, and this is the one place that
      // legitimately knows what the placeholder looks like.
      accessTokenSecret,
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
      authArtifactRetentionDays: Number(env.AUTH_ARTIFACT_RETENTION_DAYS ?? 7),
      loginLockout: {
        maxAttempts: Number(env.LOGIN_LOCKOUT_MAX_ATTEMPTS ?? 10),
        windowSeconds: Number(env.LOGIN_LOCKOUT_WINDOW_SECONDS ?? 900),
      },
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
    redis: {
      url: env.REDIS_URL,
    },
    pagination: {
      defaultPageSize: Number(env.PAGINATION_DEFAULT_PAGE_SIZE ?? 25),
      maxPageSize: Number(env.PAGINATION_MAX_PAGE_SIZE ?? 100),
    },
    documents: {
      maxUploadBytes: Number(env.DOCUMENT_MAX_UPLOAD_BYTES ?? 20 * 1024 * 1024),
      allowedMimeTypes: env.DOCUMENT_ALLOWED_MIME_TYPES
        ? env.DOCUMENT_ALLOWED_MIME_TYPES.split(',').map((v) => v.trim())
        : DEFAULT_ALLOWED_DOCUMENT_MIME_TYPES,
      signedUrlTtlSeconds: Number(env.DOCUMENT_SIGNED_URL_TTL_SECONDS ?? 300),
    },
    applications: {
      softDeleteRetentionDays: Number(
        env.APPLICATION_SOFT_DELETE_RETENTION_DAYS ?? 30,
      ),
    },
    urlFetch: {
      timeoutMs: Number(env.URL_FETCH_TIMEOUT_MS ?? 8000),
      maxResponseBytes: Number(env.URL_FETCH_MAX_RESPONSE_BYTES ?? 1_048_576),
      maxRedirects: Number(env.URL_FETCH_MAX_REDIRECTS ?? 3),
    },
    requirementAi: {
      enabled: (env.REQUIREMENT_AI_ENABLED ?? 'true').toLowerCase() !== 'false',
      provider: 'heuristic',
      timeoutMs: Number(env.REQUIREMENT_AI_TIMEOUT_MS ?? 5000),
    },
  };
};

export { requireEnv, validateAuthSecret, KNOWN_SAMPLE_JWT_ACCESS_SECRET };
