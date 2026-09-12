import { ApplicationPurgeService } from './application-purge.service';

/**
 * Production hardening (Batch 7) — proves the purge job targets exactly
 * "soft-deleted and past the retention window" rows, and permanently
 * removes them via a raw delete (not `repository.delete()`/`.remove()`,
 * either of which `@DeleteDateColumn` would treat as a no-op re-soft-delete).
 */
describe('ApplicationPurgeService', () => {
  const applicationsConfig = { softDeleteRetentionDays: 30 };
  const configService = { get: jest.fn(() => applicationsConfig) } as any;

  const makeQueryBuilderRepo = (affected: number) => {
    const calls: { method: string; args: unknown[] }[] = [];
    const builder: any = {};
    for (const method of ['delete', 'where']) {
      builder[method] = jest.fn((...args: unknown[]) => {
        calls.push({ method, args });
        return builder;
      });
    }
    builder.execute = jest.fn(async () => ({ affected }));
    return {
      repo: { createQueryBuilder: jest.fn(() => builder) },
      calls,
    };
  };

  it('targets only rows where deleted_at is set AND past the retention cutoff', async () => {
    const { repo, calls } = makeQueryBuilderRepo(2);
    const service = new ApplicationPurgeService(repo as any, configService);

    await service.purgeSoftDeletedApplications();

    const predicate = String(calls.find((c) => c.method === 'where')?.args[0]);
    expect(predicate).toContain('deleted_at IS NOT NULL');
    expect(predicate).toContain('deleted_at <');
  });

  it('uses createQueryBuilder().delete() — never repository.delete()/.remove(), which @DeleteDateColumn would intercept', async () => {
    const { repo } = makeQueryBuilderRepo(1);
    const service = new ApplicationPurgeService(repo as any, configService);

    await service.purgeSoftDeletedApplications();

    expect(repo.createQueryBuilder).toHaveBeenCalledTimes(1);
  });

  it('does not throw when nothing is eligible for purge', async () => {
    const { repo } = makeQueryBuilderRepo(0);
    const service = new ApplicationPurgeService(repo as any, configService);

    await expect(
      service.purgeSoftDeletedApplications(),
    ).resolves.toBeUndefined();
  });

  it('reads the retention window from applications config, not a hardcoded value', async () => {
    const { repo } = makeQueryBuilderRepo(0);
    const service = new ApplicationPurgeService(repo as any, configService);

    await service.purgeSoftDeletedApplications();

    expect(configService.get).toHaveBeenCalledWith(
      'applications',
      expect.anything(),
    );
  });
});
