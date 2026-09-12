import configuration, {
  KNOWN_SAMPLE_JWT_ACCESS_SECRET,
  validateAuthSecret,
} from './configuration';

/**
 * Track 1 Group E (E1) — production must refuse to start if
 * JWT_ACCESS_SECRET is still the exact placeholder value shipped in
 * sample.env. A merely-empty secret is a separate, pre-existing concern
 * handled by JwtStrategy's own constructor (see jwt.strategy.spec.ts) — not
 * duplicated here, since that check already lives at the point it's
 * actually needed and this checkpoint's job is to close the ADDITIONAL,
 * different risk of the placeholder being used verbatim.
 */
describe('validateAuthSecret', () => {
  it('rejects the known sample placeholder in production', () => {
    expect(() =>
      validateAuthSecret(KNOWN_SAMPLE_JWT_ACCESS_SECRET, true),
    ).toThrow(/placeholder/i);
  });

  it('accepts a legitimate, non-placeholder secret in production', () => {
    expect(() =>
      validateAuthSecret(
        'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
        true,
      ),
    ).not.toThrow();
  });

  it('does not reject the placeholder outside production (development/test)', () => {
    expect(() =>
      validateAuthSecret(KNOWN_SAMPLE_JWT_ACCESS_SECRET, false),
    ).not.toThrow();
  });

  it("does not reject an empty secret — that remains JwtStrategy's concern, not this check's", () => {
    expect(() => validateAuthSecret('', true)).not.toThrow();
  });

  it('the rejection message never contains the secret value — nothing to leak, but confirmed anyway', () => {
    try {
      validateAuthSecret(KNOWN_SAMPLE_JWT_ACCESS_SECRET, true);
      throw new Error('expected validateAuthSecret to throw');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(KNOWN_SAMPLE_JWT_ACCESS_SECRET);
    }
  });
});

/**
 * End-to-end through the real loader — proves the wiring (env vars ->
 * validateAuthSecret) is actually connected, not just that the standalone
 * function works in isolation.
 */
describe('configuration() — JWT placeholder rejection wiring', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws when NODE_ENV=production and JWT_ACCESS_SECRET is still the sample placeholder', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_ACCESS_SECRET = KNOWN_SAMPLE_JWT_ACCESS_SECRET;

    expect(() => configuration()).toThrow(/placeholder/i);
  });

  it('does not throw when NODE_ENV=production and a real secret is set', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_ACCESS_SECRET =
      'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6';

    expect(() => configuration()).not.toThrow();
  });

  it('does not throw when NODE_ENV is development and JWT_ACCESS_SECRET is the sample placeholder (quick-start path stays intact)', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_ACCESS_SECRET = KNOWN_SAMPLE_JWT_ACCESS_SECRET;

    expect(() => configuration()).not.toThrow();
    expect(configuration().auth.accessTokenSecret).toBe(
      KNOWN_SAMPLE_JWT_ACCESS_SECRET,
    );
  });
});
