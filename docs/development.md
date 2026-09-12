# Development guide

`backend` and `frontend` are independent projects (see `architecture.md`, "Independent repos, not a
monorepo") — every command below is run from *inside* the relevant app's directory, not from the
repo root. There is no root `package.json` to run things through.

## Prerequisites

- Node.js 20.9+ and Yarn Classic (`yarn@1.22.x` — pinned via `packageManager` in each app's own
  `package.json`)
- A local PostgreSQL server (or `docker compose up -d` from inside `backend/` — see
  `backend/docker-compose.yml`)

## First-time setup

```bash
cd backend
yarn install
cp sample.env .env    # the only two env files here — annotated reference AND ready-to-run default
# before doing anything beyond a quick local try, replace JWT_ACCESS_SECRET with a real random value:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# Create the database (matches sample.env's defaults)
psql postgres -c "CREATE ROLE scholarship_os LOGIN PASSWORD 'scholarship_os_dev_password';"
psql postgres -c "CREATE DATABASE scholarship_os_dev OWNER scholarship_os;"

yarn migration:run
yarn seed    # optional — populates realistic demo data, see below
```

```bash
cd frontend
yarn install
cp .env.example .env.local
```

`yarn seed` prints the login email it used (`SEED_USER_EMAIL`, default
`demo@scholarship-os.local`) — the password is whatever you set `SEED_USER_PASSWORD` to in
`backend/.env`. The seed script **wipes and reseeds** the database every time it runs — it refuses to
run when `NODE_ENV=production`, but treat it as destructive against whatever database it's pointed
at.

## Running

Two terminals, one per app:

```bash
cd backend  && yarn start:dev   # http://localhost:8769/api
cd frontend && yarn dev         # http://localhost:3000
```

## Testing

Seven distinct layers, added incrementally through the Production Hardening pass (see
`decisions.md`) — each proves something the layers around it structurally cannot, and none replaces
another:

```bash
cd backend
yarn test                   # unit tests (Jest, mocked repositories — no database needed)
yarn test:db-integration    # real local Postgres: constraints, cascades, ORM behaviors
yarn test:http-integration  # real HTTP requests through the real app + real local Postgres
yarn test:concurrency       # real simultaneous requests against real Postgres — row locks, races
yarn test:failure-recovery  # real unreachable Postgres/Redis/SMTP — outage/degradation behavior
yarn load-test               # autocannon against the real app — latency/throughput, not pass/fail
yarn test:e2e                 # legacy session-lifecycle suite — now safe to run, see below
yarn lint

cd frontend
yarn lint
yarn build       # also type-checks and prerenders static routes
```

### `test:db-integration` / `test:http-integration` / `test:concurrency` / `test:failure-recovery` / `load-test` / `test:e2e`

All six are **hardcoded to a local Postgres database named `scholarship_os_test`** — `localhost:5432`,
role `scholarship_os` — deliberately never derived from `.env` (see
`test/db-integration/test-data-source.ts` and `test/http-integration/setup-env.ts`'s own doc comments
for why; `test/setup-env.ts`, loaded by `test:e2e`, was fixed to the same hardcoded pattern during the
final verification pass — see `decisions.md`, "Final verification pass"). Create and migrate that
database once:

```bash
psql postgres -c "CREATE DATABASE scholarship_os_test OWNER scholarship_os;"
cd backend
POSTGRES_HOST=localhost POSTGRES_PORT=5432 POSTGRES_USER=scholarship_os \
  POSTGRES_PASSWORD=scholarship_os_dev_password POSTGRES_DB=scholarship_os_test \
  POSTGRES_SSL=false yarn migration:run
```

then all six commands need no further setup, regardless of what `.env` points at. They coexist safely
with `yarn test` (which touches no database at all) and with each other (`test:db-integration` uses one
rolled-back transaction per test; the others clean up exactly the rows they create, by a
unique-per-run prefix — never a blanket `TRUNCATE`). `test:e2e`'s two suites
(`app.e2e-spec.ts`/`auth.e2e-spec.ts`) reuse the same `bootstrapTestApp()` helper the HTTP integration
layer uses, and overlap substantially with `test/http-integration/auth-flow.http-integration-spec.ts`
— kept as a separate, optional layer rather than deleted (the original, more granular
session-lifecycle assertions — reuse-detection message content, a fresh-login-after-revocation cycle
— have their own value, and running it costs nothing once its connection target is safe).

For **any** of these five newer layers or a fixed e2e layer, create and migrate the database once:

```bash
psql postgres -c "CREATE DATABASE scholarship_os_test OWNER scholarship_os;"
cd backend
POSTGRES_HOST=localhost POSTGRES_PORT=5432 POSTGRES_USER=scholarship_os \
  POSTGRES_PASSWORD=scholarship_os_dev_password POSTGRES_DB=scholarship_os_test \
  POSTGRES_SSL=false yarn migration:run
```

## Migrations

Schema changes always go through TypeORM migrations — `synchronize` is `false` everywhere, including
local dev, so what you test against matches what a real deploy would run.

```bash
cd backend
yarn migration:generate src/database/migrations/DescriptiveName   # after changing an entity
yarn migration:run
yarn migration:revert    # undo the last one
```

## Adding a new domain module (backend)

Follow the existing modules as a template (e.g. `backend/src/universities/` for catalog-style data,
`backend/src/journeys/` for owned data):

1. Entity in `entities/`, extending `BaseEntity`.
2. DTOs in `dto/` (`CreateXDto`, `UpdateXDto extends PartialType(CreateXDto)`).
3. Service: repository injection + whatever ownership check applies (see
   `common/utils/ownership.ts` for the shared `assertOwnership` helper if the entity is directly
   user-owned).
4. Controller + module, registered in `app.module.ts`.
5. `yarn migration:generate` to capture the schema change.
6. If the change adds/renames an enum value, update **both** `backend/src/types.ts` and
   `frontend/src/lib/shared-types.ts` — see `decisions.md`, "Independent repos over a shared types
   package."
