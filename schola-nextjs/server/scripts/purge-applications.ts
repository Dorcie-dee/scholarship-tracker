/**
 * Thin CLI entry point for `purgeExpiredApplications()` (see
 * `server/services/applications.service.ts`). Ported in place of the
 * original NestJS backend's `@Cron(CronExpression.EVERY_HOUR)`
 * `ApplicationPurgeService` — there's no in-process cron host here, so a
 * future scheduled trigger (Vercel Cron, a hosted cron provider, etc.) runs
 * this script directly instead.
 *
 * Usage: `npx tsx server/scripts/purge-applications.ts`
 */
import { connectToDatabase } from '../lib/db';
import { purgeExpiredApplications } from '../services/applications.service';
import '@/server/models';

async function main(): Promise<void> {
  await connectToDatabase();
  const purged = await purgeExpiredApplications();
  // eslint-disable-next-line no-console
  console.log(`Application purge: permanently removed ${purged} application(s) past their retention window.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Application purge failed:', err);
    process.exit(1);
  });
