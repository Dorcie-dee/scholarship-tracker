import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppConfig } from '../config/configuration';
import { Application } from './entities/application.entity';

/**
 * Production hardening (Batch 7) — the other half of Application's
 * soft-delete: something has to actually remove a soft-deleted row once its
 * retention window has passed, or `deletedAt` would just be a permanent
 * "hidden forever" flag and the table would still grow without bound —
 * exactly the kind of gap this phase's own instructions call out (a
 * production system needs a real eventual-cleanup path, not "hidden and
 * considered solved").
 *
 * A raw `createQueryBuilder().delete()` (not `repository.delete()` /
 * `.remove()`, both of which `@DeleteDateColumn` would treat as another
 * soft-delete pass) issues a genuine `DELETE FROM applications WHERE ...` —
 * this cascades exactly the way a direct hard delete always did
 * (Requirements, Tasks, Deadlines, ApplicationDocuments,
 * ApplicationSnapshots for that Application), since none of that changed —
 * only the *first* delete became soft; this second, later one is genuinely
 * permanent.
 *
 * Runs hourly, same reasoning as `AuthCleanupService`: a single periodic
 * maintenance task, in-process cron, not a queue/worker — this workload
 * doesn't justify a separate deployable.
 */
@Injectable()
export class ApplicationPurgeService {
  private readonly logger = new Logger(ApplicationPurgeService.name);

  constructor(
    @InjectRepository(Application)
    private readonly applications: Repository<Application>,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async purgeSoftDeletedApplications(): Promise<void> {
    const { softDeleteRetentionDays } = this.configService.get('applications', {
      infer: true,
    });
    const cutoff = new Date(
      Date.now() - softDeleteRetentionDays * 24 * 60 * 60 * 1000,
    );

    const result = await this.applications
      .createQueryBuilder()
      .delete()
      .where('deleted_at IS NOT NULL AND deleted_at < :cutoff', { cutoff })
      .execute();
    const removed = result.affected ?? 0;

    if (removed > 0) {
      this.logger.log(
        `Application purge: permanently removed ${removed} application(s) ` +
          `soft-deleted more than ${softDeleteRetentionDays} day(s) ago.`,
      );
    }
  }
}
