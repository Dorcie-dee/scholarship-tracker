# Scholarship OS — Backend

Production-oriented NestJS API for personal scholarship and university application management.

This service is the single source of truth for application state. The Next.js frontend talks only to this API — never directly to PostgreSQL, Redis, Cloudinary, or SMTP.

It is an **independent project** (own `package.json`, lockfile, and env files). It does not share packages with [`../frontend`](../frontend). Domain enums and auth response shapes are duplicated by hand in `src/types.ts` ↔ `../frontend/src/lib/shared-types.ts` — see [Independent repos](../docs/decisions.md).

---

## Stack

| Concern | Choice |
| ------- | ------ |
| Runtime | NestJS 11, Node.js 20.9+ |
| Persistence | TypeORM 0.3 + PostgreSQL |
| Auth | Passport JWT access tokens + httpOnly refresh cookies |
| Files | Cloudinary (documents only) |
| Rate limits | `@nestjs/throttler` — Redis-backed when `REDIS_URL` is set |
| Email | SMTP via Nodemailer (dev log transport when SMTP is unset) |
| Validation | `class-validator` / `class-transformer` (`whitelist` + `forbidNonWhitelisted`) |

Base URL (local default): **`http://localhost:8769/api`**

---

## Prerequisites

- Node.js **20.9+** and Yarn Classic (`yarn@1.22.x`)
- PostgreSQL **14+** (native install **or** Docker via `docker-compose.yml` in this directory)
- Optional: Redis (multi-instance rate limiting), Cloudinary (document uploads), SMTP (real email)

---

## Quick start

### 1. Install and configure

```bash
cd backend
yarn install
cp sample.env .env
```

`sample.env` is both the annotated reference and a working local default. For anything beyond a throwaway try, replace the JWT placeholder:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# paste into JWT_ACCESS_SECRET in .env
```

### 2. Database

**Option A — native Postgres** (matches `sample.env`):

```bash
psql postgres -c "CREATE ROLE scholarship_os LOGIN PASSWORD 'scholarship_os_dev_password';"
psql postgres -c "CREATE DATABASE scholarship_os_dev OWNER scholarship_os;"
```

**Option B — Docker**:

```bash
docker compose up -d
# credentials already match sample.env
```

Then migrate (and optionally seed):

```bash
yarn migration:run
yarn seed    # optional — DESTRUCTIVE wipe + demo data; blocked when NODE_ENV=production
```

Seed login (from `sample.env`):

| | |
| - | - |
| Email | `demo@scholarship-os.local` |
| Password | value of `SEED_USER_PASSWORD` in `.env` |

### 3. Run

```bash
yarn start:dev
```

You should see Nest bootstrap logs ending in route maps. Confirm:

```bash
curl -s http://localhost:8769/api/health
# {"status":"ok","timestamp":"2026-09-12T14:00:00.000Z"}

curl -s http://localhost:8769/api/health/ready
# {"status":"ok","timestamp":"2026-09-12T14:00:00.000Z"}
```

| Endpoint | Meaning |
| -------- | ------- |
| `GET /api/health` | **Liveness** — process is up (no DB check; safe to poll often) |
| `GET /api/health/ready` | **Readiness** — `SELECT 1` against Postgres; `503` if the DB is unreachable |

---

## Environment

Exactly two env files:

| File | Role |
| ---- | ---- |
| `.env` | Real secrets — **gitignored**, never commit |
| `sample.env` | Committed template + local defaults |

### Load-bearing variables

| Variable | Notes |
| -------- | ----- |
| `API_PORT` | Default `8769` |
| `FRONTEND_URL` | Exact origin for CORS (scheme + host + port) |
| `POSTGRES_*` | Host, port, db, user, password, SSL — works for local, Docker, Neon, RDS, … |
| `JWT_ACCESS_SECRET` | Must be random in production — placeholder is rejected at boot |
| `JWT_ACCESS_EXPIRES_IN` | Default `15m` |
| `EMAIL_SMTP_*` | Blank in local → emails logged to console; **required** in production |
| `CLOUDINARY_*` | Optional at boot; uploads fail clearly until set |
| `REDIS_URL` | Optional single-instance; strongly recommended for multi-instance |
| `TRUST_PROXY_HOPS` | Reverse-proxy count for real client IP (usually `0` local, `1` behind one LB) |
| `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` | Demo account used by `yarn seed` |

Full annotations live in `sample.env`. Production fail-fast rules: [`../docs/deployment.md`](../docs/deployment.md).

---

## Auth model (what to expect)

| Piece | Behavior |
| ----- | -------- |
| Access token | Short-lived JWT in the JSON body — send as `Authorization: Bearer <token>` |
| Refresh token | httpOnly cookie — used by `POST /auth/refresh` / logout; not returned in JSON |
| Default posture | Routes require auth unless marked `@Public()` |
| Roles | `user` (default) · `admin` — catalog mutations and `GET /users` are ADMIN-only |
| Email verification | OTP issued on register (best-effort email); gated endpoints as documented in the API reference |

### Example: register → login → call a protected route

```bash
# Register (also issues tokens + sets refresh cookie)
curl -s -c cookies.txt -X POST http://localhost:8769/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"a-strong-password-here","name":"You"}'
```

**Successful auth response shape** (`register` / `login` / `refresh`):

```json
{
  "accessToken": "<jwt>",
  "accessTokenExpiresAt": "2026-09-12T14:15:00.000Z",
  "user": {
    "id": "…",
    "email": "you@example.com",
    "name": "You",
    "isVerified": false,
    "role": "user",
    "createdAt": "2026-09-12T14:00:00.000Z"
  }
}
```

`passwordHash` and refresh tokens never appear in JSON.

```bash
# Login (seed user)
curl -s -c cookies.txt -X POST http://localhost:8769/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@scholarship-os.local","password":"dev_only_demo_password_1234"}'

# Use the access token
TOKEN='<paste accessToken>'
curl -s http://localhost:8769/api/users/me \
  -H "Authorization: Bearer $TOKEN"
```

Silent refresh (cookie from `-c cookies.txt`):

```bash
curl -s -b cookies.txt -c cookies.txt -X POST http://localhost:8769/api/auth/refresh
```

---

## API conventions

Every route lives under `/api`. Full catalog: [`../docs/api-reference.md`](../docs/api-reference.md).

### Validation

Bodies are validated with DTOs. Unknown fields are **rejected** (`forbidNonWhitelisted: true`), not silently dropped. Expect `400` with a `message` array from `class-validator` when input is wrong.

### Errors

All failures share one envelope (see `src/common/filters/http-exception.filter.ts`):

```json
{
  "statusCode": 403,
  "message": "You don’t have permission to do that.",
  "error": "Forbidden",
  "path": "/api/users",
  "timestamp": "2026-09-12T14:00:00.000Z",
  "requestId": "…"
}
```

| Detail | Notes |
| ------ | ----- |
| `X-Request-Id` | Also set on the response header — same value as `requestId` for log correlation |
| 401 | Missing/invalid/expired access token |
| 403 | Authenticated but not allowed (wrong role, ownership, self-role-change, …) |
| 404 | Missing resource (and often “not yours” — ownership is not leaked as 403 for foreign IDs where designed that way) |
| 409 | Conflicts (e.g. duplicate email) |
| 429 | Rate limited |
| 503 | Dependency unavailable (e.g. readiness DB down; strict auth routes when Redis is required and down) |

Internal driver/stack details are never returned to clients.

### Pagination

List endpoints use **keyset** pagination (never offset/`COUNT(*)` totals):

```json
{
  "items": [ /* … */ ],
  "nextCursor": "<opaque-or-null>",
  "hasNextPage": true
}
```

Pass `cursor` + `limit` (default page size is configured server-side) to fetch the next page. Filters belong in the query string and reset the cursor chain when changed.

### Ownership & RBAC

- User-owned resources (journeys, applications, documents, …) are scoped to the caller.
- Shared catalog (`universities`, `programmes`, `opportunities`): **read** any authenticated user; **write** ADMIN.
- `opportunity-sources`: full CRUD for any authenticated user (by design — see decisions).
- `GET /users` + `PATCH /users/:id/role`: ADMIN only; live DB role is re-checked on `@Roles()` routes so demotion takes effect even with a stale JWT claim.

---

## Scripts

| Script | Purpose |
| ------ | ------- |
| `yarn start:dev` | Watch mode — primary local workflow |
| `yarn start:debug` | Watch + Node inspector |
| `yarn build` | Compile to `dist/` |
| `yarn start:prod` | Run compiled `dist/main` |
| `yarn lint` | ESLint with `--fix` |
| `yarn format` | Prettier for `src/` and `test/` |
| `yarn migration:generate <path>` | Diff entities → new migration |
| `yarn migration:run` | Apply pending migrations |
| `yarn migration:revert` | Revert last migration |
| `yarn seed` | Destructive demo reseed |

---

## Testing

Integration layers intentionally do **not** use your `.env` database. They are hardcoded to a local DB named **`scholarship_os_test`** so a Neon/dev URL in `.env` cannot be wiped by tests.

### One-time test DB setup

```bash
psql postgres -c "CREATE DATABASE scholarship_os_test OWNER scholarship_os;"

POSTGRES_HOST=localhost POSTGRES_PORT=5432 POSTGRES_USER=scholarship_os \
  POSTGRES_PASSWORD=scholarship_os_dev_password POSTGRES_DB=scholarship_os_test \
  POSTGRES_SSL=false yarn migration:run
```

### Suite matrix

| Command | What it proves | Needs DB? |
| ------- | -------------- | --------- |
| `yarn test` | Unit tests — services, guards, helpers with mocked repos | No |
| `yarn test:db-integration` | Constraints, cascades, ORM behavior | Yes (`scholarship_os_test`) |
| `yarn test:http-integration` | Real HTTP through the real Nest app + Postgres | Yes |
| `yarn test:concurrency` | Simultaneous requests, locks, races | Yes |
| `yarn test:failure-recovery` | Unreachable Postgres / Redis / SMTP behavior | Yes / mocked outages |
| `yarn test:e2e` | Legacy session-lifecycle assertions | Yes |
| `yarn load-test` | Latency / throughput via autocannon (not pass/fail) | Running app |

Run unit tests anytime. Prefer `--runInBand` / `--forceExit` on integration suites in CI as documented in [`../docs/development.md`](../docs/development.md).

---

## Project structure

```
backend/
├── sample.env                 # Env template (committed)
├── docker-compose.yml         # Optional local Postgres 16
├── src/
│   ├── main.ts                # Process entry
│   ├── bootstrap.ts           # Shared app config (prefix, CORS, validation, helmet, …)
│   ├── app.module.ts          # Root module + global guards
│   ├── types.ts               # Domain enums + auth DTOs (mirrored in frontend)
│   ├── config/                # Typed configuration + production validation
│   ├── database/              # DataSource, migrations, seed
│   ├── common/                # Pagination, throttling, Redis, email, Cloudinary,
│   │                          # logging, filters, ownership helpers, URL fetch
│   ├── auth/                  # Register, login, refresh, sessions, password reset
│   ├── users/                 # /me, account erasure, ADMIN directory + role PATCH
│   ├── profile/               # Master applicant profile
│   ├── universities/ · programmes/ · opportunities/ · opportunity-sources/
│   ├── journeys/ · applications/ · requirements/ · tasks/ · deadlines/ · documents/
│   └── …
└── test/                      # e2e, http-integration, db-integration, concurrency,
                               # failure-recovery, load
```

Each domain module typically follows:

```
src/<module>/
├── entities/
├── dto/
├── <module>.service.ts
├── <module>.controller.ts
├── <module>.module.ts
└── *.spec.ts                  # co-located unit tests where present
```

---

## Migrations

Schema changes go through TypeORM migrations under `src/database/migrations/` — never rely on `synchronize` in shared or production databases.

```bash
# After editing entities:
yarn migration:generate src/database/migrations/ShortDescriptiveName
yarn migration:run
```

Always include a working `down()` when generating or hand-writing migrations. Local verification against `scholarship_os_test` is the expected bar before merge.

---

## Production notes (operator summary)

- **Fail fast** if `NODE_ENV=production` and `JWT_ACCESS_SECRET` is still the placeholder, or SMTP is missing.
- Set `FRONTEND_URL` to the exact deployed origin; set `TRUST_PROXY_HOPS` correctly behind a load balancer.
- Prefer `POSTGRES_SSL=true` on managed Postgres.
- Configure Cloudinary before expecting document uploads to succeed.
- Use `REDIS_URL` once you run more than one API instance.
- Probe **`/api/health`** for liveness and **`/api/health/ready`** for readiness — do not conflate them in orchestration.

Details: [`../docs/deployment.md`](../docs/deployment.md).

---

## Troubleshooting

| Symptom | Likely cause |
| ------- | ------------ |
| `Cannot find module './…'` after a watch rebuild | Stale `dist/` race — stop the watcher, `rm -rf dist`, `yarn start:dev` |
| Readiness `503` / TypeORM retry loop | Wrong `POSTGRES_*`, DB not running, or SSL mismatch |
| CORS failures from the UI | `FRONTEND_URL` must match the browser origin exactly |
| `401` on every request after reload | Access token is in-memory on the client — refresh cookie must succeed via `POST /auth/refresh` |
| Uploads fail | Cloudinary env vars unset |
| Auth routes `503` under load | Strict rate-limit paths fail closed when Redis is configured but unreachable |

---

## Further documentation

| Document | Contents |
| -------- | -------- |
| [`../docs/api-reference.md`](../docs/api-reference.md) | Every endpoint by module |
| [`../docs/domain-model.md`](../docs/domain-model.md) | Entities and relationships |
| [`../docs/architecture.md`](../docs/architecture.md) | Request flow, auth, layout |
| [`../docs/development.md`](../docs/development.md) | Full local setup for both apps |
| [`../docs/deployment.md`](../docs/deployment.md) | Production configuration |
| [`../docs/validation.md`](../docs/validation.md) | Validation conventions |
| [`../docs/decisions.md`](../docs/decisions.md) | Why non-obvious choices were made |
| [`../README.md`](../README.md) | Repository overview |
