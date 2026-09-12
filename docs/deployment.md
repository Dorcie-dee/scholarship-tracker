# Deployment

Production Hardening Batch 17 — consolidates what an operator needs to run this backend in real
production, referencing the reasoning already recorded in `decisions.md` rather than repeating it.

## Required vs. optional configuration

Every environment variable is documented, with its default, in `backend/sample.env` — that file is
the authoritative reference; this section only calls out what's genuinely load-bearing for a
production deployment specifically.

**Required in production** (the app refuses to start without these — fail-fast, not a runtime
surprise):
- `JWT_ACCESS_SECRET` — must be a real random value, not the `sample.env` placeholder. Generate with
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Starting with the
  placeholder in `NODE_ENV=production` throws immediately (`configuration.ts`'s `validateAuthSecret`
  — see `decisions.md`, "JWT placeholder rejection in production").
- `EMAIL_SMTP_HOST` (plus `EMAIL_SMTP_PORT`/`EMAIL_SMTP_USER`/`EMAIL_SMTP_PASSWORD` as your provider
  requires) — production refuses to start without a real SMTP target configured (see
  `common/email/email.service.ts`'s `buildProvider()`). Any SMTP-speaking provider works (SES,
  SendGrid, Postmark, Mailgun, a corporate relay) — this app has no vendor-specific SDK dependency.
- `POSTGRES_HOST`/`POSTGRES_PORT`/`POSTGRES_DB`/`POSTGRES_USER`/`POSTGRES_PASSWORD` (or `DATABASE_URL`
  directly) and `POSTGRES_SSL=true` for a managed provider (Neon, RDS, Cloud SQL, ...).
- `FRONTEND_URL` — must match the deployed frontend's exact origin (scheme + host + port); used for
  CORS.
- `TRUST_PROXY_HOPS` — set to the exact number of reverse-proxy hops between the internet and this
  process (typically `1` for a single load balancer). Getting this wrong in either direction is a
  real security-relevant misconfiguration, not just a cosmetic one — see `configuration.ts`'s doc
  comment on `trustProxyHops`: too low silently breaks IP-based rate limiting and audit logging; too
  high lets a client forge the trusted portion of `X-Forwarded-For` and spoof its own IP.

**Strongly recommended, not strictly required**:
- `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` — omitting these doesn't stop
  the app from starting, but every document-upload endpoint fails with a clear error until they're
  set (no silent partial-functionality trap).
- `REDIS_URL` — required only once this API runs as more than one instance behind a load balancer.
  Omitting it in a single-instance deployment is genuinely fine (documented, tested fallback to
  correct in-process behavior — see `decisions.md`, "Batch 3"); omitting it across multiple instances
  means rate limiting and the login lockout are enforced per-instance, not globally — each instance
  independently allows up to its own limit, so the *effective* limit across the fleet is
  `limit × instance count`, not a security hole but a real, worth-knowing weakening.

**Everything else in `sample.env`** (connection pool sizing, OTP/token lifetimes, retention windows,
pagination defaults, upload limits) has a working, considered default — override only with a specific
reason, not defensively.

## Startup behavior an operator should expect

- **A genuinely unreachable database takes roughly 30-100 seconds to surface as a startup failure,
  not instantly** — `TypeOrmModule`'s own built-in retry loop (10 attempts, Nest's default, left
  unmodified — see `decisions.md`, "Batch 16") retries before giving up. This is deliberate, not a
  bug: it tolerates a DB-container/orchestrator startup-order race (the common case in Kubernetes/
  ECS/similar, where the app container can start slightly before the database is accepting
  connections) rather than crash-looping on every transient timing hiccup. Size your orchestrator's
  startup/liveness-probe grace period accordingly — don't assume a crash-loop after 10 seconds means
  a bad deploy; it may mean the retry window hasn't elapsed yet.
- **Two distinct health endpoints, for two distinct orchestrator checks** — see `api-reference.md`:
  - `GET /api/health` (liveness) — no DB dependency. A failure here means "restart this container."
  - `GET /api/health/ready` (readiness) — real `SELECT 1`. A failure here means "stop routing traffic
    here," not "restart the process" — the correct response to a transient DB blip is to wait, not to
    kill a container that would just hit the same blip again.
  Wire liveness → restart policy, readiness → load-balancer target-group health check. Conflating the
  two (as this app did before Batch 1) makes an orchestrator restart perfectly healthy processes
  during a brief, unrelated DB hiccup.
- **Graceful shutdown is enabled** (`enableShutdownHooks()`, Batch 1) — on `SIGTERM`, in-flight
  requests and the DB connection pool get a chance to drain before the process exits. Give your
  orchestrator a shutdown grace period longer than your slowest realistic request (a few seconds is
  enough for this API's actual endpoint shapes).

## Scaling

- **Connection pool sizing**: `(number of running API instances) × DB_POOL_MAX` must stay under your
  Postgres provider's connection ceiling (Neon's pooled endpoint, RDS's `max_connections`, etc.).
  `DB_POOL_MAX` defaults to 10 — four instances at the default already means 40 concurrent
  connections; check your provider's actual ceiling before scaling out further, and prefer a managed
  provider's own connection pooler (Neon's `-pooler` endpoint, RDS Proxy, PgBouncer) over raising
  `DB_POOL_MAX` indefinitely once instance count grows.
- **Horizontal scaling requires `REDIS_URL`** — see above. Below that, every instance is independently
  correct but not coordinated with its siblings for rate limiting/login lockout.
- **Load-tested characteristics** (Batch 15, this sandbox, single machine — see the final report's
  Load-Test Results section for the full numbers and explicit statement of what a single-machine
  measurement does and doesn't prove about real multi-instance/multi-region scaling): sub-10ms p50
  latency on both a no-DB health check and a real paginated DB query under light load; the app
  degrades to clean, correct `429`s (never `5xx`, never a hang) once a client exceeds its per-handler
  rate-limit budget, with the successful subset of requests maintaining good latency even while
  rejections are happening concurrently.

## Backup and recovery

**Database**: this app is deployed against Neon (a managed, serverless Postgres provider) for this
project specifically, but is written with fully generic `POSTGRES_*` configuration — no
provider-specific SDK or connection-string format is hardcoded anywhere (see `decisions.md`, "Neon
pooled endpoint" entries for the one genuinely Neon-specific operational quirk this codebase had to
work around: startup-parameter handling for `statement_timeout`). Backup/recovery responsibility
splits cleanly:

- **Point-in-time recovery and automated backups are the managed provider's responsibility, not this
  application's.** Neon provides continuous, automatic point-in-time recovery (PITR) and branching
  (an instant, copy-on-write clone of the database at any point in its retention window) — this is
  configured at the Neon project level, not in this codebase, and this checkpoint did not (and should
  not) attempt to reimplement or verify Neon's own backup mechanism; that's exactly the value of using
  a managed provider instead of self-hosting Postgres. If this app is ever deployed against
  self-hosted Postgres instead, standard `pg_dump`/WAL-archiving/`pg_basebackup` practice applies —
  this app makes no assumption about how backups are taken, only that a working Postgres endpoint is
  reachable via the standard `POSTGRES_*` variables.
- **This application's own responsibility**: every schema change is a real, reversible TypeORM
  migration (`up`/`down` both implemented — confirmed for every migration in
  `src/database/migrations/`, `synchronize: false` everywhere including local dev, so what's tested
  locally matches what a real deploy runs). A bad deploy's schema change can be rolled back with
  `yarn migration:revert` against the affected database. Migrations in this codebase have all been
  purely additive so far (new columns/indexes/constraints, no destructive `DROP COLUMN` on live data,
  no data-migrating `UPDATE` on existing rows at all, confirmed by direct inspection of every
  migration — new nullable/defaulted columns and new constraints only) — a
  genuinely destructive future migration should be reviewed with the same rigor and, if it can't be
  made safely reversible, called out explicitly in that migration's own commit/PR rather than silently
  shipped.
- **What is deliberately NOT treated as durable, backed-up state**: `seed.ts`'s output (explicitly
  demo data, regeneratable at any time — never a source of truth), and anything the hourly cleanup
  jobs purge (`AuthCleanupService`'s expired/revoked auth artifacts, `ApplicationPurgeService`'s
  soft-deleted Applications past their retention window) — both purge only rows already confirmed
  unusable/intentionally-deleted-by-the-user, so their removal is never a data-loss event requiring
  backup consideration.
- **Cloudinary (document storage)**: Cloudinary is itself a managed service with its own durability
  guarantees for stored assets; this application does not separately back up document files. The
  cross-system-consistency concern this codebase does own — a Postgres row and a Cloudinary asset
  ever disagreeing about what documents exist — is handled application-side (compensating deletes on
  upload failure, ordering the DB delete before the Cloudinary delete on removal, logging any residual
  orphan for manual follow-up — see `decisions.md`, "Batch 6"/"Batch 7"), not by a backup mechanism.

## Deployment runbook (summary)

1. `yarn install --frozen-lockfile`, `yarn build`.
2. Run pending migrations against the target database: `yarn migration:run` (with the target's
   `POSTGRES_*`/`DATABASE_URL` in the environment) — **before** starting the new app version, so the
   schema a new deploy expects already exists when it starts serving traffic. This app does not (yet)
   implement blue/green-safe migration sequencing (e.g. expand/contract for a breaking column
   rename) — every migration so far has been additive and safe to run ahead of the new code
   deploying; a future breaking schema change needs its own explicit multi-step rollout plan, not
   assumed to be covered by "just run migrations first."
3. Start the new app version(s); wait for `GET /health/ready` to report healthy on each before routing
   real traffic to it (an orchestrator's readiness probe does this automatically once wired per
   "Startup behavior" above).
4. On rollback: revert to the previous app version. Only run `yarn migration:revert` if the new
   version's migration is confirmed to be the actual cause and confirmed safe to undo (check that
   migration's own `down()` — see the reversibility note above) — reverting a migration nothing else
   depends on is safe; reverting one that later migrations build on is not, and needs manual review.
