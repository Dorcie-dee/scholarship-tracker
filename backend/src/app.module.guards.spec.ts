import { APP_GUARD } from '@nestjs/core';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppModule } from './app.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { ProductionThrottlerGuard } from './common/throttler/production-throttler.guard';

/**
 * Track 1 hardening pass, §2.1 — verifies ThrottlerGuard is genuinely
 * registered as a global APP_GUARD by reading AppModule's own `@Module()`
 * metadata (the exact data Nest's DI container itself reads to wire
 * providers — see @nestjs/common's Module decorator, which is
 * Reflect.defineMetadata under the hood). Deliberately does NOT boot
 * AppModule (that would open a real database connection via
 * TypeOrmModule.forRootAsync — integration-test territory, not appropriate
 * for a unit-test file) — this reads the static metadata only.
 */
describe('AppModule — guard wiring', () => {
  const providers = Reflect.getMetadata(
    MODULE_METADATA.PROVIDERS,
    AppModule,
  ) as unknown[];
  const imports = Reflect.getMetadata(
    MODULE_METADATA.IMPORTS,
    AppModule,
  ) as Array<{
    module?: unknown;
  }>;

  it('registers JwtAuthGuard as a global APP_GUARD', () => {
    const match = providers.find(
      (p): p is { provide: unknown; useClass: unknown } =>
        typeof p === 'object' &&
        p !== null &&
        'provide' in p &&
        p.provide === APP_GUARD &&
        (p as { useClass: unknown }).useClass === JwtAuthGuard,
    );
    expect(match).toBeDefined();
  });

  it('registers RolesGuard and ProductionThrottlerGuard as further, independent global APP_GUARDs (3 total)', () => {
    const matches = providers.filter(
      (p): p is { provide: unknown; useClass: unknown } =>
        typeof p === 'object' &&
        p !== null &&
        'provide' in p &&
        p.provide === APP_GUARD,
    );
    expect(matches).toHaveLength(3);
    expect(matches.some((m) => m.useClass === ProductionThrottlerGuard)).toBe(
      true,
    );
    expect(matches.some((m) => m.useClass === RolesGuard)).toBe(true);
  });

  it('registers JwtAuthGuard BEFORE RolesGuard — RolesGuard reads request.user, which only JwtAuthGuard populates', () => {
    const guardOrder = providers
      .filter(
        (p): p is { provide: unknown; useClass: unknown } =>
          typeof p === 'object' &&
          p !== null &&
          'provide' in p &&
          p.provide === APP_GUARD,
      )
      .map((p) => p.useClass);

    expect(guardOrder.indexOf(JwtAuthGuard)).toBeLessThan(
      guardOrder.indexOf(RolesGuard),
    );
  });

  it('imports a ThrottlerModule-derived dynamic module', () => {
    expect(imports.some((i) => i.module === ThrottlerModule)).toBe(true);
  });
});
