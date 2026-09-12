import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration, { AppConfig } from './config/configuration';
import { buildTypeOrmOptions } from './database/typeorm.config';
import { StatementTimeoutProvider } from './database/statement-timeout.provider';
import { RedisModule, REDIS_CLIENT } from './common/redis/redis.module';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';
import { ProductionThrottlerGuard } from './common/throttler/production-throttler.guard';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProfileModule } from './profile/profile.module';
import { UniversitiesModule } from './universities/universities.module';
import { ProgrammesModule } from './programmes/programmes.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { OpportunitySourcesModule } from './opportunity-sources/opportunity-sources.module';
import { RequirementsModule } from './requirements/requirements.module';
import { DeadlinesModule } from './deadlines/deadlines.module';
import { JourneysModule } from './journeys/journeys.module';
import { ApplicationsModule } from './applications/applications.module';
import { TasksModule } from './tasks/tasks.module';
import { DocumentsModule } from './documents/documents.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RequestIdMiddleware } from './common/logging/request-id.middleware';
import type { Redis } from 'ioredis';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    // Lightweight in-process cron only (no queue/worker) — currently used
    // solely by AuthCleanupService's hourly purge. See docs/decisions.md.
    ScheduleModule.forRoot(),
    // @Global() — exported once here, injectable anywhere (RedisThrottlerStorage
    // below, and auth/login-guard.service.ts) without re-importing.
    RedisModule,
    /**
     * Production hardening (Batch 3) — storage is Redis-backed (shared across
     * every application instance) when REDIS_URL is configured, and the
     * package's own in-memory default otherwise — correct, unchanged
     * behavior for a single-instance deployment (dev/test included). See
     * docs/decisions.md, "Distributed rate limiting" for the full reasoning,
     * including the fail-open/fail-closed policy on a Redis outage (see
     * common/throttler/production-throttler.guard.ts).
     *
     * Route-specific limits (login, OTP, password reset, ...) are set
     * per-endpoint via @Throttle() in auth.controller.ts; this is only the
     * generous app-wide default.
     */
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [REDIS_CLIENT],
      useFactory: (redisClient: Redis | null) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
        storage: redisClient
          ? new RedisThrottlerStorage(redisClient)
          : undefined,
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) =>
        buildTypeOrmOptions(configService),
    }),
    AuthModule,
    UsersModule,
    ProfileModule,
    UniversitiesModule,
    ProgrammesModule,
    OpportunitiesModule,
    OpportunitySourcesModule,
    RequirementsModule,
    DeadlinesModule,
    JourneysModule,
    ApplicationsModule,
    TasksModule,
    DocumentsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Production hardening (Batch 1) — see its own doc comment.
    StatementTimeoutProvider,
    /**
     * Every route requires authentication by default (spec-appropriate default
     * for a personal-data app). Individual routes opt out with @Public() —
     * see auth/decorators/public.decorator.ts — rather than every module
     * remembering to opt IN.
     */
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    /**
     * Must be registered AFTER JwtAuthGuard: it reads `request.user`, which
     * only JwtAuthGuard's JwtStrategy populates. Global-guard execution
     * follows providers-array order (verified directly against
     * @nestjs/core's source, not assumed — see roles.guard.ts's doc
     * comment). No @Roles() on a route = no restriction, so this is inert
     * for the overwhelming majority of routes; only shared-catalog
     * mutation (University/Programme/Opportunity create/update/delete —
     * see those controllers) currently uses it. Minimal V1 RBAC foundation
     * — see docs/decisions.md, "RBAC: a minimal foundation, not a
     * permissions system".
     */
    { provide: APP_GUARD, useClass: RolesGuard },
    // Runs independently of JwtAuthGuard/@Public() — every route is
    // rate-limited regardless of authentication requirement. ProductionThrottlerGuard
    // (Batch 3) extends the stock ThrottlerGuard with a Redis-outage policy — see
    // its own doc comment; behaves identically to the stock guard when Redis
    // isn't configured.
    { provide: APP_GUARD, useClass: ProductionThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  /**
   * Production hardening (Batch 10) — `RequestIdMiddleware` runs as real
   * Express middleware, ahead of every guard/pipe/interceptor/controller
   * (Nest applies middleware before its own request pipeline), so the
   * correlation id it establishes is available for the entire request —
   * including the global guards above and the exception filter. See
   * request-id.middleware.ts.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
