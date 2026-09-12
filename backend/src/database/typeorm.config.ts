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
 *
 * Production hardening — connection pool (see docs/decisions.md, "Connection
 * pool sizing"): explicit `max`/`min`/timeouts via `extra` (node-postgres's
 * own `Pool` options, which `pg` — TypeORM's postgres driver — passes
 * straight through), instead of relying on node-postgres's undocumented-in-
 * this-codebase defaults.
 *
 * `statement_timeout` is deliberately NOT set here. Both ways `pg` can send it
 * as a plain connection option (`extra.statement_timeout`, or
 * `extra.options: '-c statement_timeout=...'`) put it in the Postgres
 * *startup packet* — confirmed empirically against this project's actual Neon
 * endpoint: `options=-c statement_timeout=...` is rejected outright
 * ("unsupported startup parameter... Please use unpooled connection"), and
 * plain `statement_timeout` in the startup packet is silently ignored (the
 * pooled connection accepts it but `SHOW statement_timeout` still reports the
 * server default). Neon's pooler does not forward those startup parameters.
 * The timeout is instead applied via an explicit `SET statement_timeout = ...`
 * query issued on each new physical connection — see
 * `database/statement-timeout.provider.ts`, which IS confirmed working
 * against the same pooled endpoint (`pg_sleep(20)` genuinely cancelled at the
 * configured timeout).
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
    extra: {
      max: db.pool.max,
      min: db.pool.min,
      connectionTimeoutMillis: db.pool.connectionTimeoutMillis,
      idleTimeoutMillis: db.pool.idleTimeoutMillis,
    },
  };
}
