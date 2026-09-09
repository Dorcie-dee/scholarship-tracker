import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';

/**
 * Standalone TypeORM DataSource used ONLY by the TypeORM CLI (migration
 * generate/run/revert — see package.json scripts) and by e2e tests that need a
 * raw DataSource. The running Nest app itself gets its connection from
 * `database/typeorm.config.ts` via `TypeOrmModule.forRootAsync`, which reads
 * from Nest's ConfigService instead of `process.env` directly.
 *
 * Both files must describe the same physical database and see the same
 * entities/migrations, so keep them in sync if one changes.
 */
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  // POSTGRES_* naming — see configuration.ts's matching comment.
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  username: process.env.POSTGRES_USER ?? 'scholarship_os',
  password: process.env.POSTGRES_PASSWORD ?? '',
  database: process.env.POSTGRES_DB ?? 'scholarship_os_dev',
  // Managed providers (Neon, RDS, Heroku, ...) typically require SSL.
  // rejectUnauthorized: false because we don't ship/verify a CA bundle for
  // whichever provider is in use — acceptable here, see docs/decisions.md.
  ssl:
    process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
};

export default new DataSource(dataSourceOptions);
