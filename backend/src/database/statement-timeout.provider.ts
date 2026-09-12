import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppConfig } from '../config/configuration';

/** The minimal shape this provider needs from node-postgres's `Pool` — see this file's own doc comment on why it's reached via a driver internal, not a typed public API. */
interface MinimalPgPool {
  on(
    event: 'connect',
    listener: (client: { query: (sql: string) => Promise<unknown> }) => void,
  ): void;
}

function isMinimalPgPool(value: unknown): value is MinimalPgPool {
  return (
    typeof value === 'object' &&
    value !== null &&
    'on' in value &&
    typeof value.on === 'function'
  );
}

/**
 * Applies `statement_timeout` to every physical connection this app's
 * connection pool opens — a server-side backstop so a single pathological
 * query can never hold a connection (and, under load, a pool slot)
 * indefinitely. See docs/decisions.md, "Statement timeout" for the full
 * story of why this exists as a separate provider instead of a plain
 * TypeORM connection option.
 *
 * Deliberately NOT a `statement_timeout` (or `options: '-c statement_timeout
 * =...'`) entry in `buildTypeOrmOptions()`'s `extra` — both of those put the
 * value in the Postgres *startup packet*, and this project's actual Neon
 * endpoint doesn't honor it there: `options=...` is rejected outright by
 * Neon's pooler, and a plain `statement_timeout` startup parameter is
 * silently dropped (confirmed empirically — `SHOW statement_timeout` still
 * reported the server default afterward). Issuing `SET statement_timeout =
 * ...` as a real query immediately after each new connection, instead of as
 * a connection parameter, IS honored by the same pooled endpoint — confirmed
 * empirically with a real `pg_sleep()` genuinely cancelled at the configured
 * threshold.
 *
 * Reaches into `dataSource.driver.master` (the underlying node-postgres
 * `Pool` for the non-replicated case this app uses) because TypeORM 0.3 has
 * no first-class "run this after every new physical connection" hook. This
 * is a real internal, not a documented public API — if a future TypeORM
 * upgrade removes/renames it, this provider will need updating; it's
 * isolated to this one file specifically so that's a contained, obvious
 * failure (a startup warning logged, not a silent no-op) rather than a
 * scattered one.
 */
@Injectable()
export class StatementTimeoutProvider implements OnApplicationBootstrap {
  private readonly logger = new Logger(StatementTimeoutProvider.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  onApplicationBootstrap(): void {
    const { statementTimeoutMillis } = this.configService.get('database', {
      infer: true,
    }).pool;

    const driver: unknown = this.dataSource.driver;
    const master =
      typeof driver === 'object' && driver !== null && 'master' in driver
        ? driver.master
        : undefined;

    if (!isMinimalPgPool(master)) {
      this.logger.warn(
        'Could not attach statement_timeout to the connection pool (driver.master ' +
          'not found or not a node-postgres Pool) — queries have no server-side ' +
          'timeout backstop. This likely means a TypeORM driver internal changed; ' +
          'see statement-timeout.provider.ts.',
      );
      return;
    }
    const pool = master;

    pool.on(
      'connect',
      (client: { query: (sql: string) => Promise<unknown> }) => {
        client
          .query(`SET statement_timeout = ${statementTimeoutMillis}`)
          .catch((error: unknown) => {
            this.logger.warn(
              `Failed to set statement_timeout on a new connection: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          });
      },
    );

    this.logger.log(
      `statement_timeout set to ${statementTimeoutMillis}ms for all new database connections.`,
    );
  }
}
