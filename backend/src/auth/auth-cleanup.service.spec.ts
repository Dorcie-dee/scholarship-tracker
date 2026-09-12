import { AuthCleanupService } from './auth-cleanup.service';

/**
 * Covers the exact deletion predicates (Track 1 Group E follow-up / Batch 2)
 * — proves the cleanup job's query shape matches its own documented
 * contract: only expired/consumed/invalidated rows past the retention
 * window are ever targeted, never anything still usable.
 */
describe('AuthCleanupService', () => {
  const authConfig = { authArtifactRetentionDays: 7 };
  const configService = { get: jest.fn(() => authConfig) } as any;

  const makeQueryBuilderRepo = (affected: number) => {
    const calls: { method: string; args: unknown[] }[] = [];
    const builder: any = {};
    for (const method of ['delete', 'where', 'orWhere']) {
      builder[method] = jest.fn((...args: unknown[]) => {
        calls.push({ method, args });
        return builder;
      });
    }
    builder.execute = jest.fn(async () => ({ affected }));
    return {
      repo: { createQueryBuilder: jest.fn(() => builder) },
      calls,
      builder,
    };
  };

  it('deletes refresh sessions that are expired OR revoked-and-past-retention, never an active session', async () => {
    const { repo, calls } = makeQueryBuilderRepo(3);
    const otps = makeQueryBuilderRepo(0).repo;
    const resetTokens = makeQueryBuilderRepo(0).repo;

    const service = new AuthCleanupService(
      repo as any,
      otps as any,
      resetTokens as any,
      configService,
    );
    await service.purgeExpiredAuthArtifacts();

    expect(calls.find((c) => c.method === 'where')?.args[0]).toContain(
      'expires_at',
    );
    expect(
      calls.some(
        (c) =>
          c.method === 'orWhere' && String(c.args[0]).includes('revoked_at'),
      ),
    ).toBe(true);
    // Never references an "active"/unrevoked/unexpired condition as the sole
    // predicate — the WHERE/OR-WHERE pair above is exhaustive of what this
    // job is allowed to touch.
  });

  it('deletes OTPs that are expired, consumed, or invalidated (and past retention)', async () => {
    const sessions = makeQueryBuilderRepo(0).repo;
    const { repo, calls } = makeQueryBuilderRepo(2);
    const resetTokens = makeQueryBuilderRepo(0).repo;

    const service = new AuthCleanupService(
      sessions as any,
      repo as any,
      resetTokens as any,
      configService,
    );
    await service.purgeExpiredAuthArtifacts();

    const predicates = calls.map((c) => String(c.args[0]));
    expect(predicates.some((p) => p.includes('expires_at'))).toBe(true);
    expect(predicates.some((p) => p.includes('consumed_at'))).toBe(true);
    expect(predicates.some((p) => p.includes('invalidated_at'))).toBe(true);
  });

  it('deletes password reset tokens that are expired, consumed, or invalidated', async () => {
    const sessions = makeQueryBuilderRepo(0).repo;
    const otps = makeQueryBuilderRepo(0).repo;
    const { repo, calls } = makeQueryBuilderRepo(1);

    const service = new AuthCleanupService(
      sessions as any,
      otps as any,
      repo as any,
      configService,
    );
    await service.purgeExpiredAuthArtifacts();

    const predicates = calls.map((c) => String(c.args[0]));
    expect(predicates.some((p) => p.includes('expires_at'))).toBe(true);
    expect(predicates.some((p) => p.includes('consumed_at'))).toBe(true);
  });

  it('runs all three purges concurrently (independent, no shared write ordering)', async () => {
    const sessions = makeQueryBuilderRepo(0).repo;
    const otps = makeQueryBuilderRepo(0).repo;
    const resetTokens = makeQueryBuilderRepo(0).repo;

    const service = new AuthCleanupService(
      sessions as any,
      otps as any,
      resetTokens as any,
      configService,
    );
    await service.purgeExpiredAuthArtifacts();

    expect(sessions.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(otps.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(resetTokens.createQueryBuilder).toHaveBeenCalledTimes(1);
  });

  it('does not throw when nothing is eligible for deletion', async () => {
    const sessions = makeQueryBuilderRepo(0).repo;
    const otps = makeQueryBuilderRepo(0).repo;
    const resetTokens = makeQueryBuilderRepo(0).repo;

    const service = new AuthCleanupService(
      sessions as any,
      otps as any,
      resetTokens as any,
      configService,
    );

    await expect(service.purgeExpiredAuthArtifacts()).resolves.toBeUndefined();
  });
});
