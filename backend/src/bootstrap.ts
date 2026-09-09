import {
  ClassSerializerInterceptor,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { AppConfig } from './config/configuration';

/**
 * Applies every global app-level setting (prefix, cookies, CORS, validation,
 * serialization, error shape). Shared by main.ts (the real server) and the
 * e2e test suite (test/*.e2e-spec.ts), so tests exercise the exact same
 * pipeline production traffic goes through instead of a hand-rolled subset.
 */
export function configureApp(app: INestApplication): void {
  const configService = app.get(ConfigService<AppConfig, true>);

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
}
