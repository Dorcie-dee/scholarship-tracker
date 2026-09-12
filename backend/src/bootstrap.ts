import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { AppConfig } from './config/configuration';

/**
 * Maximum JSON/urlencoded request body size. Document *content* never goes
 * through this path — uploads are multipart, handled by Multer with its own
 * separate, much larger `fileSize` limit (see documents.controller.ts) — so
 * this only bounds ordinary API request bodies (DTOs). 256kb is generous
 * headroom over any legitimate payload this API accepts (the largest
 * plausible body is ApplicantProfile's jsonb arrays, themselves now
 * additionally bounded — see profile/dto/update-profile.dto.ts) while still
 * being small enough that an oversized-body request fails fast, cheaply, at
 * the parsing layer rather than reaching application code.
 */
const MAX_JSON_BODY_BYTES = '256kb';

/**
 * Applies every global app-level setting (prefix, cookies, CORS, validation,
 * serialization, error shape, proxy trust, body limits). Shared by main.ts
 * (the real server) and the e2e test suite (test/*.e2e-spec.ts), so tests
 * exercise the exact same pipeline production traffic goes through instead
 * of a hand-rolled subset.
 *
 * Requires the app to have been created with `bodyParser: false` (see
 * main.ts) — `useBodyParser()` below is how an explicit, intentional size
 * limit gets applied instead of silently inheriting whatever Express's
 * body-parser dependency currently defaults to (Batch 8 — previously this
 * project relied on that undocumented default).
 */
export function configureApp(app: NestExpressApplication): void {
  const configService = app.get(ConfigService<AppConfig, true>);

  // Production hardening (Batch 1) — how many reverse-proxy hops to trust
  // when resolving the real client IP from X-Forwarded-For. This MUST be set
  // before anything reads `req.ip` (rate limiting, RefreshSession.ipAddress)
  // — see the `trustProxyHops` config field's own doc comment for why the
  // default (0) is safe and why this must match the real deployment
  // topology, not just be set to a large number "to be safe" (that would let
  // a client forge the trusted portion of the header itself).
  app.set('trust proxy', configService.get('trustProxyHops', { infer: true }));

  // Production hardening (Batch 10) — standard security response headers
  // (X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security,
  // Referrer-Policy, Cross-Origin-Opener-Policy, etc.). Default `helmet()`
  // config, deliberately not customized: this is a pure JSON API (no HTML
  // ever served, no inline scripts/styles to permit or deny), so helmet's
  // default Content-Security-Policy — meaningful for HTML-serving apps — has
  // nothing to actually protect here; the value is in the other headers,
  // which apply the same way regardless. Cloudinary document downloads go
  // directly from the browser to Cloudinary's own domain (see
  // documents.controller.ts's :id/download-url), never proxied through this
  // API, so nothing here affects that path.
  app.use(helmet());

  app.useBodyParser('json', { limit: MAX_JSON_BODY_BYTES });
  app.useBodyParser('urlencoded', {
    limit: MAX_JSON_BODY_BYTES,
    extended: true,
  });

  // Every route is served under /api — matches frontend's NEXT_PUBLIC_API_URL.
  app.setGlobalPrefix('api');

  app.use(cookieParser());

  app.enableCors({
    origin: configService.get('frontendUrl', { infer: true }),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Strips @Exclude()-marked fields (e.g. User.passwordHash) from every
  // response, in addition to the query-level `select: false` defense — see
  // users/entities/user.entity.ts.
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  app.useGlobalFilters(new AllExceptionsFilter());

  // Production hardening (Batch 1) — lets Nest's lifecycle hooks
  // (OnModuleDestroy/OnApplicationShutdown, which TypeORM's own DataSource
  // uses to close its connection pool) actually run on SIGTERM/SIGINT,
  // instead of the process being killed without a clean drain. Off by
  // default in Nest; must be explicitly opted into.
  app.enableShutdownHooks();
}
