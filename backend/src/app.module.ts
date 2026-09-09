import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration, { AppConfig } from './config/configuration';
import { buildTypeOrmOptions } from './database/typeorm.config';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    // In-memory storage (the package default) — correct for this app's
    // current single-instance deployment; see docs/decisions.md, "Rate
    // limiting: in-memory throttler, not Redis" for the migration path once
    // that's no longer true. Route-specific limits (login, OTP, password
    // reset, ...) are set per-endpoint via @Throttle() in auth.controller.ts;
    // this is only the generous app-wide default.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
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
    // rate-limited regardless of authentication requirement.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
