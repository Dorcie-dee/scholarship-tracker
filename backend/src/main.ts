// Final verification pass — explicit, not relied-on-transitively. This app's
// decorator-heavy code (TypeORM entities, class-validator/class-transformer
// DTOs, Nest's own DI) all depend on the `reflect-metadata` polyfill being
// loaded before any decorated class is defined. It happened to already work
// in the real running app (pulled in as a side effect of `@nestjs/core`'s own
// internal imports) — but that's an implementation detail of Nest's current
// internals, not a guarantee. Declaring it explicitly, first, here — the
// standard convention for any app using these decorators — makes the
// dependency real rather than accidental. Test configs need the identical
// polyfill for the same reason; see each `test/jest-*.json`'s `setupFiles`.
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { AppConfig } from './config/configuration';
import { StructuredLoggerService } from './common/logging/structured-logger.service';

async function bootstrap() {
  // `bodyParser: false` — configureApp() attaches its own, explicitly
  // size-limited body parsers via `useBodyParser()` instead of inheriting
  // Nest's automatic default (Batch 8 — see bootstrap.ts's doc comment).
  //
  // `logger: new StructuredLoggerService()` (Batch 10) — replaces Nest's
  // default app-wide, so every existing `new Logger(ClassName.name)` call
  // site across this codebase automatically gets correlated/structured
  // output with no per-call-site change — see that class's doc comment.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: new StructuredLoggerService(),
  });
  configureApp(app);

  const configService = app.get(ConfigService<AppConfig, true>);
  const port = configService.get('apiPort', { infer: true });
  await app.listen(port);
}
void bootstrap();
