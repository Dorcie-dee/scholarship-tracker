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

```bash
cd backend
yarn test        # unit tests (Jest, mocked repositories — no database needed)
yarn test:e2e    # e2e tests against a real Postgres — see below
yarn lint

cd frontend
yarn lint
yarn build       # also type-checks and prerenders static routes
```

### e2e tests use a separate database

`backend/test/jest-e2e.json` loads `backend/test/setup-env.ts` (via `setupFiles`), which sets
`POSTGRES_DB=scholarship_os_test` directly on `process.env` before the app boots — e2e tests never
touch your dev data, with no third env file needed (backend has deliberately only `.env` and
`sample.env` — see `decisions.md`). That database needs to exist on whichever Postgres server your
`.env` points at. For local Postgres, create and migrate it once:

```bash
psql postgres -c "CREATE DATABASE scholarship_os_test OWNER scholarship_os;"
cd backend
POSTGRES_DB=scholarship_os_test yarn migration:run
```

(Setting `POSTGRES_DB` on the shell overrides `.env`'s value — `dotenv` never clobbers an
already-set environment variable.) If `.env` points at a managed provider instead, create the
`scholarship_os_test` database there first (e.g. a second Neon branch/database).

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
