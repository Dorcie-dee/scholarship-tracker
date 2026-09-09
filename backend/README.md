# Scholarship OS — backend

NestJS + TypeORM + PostgreSQL API. Independent of `../frontend` — see
`../docs/decisions.md`, "Independent repos over a shared types package," for why (and what that
trade-off costs).

## Setup

```bash
yarn install
cp sample.env .env    # the only two env files in this app — see "Environment" below

# Create the local database (matches sample.env's defaults)
psql postgres -c "CREATE ROLE scholarship_os LOGIN PASSWORD 'scholarship_os_dev_password';"
psql postgres -c "CREATE DATABASE scholarship_os_dev OWNER scholarship_os;"

yarn migration:run
yarn seed             # optional — populates realistic demo data, see below
yarn start:dev        # http://localhost:8769/api
```

At minimum, before doing anything beyond a quick local try, replace `JWT_ACCESS_SECRET` in `.env`
with a real random value:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Environment

Exactly two env files: `.env` (real, gitignored, never committed) and `sample.env` (committed —
both the annotated reference and a working local default in one file; `cp sample.env .env` and go).

Database credentials are generic `POSTGRES_*` vars (`POSTGRES_HOST`, `POSTGRES_PORT`,
`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_SSL`) — works against local
Postgres, Docker, or a managed provider (Neon, RDS, Heroku, ...). Set `POSTGRES_SSL=true` for
managed providers, which almost always require SSL; leave it `false` for local Postgres, which
almost never does.

## Scripts

| Script                 | What it does |
| ---------------------- | ------------ |
| `yarn start:dev`       | Dev server with hot reload |
| `yarn build`           | Compiles to `dist/` |
| `yarn start:prod`      | Runs the compiled build |
| `yarn lint`            | ESLint (`--fix`) |
| `yarn test`            | Unit tests (Jest, mocked repositories — no database needed) |
| `yarn test:e2e`        | e2e tests against a real Postgres — see "Testing" below |
| `yarn migration:generate <path>` | Generates a migration from entity changes |
| `yarn migration:run` / `yarn migration:revert` | Apply / undo migrations |
| `yarn seed`            | Wipes and reseeds the database with demo data — **destructive**, refuses to run when `NODE_ENV=production` |

## Testing

`test/jest-e2e.json` loads `test/setup-env.ts` (via `setupFiles`), which sets `POSTGRES_DB` (and a
couple of other test-only values) directly on `process.env` *before* the app boots — so e2e tests
run against a separate `scholarship_os_test` database and never touch your dev data, with no third
env file needed (see "Environment" above). That database must exist on whichever Postgres server
your `.env` points at — if you're pointed at local Postgres:

```bash
psql postgres -c "CREATE DATABASE scholarship_os_test OWNER scholarship_os;"
POSTGRES_DB=scholarship_os_test yarn migration:run
yarn test:e2e
```

(If `.env` points at a managed provider instead, create `scholarship_os_test` there — e.g. a second
Neon branch/database — before running the above.)

`test/setup-env.ts` is plain committed TypeScript, not an env file — it holds no real secrets, only
fixed test-only values, so e2e tests work immediately after a fresh clone with no setup beyond
creating the database.

## Structure

One module per domain concept under `src/`: `auth`, `users`, `profile`, `universities`,
`programmes`, `opportunities`, `opportunity-sources`, `requirements`, `deadlines`, `journeys`,
`applications`, `tasks`, `documents`. Each follows the same shape:

```
src/<module>/
├── entities/*.entity.ts   TypeORM entity, extends common/entities/base.entity.ts
├── dto/*.dto.ts           class-validator DTOs (CreateXDto, UpdateXDto extends PartialType)
├── <module>.service.ts    business logic + ownership checks
├── <module>.controller.ts REST endpoints
└── <module>.module.ts
```

`src/common/` holds cross-cutting pieces: the base entity, the global exception filter, the
Cloudinary service wrapper, and the shared `assertOwnership` helper. `src/database/` holds the
TypeORM `DataSource` (CLI-only — see that file's comment), the app's own TypeORM connection factory,
migrations, and the seed script. `src/types.ts` holds the domain enums + auth response shapes —
**this file is duplicated in `../frontend/src/lib/shared-types.ts`, kept manually in sync** (see
`../docs/decisions.md`).

## Further documentation

Cross-cutting docs that concern both this app and the frontend live in `../docs/`:

- [`../docs/architecture.md`](../docs/architecture.md) — overall stack, request flow, auth flow
- [`../docs/domain-model.md`](../docs/domain-model.md) — entities and how they relate
- [`../docs/api-reference.md`](../docs/api-reference.md) — every endpoint, by module
- [`../docs/decisions.md`](../docs/decisions.md) — why the non-obvious choices were made
- [`../docs/development.md`](../docs/development.md) — full local setup for both apps together
