/**
 * Thin CLI entry for purging expired/revoked/consumed/invalidated auth
 * artifacts (refresh sessions, email-verification OTPs, password-reset
 * tokens) past the configured retention window.
 *
 * Ported from the NestJS backend's `AuthCleanupService`, which ran this as
 * an hourly `@Cron(CronExpression.EVERY_HOUR)` job. Next.js/Vercel has no
 * in-process cron equivalent — run this script on a schedule instead (e.g. a
 * Vercel Cron Job hitting a protected route that shells out to it, or any
 * external scheduler), roughly hourly, matching the original's cadence:
 *
 *   npx tsx server/scripts/cleanup-auth-artifacts.ts
 */
import { connectToDatabase } from '../lib/db';
import { cleanupExpiredAuthArtifacts } from '../services/auth.service';

async function main() {
  await connectToDatabase();
  const result = await cleanupExpiredAuthArtifacts();

  if (result.sessionsRemoved || result.otpsRemoved || result.resetTokensRemoved) {
    // eslint-disable-next-line no-console
    console.log(
      `Auth artifact cleanup: removed ${result.sessionsRemoved} refresh session(s), ` +
        `${result.otpsRemoved} OTP(s), ${result.resetTokensRemoved} password reset token(s).`,
    );
  } else {
    // eslint-disable-next-line no-console
    console.log('Auth artifact cleanup: nothing to remove.');
  }

  process.exit(0);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Auth artifact cleanup failed:', error);
  process.exit(1);
});
