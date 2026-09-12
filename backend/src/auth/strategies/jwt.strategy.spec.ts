import { JwtStrategy } from './jwt.strategy';

/**
 * Track 1 Group E (E1) — regression coverage for JwtStrategy's own,
 * pre-existing fail-fast check: an EMPTY JWT_ACCESS_SECRET must still be
 * rejected exactly as before. The NEW placeholder-rejection check lives at
 * the configuration boundary instead (see config/configuration.spec.ts) —
 * this file exists specifically to prove that centralizing the new check
 * there didn't accidentally weaken or remove this older one.
 */
describe('JwtStrategy', () => {
  const makeConfigService = (accessTokenSecret: string) => ({
    get: jest.fn(() => ({ accessTokenSecret })),
  });

  it('throws at construction time when the access token secret is empty', () => {
    expect(() => new JwtStrategy(makeConfigService('') as any)).toThrow(
      /JWT_ACCESS_SECRET is not set/,
    );
  });

  it('constructs successfully with a real, non-empty secret', () => {
    expect(
      () => new JwtStrategy(makeConfigService('a-real-secret-value') as any),
    ).not.toThrow();
  });

  /** Production hardening (Batch 10) — explicit algorithm pinning. */
  it('pins verification to HS256 only, never inferring the algorithm from the token itself', () => {
    const strategy = new JwtStrategy(
      makeConfigService('a-real-secret-value') as any,
    );

    expect((strategy as any)._verifOpts.algorithms).toEqual(['HS256']);
  });

  it('validate() maps the JWT payload onto AuthenticatedUser', () => {
    const strategy = new JwtStrategy(
      makeConfigService('a-real-secret-value') as any,
    );

    const result = strategy.validate({
      sub: 'user-1',
      email: 'person@example.invalid',
      isVerified: true,
      role: 'user' as any,
    });

    expect(result).toEqual({
      userId: 'user-1',
      email: 'person@example.invalid',
      isVerified: true,
      role: 'user',
    });
  });
});
