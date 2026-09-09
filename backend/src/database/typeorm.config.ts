import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AppConfig } from '../config/configuration';

/**
 * Connection factory for the running Nest app (as opposed to `data-source.ts`,
 * which is CLI-only — see that file's comment). Reads through Nest's
 * ConfigService so it participates in the same validated config object as the
 * rest of the app.
 *
 * `synchronize` is always false: schema changes only ever happen via migrations
 * (see package.json's migration:* scripts), even in development, so what we
 * test against matches what production will run.
 */
export function buildTypeOrmOptions(
  configService: ConfigService<AppConfig, true>,
): TypeOrmModuleOptions {
  const db = configService.get('database', { infer: true });

  return {
    type: 'postgres',
    host: db.host,
    port: db.port,
    username: db.user,
    password: db.password,
    database: db.name,
    // Managed providers (Neon, RDS, Heroku, ...) typically require SSL.
    // rejectUnauthorized: false because we don't ship/verify a CA bundle for
    // whichever provider is in use — acceptable here, see docs/decisions.md.
    ssl: db.ssl ? { rejectUnauthorized: false } : false,
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/migrations/*{.ts,.js}'],
    synchronize: false,
    autoLoadEntities: true,
  };
}
