# Architectural decisions

Non-obvious choices made during the foundation build, and why. Ordered roughly by how often they're
referenced from code comments. If you're changing behavior near a comment that says "see
decisions.md", read the matching section here first — there's usually a reason the obvious-looking
alternative wasn't used.

## No AI yet

The spec's eventual vision includes AI-assisted requirement matching, application review, etc. None
of that is implemented in this phase — deliberately. The schema anticipates it (e.g.
`RequirementStatus.PROFILE_MATCH` / `AI_ASSESSMENT` exist as enum values) so a later phase doesn't
need a migration to add them, but nothing in this codebase writes those values yet. Building the
core CRUD + auth foundation correctly first, without an AI integration's uncertainty mixed in, was
the priority.

**Revisit when:** the core flows (journeys → applications → tasks → documents) have been used enough
to trust the schema, and an AI provider integration is actually being scoped.

## Refresh token storage

Refresh tokens are opaque random strings (`crypto.randomBytes(48)`), not JWTs, and only their
SHA-256 hash is ever persisted (`RefreshSession.tokenHash`). Three reasons:

1. A refresh token needs to be revocable server-side (logout, reuse detection, "log out all
   devices"). A stateless JWT refresh token can't be revoked without a denylist, which is just a
   database table anyway — so skip the JWT format for this one and use a real table from the start.
2. Hashing before storage means a database read alone (backup leak, replica access, etc.) can't
   produce a usable credential — same reasoning as password hashing.
3. One row per issued token (`RefreshSession`) doubles as the "Session A/B/C" per-device list the
   spec asks for, for free.

Every refresh **rotates**: the presented token's session is revoked and a new one issued, even if
the old one hadn't expired. Presenting an already-revoked token can only happen via replay of a
stolen token (the legitimate client always moves on to the rotated one), so that revokes every
session for the user, not just the replayed one — see `auth.service.spec.ts` for the exact scenario
this defends against.

**What's NOT done:** there's no scheduled job purging expired `RefreshSession` rows —
`AuthService.purgeExpiredSessions()` exists but nothing calls it on a timer. Fine at this scale; add
a cron trigger (or a `@nestjs/schedule` job) once the table's growth is actually worth managing.

## Catalog data vs. owned data

Universities, Programmes, Opportunities, and OpportunitySources are shared reference/catalog data —
any authenticated user can read and write them, with no per-user ownership column. Journeys,
Applications, Tasks, and Documents are owned by the user who created them. Requirements and
Deadlines can go either way depending on what they're attached to (see `domain-model.md`).

**Why:** this is a personal tool, not a multi-tenant SaaS product (yet). Modeling universities as
"owned" by whichever user first entered them would be actively wrong — the same University of Twente
row should be shared and reused, not duplicated per user. If this ever becomes a shared product
across unrelated users, catalog data would need moderation/versioning, not ownership.

## Two independent FKs instead of a join model (Requirement, Deadline)

`Requirement` has both `opportunityId` and `applicationId` as independent nullable columns, rather
than two separate `OpportunityRequirement` / `ApplicationRequirement` tables (or a polymorphic
"subject type + subject id" column). `Deadline` goes further with four possible FKs
(Opportunity/Application/Task/Requirement).

**Why:** the alternative (fully separate models, or evidence-linking tables) is more "correct" in a
strict data-modeling sense, but there was no evidence yet that the distinction matters in practice.
Two nullable columns are simple to query (`WHERE application_id = $1`), simple to authorize
(`RequirementsService.findOneAccessible` branches on which FK is set), and cost nothing extra if it
turns out the split was never needed.

**Revisit when:** a Requirement or Deadline genuinely needs to be shared identically across multiple
Applications with independent status tracking per Application — the current model can't express
"this GPA requirement applies to 3 applications, met in 2 of them."

## Don't over-model the profile yet

`ApplicantProfile.education/experience/skills/certifications/languages` are jsonb arrays of loosely-
structured objects, not normalized child tables (`education_entries`, `work_experience`, ...).

**Why:** normalizing them is straightforward *after* the core Application Journey flow (the actual
point of this phase) is proven — doing it now would be guessing at a shape before any real usage
exists to validate it against. The jsonb escape hatch also matches the spec's explicit "Other"
category pattern used elsewhere (Opportunity.metadata, ApplicantProfile.metadata).

**Revisit when:** the frontend needs to do more than display/edit these as free-form blocks — e.g.
sorting education by date, or an AI feature that needs to reason about individual entries.

## Dependencies never block the user

`Task.dependsOnTaskId` / `dependencyType` (`hard` | `soft`) exist purely as UI hints ("this normally
comes after X"). No service — not `TasksService.update`, not any guard — reads these fields to
reject a status change. `tasks.service.spec.ts` asserts this directly: a task can be marked `DONE`
while its "hard" dependency is still `TODO`.

**Why:** the spec is explicit that dependencies are a recommendation, not a workflow engine. A
scholarship applicant's real life doesn't always follow the "ideal" task order, and blocking them
from marking something done because a hint says otherwise would be actively hostile to the actual
user.

## Avoid adding a library without a clear reason

A few points where an obvious off-the-shelf package was skipped in favor of a few lines of hand-
written code:

- **Config validation** (`config/configuration.ts`) — a hand-rolled loader/validator instead of
  Joi/zod/`class-validator`-on-a-config-class. The surface (a dozen env vars) is small enough that
  explicit `requireEnv()` checks are more legible than a schema DSL would be.
- **bcryptjs instead of bcrypt** — `bcrypt` is a native addon; on a very new Node.js version without
  prebuilt binaries yet, that risks a node-gyp compile failing the whole install in ways unrelated to
  this codebase. `bcryptjs` is a pure-JS, API-compatible implementation — slightly slower, zero
  native-build risk. Worth revisiting once native-binary availability isn't a concern in the target
  deployment environment.
- **No Swagger/OpenAPI generation** — `@nestjs/swagger` would be a reasonable addition, but nothing
  in this phase consumes a generated spec (the frontend is hand-written against the same monorepo's
  types), so it would be pure overhead right now. `docs/api-reference.md` documents the routes by
  hand instead.

## Global auth guard, opt out by default

`JwtAuthGuard` is registered once as `APP_GUARD` (`app.module.ts`) rather than applied per-controller
with `@UseGuards()`. Every route requires a valid access token unless explicitly marked `@Public()`.

**Why:** for an app whose entire purpose is personal data (applications, documents, profile), "new
route is private unless someone remembers to guard it" is the wrong default. Getting a genuinely
public route wrong (forgetting `@Public()`) fails loudly (401) and gets noticed immediately;
forgetting a guard on a route that should be private fails silently and leaks data.

## Client-side data fetching over Server Component fetching

The frontend fetches all API data from client components via TanStack Query, rather than fetching in
React Server Components and passing data down as props.

**Why:** the API requires a Bearer access token that lives in memory only (see `architecture.md`'s
auth flow) — a Server Component request would need the token forwarded through a different channel
entirely (cookies read via `next/headers`, decoded/forwarded server-side), adding real complexity for
a foundation phase where the entire app is behind a login wall anyway (there's no public,
SEO-relevant content that benefits from server rendering with real data).

**Revisit when:** there's a genuinely public page (a shared read-only application view, a public
opportunity listing) where server-rendered content actually matters for load time or SEO.

## Independent repos over a shared types package

**Superseded 2026-08-13.** The first version of this project had a `packages/types` workspace
package holding the domain enums and the two auth response shapes (`SafeUser`,
`AuthTokenResponse`), imported by both apps as `@scholarship-os/types` — the usual monorepo
shared-package pattern, and a reasonable one. At the user's explicit request, `backend` and
`frontend` were then made fully independent: `packages/` was deleted, and its contents duplicated
into `backend/src/types.ts` and `frontend/src/lib/shared-types.ts` — two separately-maintained
copies of the same enums/interfaces, each with a doc comment pointing at its counterpart.

**Why the user wanted this:** treating `backend/` and `frontend/` as genuinely independent
repos — each buildable, testable, and (if desired) deployable or version-controlled on its own,
with zero source-code cross-references — was judged more valuable than the single-source-of-truth
guarantee a shared package gives you.

**The trade-off, explicitly accepted:** nothing enforces the two copies staying in sync. If
`TaskStatus` gains a new value in `backend/src/types.ts`, `frontend/src/lib/shared-types.ts` doesn't
know until a human updates it too. There's no compile-time or CI check for this yet — if drift
becomes a real problem, the options are (a) a small script that diffs the two files in CI, or
(b) accepting the drift risk is outweighed by the independence, and moving on.

`frontend/src/lib/types.ts` (the UI-shape interfaces for Journeys/Applications/Tasks/etc., as
opposed to the enums in `shared-types.ts`) was never shared in the first place and is unaffected by
this — see "Frontend doesn't mirror full backend entities" below.

## Frontend doesn't mirror full backend entities

`frontend/src/lib/types.ts` defines its own, smaller interfaces for Journeys/Applications/Tasks/etc.
rather than importing the backend's TypeORM entity types directly (which, post-independence, isn't
even possible — see above).

**Why:** the backend's TypeORM entities carry relations, internal-only fields, and ORM-specific
shapes that the frontend never needs and shouldn't couple to. Hand-writing a *view* of the shape in
the frontend is cheaper than force-fitting one shared interface to serve both a TypeORM entity and a
JSON API response — this would be true even with a shared package in place.

## Repo layout: `backend/` and `frontend/`, not `apps/*`

The two projects live at the top level (`backend/`, `frontend/`) instead of nested under a generic
`apps/` directory. See `architecture.md` for the reasoning — this repo only ever holds exactly these
two projects, so the extra nesting level buys nothing. Each also carries its own `.gitignore`, env
files (exactly two apiece: backend has `.env` + `sample.env`, frontend has `.env.local` +
`.env.example` — see "Exactly two env files per app" below), `package.json`/lockfile/`node_modules`,
and `README.md` — see `architecture.md`, "Independent repos, not a monorepo." There is deliberately
no root `package.json`: one would imply a shared install/lockfile, which is exactly what
independence argues against.

## Exactly two env files per app

Each app has precisely two env-related files, not the three-or-four that's common (`.env.example`,
`.env`, `.env.test`, `.env.local`, ...):

- **`backend/`**: `.env` (real, gitignored — never committed) and `sample.env` (committed —
  doubles as both the annotated reference *and* a ready-to-run local default, so `cp sample.env
  .env` works immediately against a freshly-created local Postgres).
- **`frontend/`**: `.env.local` (real, gitignored) and `.env.example` (committed, same
  dual-purpose role). `.env.local` rather than `.env` because that's the file Next.js actually
  reads.

**Why:** more env files means more places for values to drift out of sync and more decisions for
a new contributor ("which one do I edit?"). One real file + one committed template, where the
template is *also* usable as-is, covers every case here without the extra files.

**What this meant giving up:** the backend's e2e test suite needs to run against a different
database (`scholarship_os_test`) than dev — that used to be a third file, `.env.test`. Instead,
`backend/test/setup-env.ts` sets the couple of needed overrides (`POSTGRES_DB`, a test-only JWT
secret, a low bcrypt cost) directly on `process.env` in code, before the app boots — `dotenv` never
overwrites an already-set variable, so `.env`'s values fill in everything else unchanged. See
`development.md`, "e2e tests use a separate database."

## Database env vars: generic `POSTGRES_*`, with SSL support

**Superseded 2026-08-13.** Backend database credentials were briefly named after AWS RDS's
Elastic-Beanstalk-injected convention (`RDS_HOSTNAME`, `RDS_PORT`, `RDS_DB_NAME`, `RDS_USERNAME`,
`RDS_PASSWORD`) on the assumption AWS was the deploy target. At the user's request, these reverted
to generic `POSTGRES_HOST` / `POSTGRES_PORT` / `POSTGRES_DB` / `POSTGRES_USER` /
`POSTGRES_PASSWORD`, plus a new `POSTGRES_SSL` boolean — this app is now run against Neon (a
managed Postgres provider reached over SSL, not RDS), and the generic naming doesn't privilege any
one provider's convention the way the RDS names did.

`POSTGRES_SSL=true` sets `ssl: { rejectUnauthorized: false }` on the TypeORM/`pg` connection
(`data-source.ts` and `database/typeorm.config.ts`) rather than verifying the provider's certificate
chain against a bundled CA — the pragmatic default most managed-Postgres setup guides use. This
accepts the server's certificate without full chain verification: adequate protection against
passive network eavesdropping (the actual goal — credentials and data in transit aren't sent in the
clear), but not against a sophisticated active MITM presenting a fake certificate. Revisit if that
threat model ever matters here — the fix is supplying that provider's CA bundle and setting
`ca`/`rejectUnauthorized: true` instead of turning this off entirely.

---

# Phase 1.5 decisions

The decisions below were made during Phase 1.5 (foundation correctness/performance pass — see
`phase-1o5.txt` and `docs/validation.md` for the full checkpoint-by-checkpoint record). Each maps to
one of that phase's numbered checkpoints.

## Recursive CTE for document version history (Checkpoint 2)

`DocumentsService.findVersionHistory()` walked its `previousVersionId` linked list one query per hop
— `1 + N` round trips for a chain of N prior versions. Fixed by fetching the ordered chain of ids in
one recursive `WITH RECURSIVE` SQL query, then hydrating real `Document` entities via a single
`find(... In(ids))` call — 3 queries total, constant regardless of chain length.

**Options considered:**
1. **Chosen:** recursive CTE for ids + `find(In(ids))` for hydration (3 queries, no schema change).
2. A single fully-raw query selecting every `Document` column, mapped by hand from snake_case —
   rejected: real single-query win, but a real ongoing maintenance burden (a new entity column added
   later would silently be missing from this one method unless someone remembers to update the raw
   SQL too).
3. A denormalized `documentGroupId` column shared by all versions of one logical document — rejected
   *for this checkpoint* because it's a schema change (new column + migration + backfill), which
   phase-1o5.txt asks to be its own explicit checkpoint, not folded into a query-pattern fix. Worth
   reconsidering on its own merits later.

**Trade-off accepted:** one method in the codebase now uses raw SQL rather than pure TypeORM idioms
— contained to this single method, with the reasoning recorded in its own doc comment.

## Existence check vs. full detail load are different methods (Checkpoint 3)

`OpportunitiesService.findOneOrThrow()` used to eager-load `sources`/`requirements`/`deadlines` on
every call, including the 6 of 7 call sites that only needed a plain existence/FK check (Applications,
Requirements, Deadlines, and OpportunitySources creating/validating a link, plus this service's own
`update()`/`remove()`). Split into `findOneOrThrow()` (lean, no relations) and
`findOneWithDetailsOrThrow()` (the old eager-loaded behavior), with only the actual detail-view
controller method (`GET /opportunities/:id`) calling the latter.

**Trade-off accepted, not a bug:** `PATCH /opportunities/:id`'s response no longer includes
`sources`/`requirements`/`deadlines` — previously present only as a side effect of sharing the
overloaded method. This brings it in line with every other module's update endpoint (none of which
return relations either), rather than removing an intentionally-designed feature.

**Not addressed:** `findAll()` (the list endpoint) has the identical eager-load-everything pattern
for every row it returns. Flagged, not fixed — out of this checkpoint's scope.

## `Promise.all` for independent validation checks (Checkpoint 5)

`ApplicationsService`/`JourneysService`/`TasksService`'s `create()`/`update()` methods ran their
independent existence/ownership checks (e.g. journey ownership and opportunity existence) one after
another. Changed to run concurrently via `Promise.all` wherever a check's outcome doesn't depend on
another check's result.

**Trade-off accepted:** this does not reduce query *count* — it reduces wall-clock latency by not
waiting for each round trip before starting the next, which matters more now that the app talks to a
remote (Neon) database than it would against a local one. The cost: if a request has *multiple*
simultaneously-invalid fields, which specific validation error is reported first is no longer
deterministic by program order — whichever check settles first "wins." Accepted because no client
should reasonably depend on which of several simultaneous failures is reported first, and every
outcome is still a correctly-rejected 4xx either way.

## Explicit transaction for document version writes (Checkpoint 6)

`DocumentsService.uploadNewVersion()` performed two independent writes (mark the previous version
not-current, insert the new version) with no transaction boundary — a failure between them could
leave no version of a document marked current. Wrapped both writes in
`this.documents.manager.transaction(...)` — the codebase's first explicit use of a transaction.

**Why the Cloudinary upload stays outside the transaction:** it's an external, non-transactional
network call. Holding a database transaction open for its duration would tie up a connection (and,
once the update runs, a row lock) for no benefit. If the transaction fails after a successful upload,
the result is an orphaned Cloudinary asset — wasted storage, but never a broken reference visible
through the API, which is the failure mode actually worth avoiding.

**Not addressed at the time — later found to be more serious than this note originally suggested.**
This entry originally described `DocumentsService.remove()`'s Cloudinary-delete-then-DB-delete
ordering as a "related, smaller concern (an orphaned Cloudinary asset vs. a dangling DB reference,
depending on which step fails)." The Track 1 Group D inspection found that framing understated the
real risk: because `application_documents.document_id` carries `ON DELETE RESTRICT`, the DB-delete
failure mode isn't symmetric or occasional — it's deterministic for any currently-attached document,
and the Cloudinary asset was being destroyed unconditionally *before* that guaranteed failure,
surfacing only as a generic 500 with no indication of what happened. Fixed in Group D — see
"Cloudinary deletion ordering" below for the corrected behavior.

## Duplicate-email race handled at both layers (Checkpoint 7)

`UsersService.createUser()`'s upfront `findByEmail` check left a race window: two concurrent
registrations for the same email could both pass the check before either commits. The `email`
column's existing unique index would reject the second `INSERT`, but that failure previously
surfaced as a raw, uncaught `QueryFailedError` — an unhandled 500 for what is actually a routine,
expected case.

**Chosen approach:** keep the upfront check (handles the common, non-racy case with a single cheap
`SELECT`, no wasted insert attempt) *and* catch a Postgres unique-violation (code `23505`) specifically
around the `save()` call, translating it into the same `ConflictException`. Verified against
TypeORM's actual `QueryFailedError` source (it copies the driver error's fields, including `code`,
onto the thrown error) rather than assumed.

**Why not remove the upfront check and rely on the catch alone:** the upfront check is cheaper for
the overwhelmingly common case (an indexed `SELECT` vs. attempting and failing a full `INSERT`), and
keeping both means the fix only had to add error handling, not change the existing fast path.

---

# Track 1 decisions

The decisions below were made completing Track 1 (identity/authentication/user foundation — see
`phase-1o5.txt` and `docs/validation.md` for the checkpoint-by-checkpoint record). Track 1 followed
Phase 1.5 and covers everything the Group A audit found missing or defective, closed as a coherent
unit rather than carried forward.

## Email normalization: fixed at the service boundary, not the DTO

The Group A audit found `UsersService.findByEmail()` querying with whatever casing the caller passed
in, while `createUser()` always stored a lowercased value — a user who registered as
`Jane@Example.com` could never log in typing that same casing back (Postgres's default btree unique
index on `email` is case-sensitive). Fixed by normalizing (`trim().toLowerCase()`) once, inside
`findByEmail()` itself, so every current and future caller — login, the registration duplicate check,
password reset, a future admin tool — gets consistent behavior automatically, rather than relying on
every call site remembering to normalize first.

**Why not a DTO-level `@Transform` instead (or as well):** a DTO transform only protects requests that
go through that specific DTO. A second, independent implementation of "how we normalize an email"
would exist the moment any other code path (a seed script, a future internal tool) called
`findByEmail` directly — exactly the kind of duplicated business logic this project avoids elsewhere.

## Refresh-token consumption: atomic conditional UPDATE + per-user advisory lock

The Group A audit found a TOCTOU race in `AuthService.refresh()`: it read `session.revokedAt`, then
issued a separate `UPDATE` to revoke it. Two concurrent calls presenting the SAME valid token could
both observe `revokedAt: null` before either write landed, both pass the reuse check, and both
successfully rotate — silently defeating reuse detection for exactly the scenario it exists to catch.

**Layer 1 fix:** the revoking `UPDATE`'s own WHERE clause (`revokedAt IS NULL`) is now the sole
authorization check — "consume this row only if it is still unrevoked" — with the returned `affected`
count telling the caller whether it won. At most one concurrent caller can ever receive `affected
=== 1` for a given row, since Postgres serializes concurrent `UPDATE`s to the same row. `affected ===
0` is treated as reuse, exactly like the previous code treated any already-revoked token.

**Layer 2 fix (found by testing Layer 1's own concurrency test):** the *loser's* "revoke every session
for this user" sweep and the *winner's* "insert a brand-new session" are separate statements — if the
sweep runs before the winner's multi-step chain (fetch user → sign JWT → insert) finishes, the
winner's new session can escape the sweep entirely. Closed with a per-user Postgres advisory lock
(`pg_advisory_xact_lock(hashtext(userId)::bigint)`, transaction-scoped, released automatically) around
the whole consume-or-revoke-and-issue sequence in `refresh()` — only one refresh per user can be
mid-flight at a time, so the two statements can no longer interleave.

**Why an advisory lock and not, say, `SELECT ... FOR UPDATE` or a stricter isolation level:** the
contention here isn't about reading a row consistently (Layer 1 already handles that) — it's about
serializing a whole multi-statement *sequence* per user, across two different tables. An advisory lock
is the standard Postgres tool for exactly that: a lightweight, application-defined mutex that doesn't
require locking actual rows (which wouldn't help here anyway, since the winner's new session doesn't
exist yet for anything to lock).

**Testing boundary, stated plainly:** a mocked unit test cannot prove either layer's real atomicity —
that guarantee comes from Postgres itself. `auth.service.spec.ts`'s concurrency test proves the
*service code* correctly acts on an `affected` count when given one (the part a unit test can actually
exercise), and documents this boundary rather than overclaiming coverage it doesn't have.

## `UsersController.updateMe()` moved into `UsersService`

The audit found the controller injecting `Repository<User>` directly and calling `.update()` itself —
the only place in this codebase a controller touched the database. Moved into
`UsersService.update()`, same query shape as before (one `UPDATE`, then one `SELECT` via
`getByIdOrThrow`) — a placement fix, not a behavior change.

## Email verification: OTP hashed like every other credential in this app

`EmailVerificationOtp` follows the exact storage pattern already established for `RefreshSession`:
only a SHA-256 hash of the (6-digit, `crypto.randomInt`-generated) code is ever persisted, never the
raw value. Consumption and attempt-counting both use atomic conditional updates (`UPDATE ... WHERE
consumedAt IS NULL AND invalidatedAt IS NULL`, checking `affected`) — the same pattern as the
refresh-token fix above, applied consistently rather than re-invented. A resend invalidates the prior
active code first, and is additionally cooldown-gated at the data layer (not just the endpoint's
`@Throttle()` guard) — a user genuinely cannot have two "active" codes issued within the cooldown
window even if the HTTP-level throttle were somehow bypassed.

**Verification is authenticated, not public-by-email:** `POST /auth/verify-email` and
`POST /auth/resend-verification` both require a valid access token and act on `@CurrentUser()`'s own
id — never a client-supplied email or userId. This removes the classic "guess codes against arbitrary
accounts" enumeration/abuse surface at the design level, on top of the OTP's own attempt limit and the
endpoint's rate limit.

## Email verification does not gate API access (yet)

`User.isVerified` is tracked and exposed (in the JWT payload, `AuthenticatedUser`, and `SafeUser`), but
Track 1 deliberately does NOT add a guard blocking unverified users from the rest of the API. Doing so
would be a cross-cutting product/UX policy decision touching every existing and future controller —
genuinely outside "identity/authentication/user foundation" scope, not an oversight. The flag exists
so that decision can be made later without a schema change.

## Password reset: same credential pattern, plus a transaction where it matters

`PasswordResetToken` follows the same opaque-random-value + hash-only-storage + atomic-conditional-
consume pattern as refresh tokens and OTPs. On a successful reset, the password-hash update and
revoking every existing `RefreshSession` for the account happen inside one transaction — a partial
failure (password changed but old sessions left valid, or the reverse) is exactly the inconsistent
state this feature exists to prevent.

**Access tokens are NOT individually revoked on reset:** this app's JWTs are stateless with no
denylist (the entire reason `RefreshSession` exists as a real table is that stateless JWTs can't be
revoked early without one — see "Refresh token storage" above). A stolen access token remains valid
for up to its short (15m default) remaining lifetime after a reset; no *new* access token can be
minted from a pre-reset session, since every refresh session is revoked. Adding a JWT denylist purely
for this would be exactly the unnecessary new infrastructure Track 1 was asked not to introduce.

**Enumeration:** `POST /auth/forgot-password` always returns the same response regardless of whether
the email belongs to an account. The response body/status is fully uniform; a residual timing
side-channel (finding an account does more work — a DB write and an email dispatch — than not finding
one) was deliberately not fully closed with artificial delays, which would be a fragile mechanism for
a partial guarantee. Documented as a known, accepted limitation.

## Password policy: shared constants, plus a bcrypt byte-limit check

`RegisterDto` and `ResetPasswordDto` both validate against the same shared constants
(`PASSWORD_MIN_LENGTH`/`MAX_LENGTH`, `auth/password-policy.ts`) rather than duplicated magic numbers,
so the two can't silently drift apart.

**The bcrypt 72-byte finding:** bcrypt (and bcryptjs, which implements the same algorithm — see
"bcryptjs instead of bcrypt" above) silently ignores any input bytes beyond 72. A password measured in
*characters* can exceed 72 *bytes* well before the 128-character max once multi-byte UTF-8 is involved
(accents, emoji, non-Latin scripts) — meaning trailing bytes could be silently dropped from what
bcrypt actually hashes. Rather than change the hashing scheme (which would break every already-hashed
password in the database — far too invasive for what's fundamentally a validation gap), a
`@IsWithinBcryptByteLimit()` validator rejects any password whose UTF-8 byte length exceeds 72,
turning a silent truncation into a clear, immediate validation error.

## Rate limiting: in-memory `@nestjs/throttler`, not Redis

Login, registration, refresh, email verification, resend, forgot-password, and reset-password are all
rate-limited via `@nestjs/throttler`'s default in-memory storage — the correct choice for this app's
current single-instance deployment, and the official, minimal NestJS package for exactly this need
(reinventing token-bucket/sliding-window logic by hand would be the over-engineering this project
otherwise avoids adding, not less of it). `ThrottlerGuard` is registered globally (`app.module.ts`)
alongside `JwtAuthGuard`, and runs independently of `@Public()` — every route is rate-limited
regardless of authentication requirement.

**Migration path once this stops being true:** `@nestjs/throttler` supports a pluggable storage
adapter (e.g. `@nestjs/throttler-storage-redis`) without any change to application code — the
`@Throttle()` decorators and limits stay exactly as written. Not introduced now because nothing about
the current deployment needs shared rate-limit state across instances yet.

**Rate-limit thresholds are code constants, not env config:** unlike `otpExpiryMinutes`/
`otpMaxAttempts`/etc. (genuine security/UX policy trade-offs, likely to be revisited per-deployment —
see `configuration.ts`), the per-route `@Throttle()` limits are hardcoded directly on each endpoint in
`auth.controller.ts`. These are closer to fixed implementation-tuning constants than deployment
secrets; making all ~14 of them independently env-configurable would be configuration-surface
sprawl for values that rarely need per-deployment tuning, not a meaningful flexibility win.

## Email delivery: SMTP, not a vendor SDK

**Superseded by the Track 1 hardening pass below** — this originally described a dev-log-only
`EmailService` with an unfinished "add a real provider later" note. That note is now closed: see
"Email delivery is now complete, not deferred" below.

---

# Track 1 hardening pass

A second pass over Track 1, specifically to close every item the original Track 1 completion report
left as a "documented limitation" that was actually solvable now — see `docs/validation.md`'s "Track 1
hardening pass" section for the full file-by-file record.

## CRITICAL: refresh-token writes were being silently rolled back

**The bug:** `AuthService.refresh()`'s reuse-detection and expired-token branches threw
`UnauthorizedException` *directly inside* the `manager.transaction()` callback, after already writing
the "revoke every session for this user" sweep (reuse case) or the atomic consume (expired case).
TypeORM's `EntityManager.transaction()` rolls back every write made inside its callback the instant
the callback's promise rejects (confirmed by reading `node_modules/typeorm/entity-manager/
EntityManager.js` directly: `catch (err) { await queryRunner.rollbackTransaction(); throw err; }`).
Throwing to report the error to the caller silently discarded the exact write meant to fix the
security problem — reuse detection was reporting success (via the thrown error) while doing nothing
to the database. The advisory-lock fix (previous section) was itself correct; this was a second, new
bug introduced by wrapping the sequence in a transaction to add that lock.

**Why the original tests didn't catch it:** the mocked `manager.transaction()` in `auth.service.spec.ts`
simply called the callback and returned its result — it never simulated rollback-on-throw, so writes
"stuck" in the mock regardless of whether the real equivalent would have kept them. The mock's
unfaithfulness to real TypeORM semantics is what let this pass code review and a full green test suite
into what looked like a completed checkpoint.

**Fix:** the transaction callback now never throws — it always resolves with a
`{ ok: true, user, tokens } | { ok: false, reason: 'reuse' | 'expired' }` outcome value, so
`commitTransaction()` always runs and every write made inside it always persists. The actual
`UnauthorizedException` is thrown outside the transaction, after it has committed, based on that
outcome. The test mock was also fixed to snapshot state before invoking the callback and restore it on
a thrown error, faithfully simulating rollback — and two new regression tests
(`auth.service.spec.ts`, "CRITICAL: the reuse-detection... write actually persists" and "the
expired-token consumption write actually persists") assert the persisted database state directly,
not just "a later call also fails" (which the old, buggy code would have satisfied too, since the
*next* call's fresh read would still see the presented token's own row as revoked from its own
successful atomic consume — only the cross-session revoke-all sweep was actually being lost).

## Advisory lock: verified against real Postgres, not just documented

Three properties were verified directly against the Neon DEVELOP database (raw `psql` sessions, lock
calls only — no table data touched):

1. **Same lock key serializes.** Two sessions calling `pg_advisory_xact_lock(hashtext('same-key')::bigint)`
   — the second blocked for the full duration of the first's held transaction (~3s), then acquired
   within 0.3ms of the first's `COMMIT`.
2. **Different lock keys do not block each other.** A session holding one key, and another session
   acquiring a *different* key concurrently, acquired in ~62 microseconds — no wait at all.
3. **The lock releases on `ROLLBACK`, not just `COMMIT`.** A session that acquired the lock then rolled
   back (rather than committed) released it immediately — a second session acquired the same key
   within ~57 microseconds afterward. This confirms "impossible to accidentally leave held after an
   exception" — TypeORM's `manager.transaction()` calls `rollbackTransaction()` on any thrown error
   (see the CRITICAL finding above), which releases a transaction-scoped advisory lock exactly like a
   commit does.

**Lock scope, addressed explicitly:** the key is `hashtext(userId)::bigint` — scoped per USER, not per
session/token. This is deliberate, not an oversight: the reuse-detection sweep it protects revokes
*every* session for that user, so the lock must serialize at the same granularity or the exact
cross-session race this lock exists to close could reappear between two different sessions of the same
user. A consequence: two genuinely concurrent refreshes from the same user's different devices
serialize against each other (a few milliseconds of added latency in an already-rare scenario);
refreshes from *different* users never contend for the same lock and proceed fully independently
(property 2, verified above) — matching the "User A may serialize with User A; User B proceeds
independently" goal exactly.

**Collision risk, addressed explicitly:** `hashtext()` returns a 32-bit value, so two different userIds
could in principle hash to the same lock key. The consequence of a collision is purely a benign
performance one — two unrelated users' refreshes would briefly serialize against each other — never a
correctness or security issue, since every actual SQL WHERE clause in the transaction is still scoped
by the real `userId` column value, not the hash. The hash only ever decides who waits, never which
rows get read or written.

## Rate limiting: verified as far as a unit test honestly can

Three things were verified directly (not assumed):

1. **Route coverage and exact limits** — `auth.controller.throttle.spec.ts` reads the literal
   `Reflect.getMetadata('THROTTLER:LIMIT' + 'default', handler)` / `'THROTTLER:TTL' + 'default'` off
   each `AuthController` route handler — the exact metadata `ThrottlerGuard` itself reads via its
   injected `Reflector` at request time (confirmed by reading `@nestjs/throttler`'s `throttler.
   decorator.js` and `throttler.guard.js` directly). Not a re-implementation or a guess: the real,
   framework-consumed metadata, read without booting HTTP or a database. Caught a real bug while being
   written — `@nestjs/throttler` does NOT re-export `THROTTLER_LIMIT`/`THROTTLER_TTL` from its public
   package index (unlike every other internal module, which the package does `export *` — confirmed by
   reading `index.d.ts`), so importing them by name silently resolves to `undefined` rather than
   failing to compile; fixed by using the literal string constants directly, with a comment recording
   why.
2. **Global guard registration** — `app.module.guards.spec.ts` reads `AppModule`'s own `@Module()`
   metadata (`Reflect.getMetadata('providers'/'imports', AppModule)` — the literal data Nest's DI
   container reads to wire providers) to confirm `ThrottlerGuard` is registered as a second,
   independent `APP_GUARD` alongside `JwtAuthGuard`, and that `ThrottlerModule` is actually imported.
   Deliberately does NOT boot `AppModule` (that would open a real Postgres connection via
   `TypeOrmModule.forRootAsync` — integration-test territory).
3. **What remains unverified, stated plainly:** whether `ThrottlerGuard` actually rejects the
   (N+1)-th request within a live time window requires a running HTTP server and real request timing —
   E2E territory, explicitly out of scope. This boundary is documented, not glossed over: configuration,
   metadata, and wiring are verified by real code; runtime HTTP throttling behavior is not, and no test
   here claims otherwise.

**`logout`/`logout-all`/`sessions`/`me` have no route-specific `@Throttle()`** — a deliberate choice
(asserted directly by a test), not an oversight: they only ever revoke/read the caller's own already-
authenticated state, not guess at credentials, so the generous global default (100/60s) is adequate
without adding endpoint-specific noise.

## Email delivery is now complete, not deferred

The original Track 1 report left this as: *"No real email provider is configured — EmailService is a
real, working boundary, but delivery is dev-log only."* That sentence is now finished:

**Architecture:** `EmailService` (`common/email/email.service.ts`) is the only thing
`AuthService`/`EmailVerificationService`/`PasswordResetService` talk to — via two purpose-built
methods, `sendVerificationOtpEmail()`/`sendPasswordResetEmail()`, not a generic `send()`. Content
construction (subject/text/HTML, and the verify/reset URLs, built from the configured `frontendUrl` —
never hardcoded) lives in `common/email/templates.ts`. Actual delivery is a small `EmailProvider`
interface with two implementations: `DevLogEmailProvider` (logs, never sends) and `SmtpEmailProvider`
(real delivery via `nodemailer`).

**Why SMTP, not a vendor SDK (Resend/SendGrid/etc.):** every real provider this app might sit behind
(SES, SendGrid, Postmark, Mailgun, a corporate relay, Resend's own SMTP endpoint) speaks SMTP — one
implementation works with any of them purely through configuration, matching this project's existing
preference for portable, non-vendor-locked choices (generic `POSTGRES_*` naming, no Swagger — see
"Avoid adding a library without a clear reason"). `nodemailer` (+ `@types/nodemailer`) is the one new
dependency this required — a well-established, pure-JS, no-native-bindings library (the same
risk-avoidance reasoning as `bcryptjs` over `bcrypt`).

**Provider selection** (`EmailService.buildProvider()`, fail-fast at construction — app *startup* —
same posture as `JwtStrategy`'s access-token-secret check, not lazily at first send):
- `EMAIL_SMTP_HOST` set → `SmtpEmailProvider`, after two configuration-consistency checks (valid port
  number; `EMAIL_SMTP_USER`/`EMAIL_SMTP_PASSWORD` set together or not at all) that fail loudly rather
  than producing a confusing SMTP-level error at the first real send.
- Not set, non-production → `DevLogEmailProvider`.
- Not set, production → throws at construction. A production deployment silently missing email config
  should never start successfully.

**Testability:** `SmtpEmailProvider` takes an already-constructed transporter via its constructor
specifically so it never needs the real `nodemailer` module mocked — tests inject a fake
`{ sendMail: jest.fn() }`. No test claims real external delivery was verified; none exists to verify
against (no real provider credentials in this environment) — exactly as instructed.

**Failure handling, three different call sites, three different (each principled) behaviors:**
- `register()`: best-effort — a failed send is logged, never fails registration (the account and
  tokens already fully exist by that point).
- `resend-verification`: the caller is authenticated and actively asking for a code right now — a
  failed send is surfaced as a clear `ServiceUnavailableException`, not silently swallowed, since the
  OTP row already exists regardless and nothing is left inconsistent by reporting the failure.
- `forgot-password`: silently caught (logged, not thrown) — surfacing it would create a
  response-shape/timing oracle distinguishing "account exists but email failed" from "account doesn't
  exist", exactly the enumeration this endpoint exists to prevent.

**What genuinely remains dependent on infrastructure, not implementation:** an actual SMTP
host/credentials. The code path is complete and tested with fakes; nothing about "add a real provider"
is unfinished architecture anymore — it's exactly one deployment configuring `EMAIL_SMTP_*` in `.env`.

---

# Track 1 → Group B: Academic & Opportunity Discovery

Closes the domain audit's findings (University/Programme/Opportunity/OpportunitySource/Requirement/
Deadline) plus a scope amendment that pulled RBAC into Group B — see `docs/validation.md`'s "Group B"
section for the full file-by-file record.

## RBAC dependency: why shared catalog administration needed it now

University/Programme/Opportunity are shared catalog entities with no individual user ownership — any
authenticated user could previously create, edit, *and delete* them. The Group B audit found this
mutation-side gap real but initially classified fixing it (adding role-based access control) as V2.
That classification was superseded: **shared catalog entities are globally visible/reference data.
Correct destructive and mutating access therefore depends on role-based authorization. Implementing
catalog management (or even just disabling DELETE) without that dependency would leave the V1
authorization model incomplete** — simply blocking delete without deciding who *can* legitimately
manage the catalog solves only half the problem, and doing nothing leaves any authenticated user able
to pollute or destroy data other users depend on.

## RBAC: a minimal foundation, not a permissions system

Exactly two roles — `UserRole.USER` (default) / `UserRole.ADMIN` — stored as a `role` column on
`User`, carried in the JWT access-token payload (alongside `isVerified`, same staleness reasoning:
lags reality by up to the access token's lifetime), and checked via a `RolesGuard` reading `@Roles()`
metadata. Deliberately NOT built: permission matrices, resource-level ACLs, multiple admin tiers,
team/org roles, a policy engine. Extend later if a genuine need for finer granularity appears — this
is a foundation, not the final shape.

**Guard architecture — extends the existing enhancer, doesn't compete with it.** `RolesGuard` is
registered as a THIRD global `APP_GUARD`, alongside the existing `JwtAuthGuard` and `ThrottlerGuard`
(see `app.module.ts`) — not a parallel authorization system. `@Roles(UserRole.ADMIN)` on a route (or
none at all, the default) works exactly like `@Public()` already does: opt-in metadata, read by one
globally-registered guard, with no restriction at all on the (overwhelming majority of) routes that
don't use it. **Ordering matters and was verified, not assumed**: `RolesGuard` reads `request.user`,
which only `JwtAuthGuard`'s `JwtStrategy` populates — confirmed directly against `@nestjs/core`'s
source (`application-config.js`'s `addGlobalGuard` is a plain array push; global guards execute in
registration order) that placing `JwtAuthGuard` before `RolesGuard` in the providers array is
sufficient, and this exact ordering is asserted by a dedicated test
(`app.module.guards.spec.ts`) reading the real module metadata, not assumed to hold.

**Stale role claims**: identical trade-off to `isVerified` — a role change takes up to the access
token's lifetime (15m default) to reflect in an already-issued token. No role-*management* endpoint
exists in this V1 foundation (see below), so this window isn't yet exercised in practice; documented
now so it isn't a surprise later. No automatic session revocation on role change was added — that
would be new scope (an admin-promotion feature) this checkpoint wasn't asked to build.

**How an ADMIN account actually gets created in V1: direct database access only.** No
role-management/promotion API endpoint exists — deliberately: building one wasn't asked for, and
"do not overbuild RBAC" argues against adding an endpoint's worth of new surface (its own
authorization rules, its own abuse considerations) for a need this checkpoint didn't require. To
promote an existing user: `UPDATE users SET role = 'admin' WHERE email = '...'` directly against the
target database. A future checkpoint can add a real endpoint if/when that becomes a genuine need.

## Privilege escalation: every path checked

- **Registration** — `RegisterDto` has no `role` field; the global `ValidationPipe`
  (`forbidNonWhitelisted: true`) rejects a request body that includes one outright (proven directly,
  not assumed — see `privilege-escalation.spec.ts`). `UsersService.createUser()` sets
  `role: UserRole.USER` explicitly in the row it creates (not relied on via the DB column's default
  alone) — the one place a new account's role is decided.
- **`updateMe()`** — `UpdateUserDto` has no `role` field either (same DTO-boundary protection,
  same test). A SECOND, independent line of defense also exists at the service layer:
  `UsersService.update()` no longer passes the whole DTO through to the repository — it explicitly
  picks only the `name` field, so even a future, less-careful change to `UpdateUserDto`, or a
  different caller invoking the service directly with a hand-built object, still couldn't write
  `role` through this method (verified with a test that deliberately bypasses the DTO's compile-time
  shape via `as any`, simulating exactly that scenario).
- **JWT manipulation** — the token is signed server-side with `JWT_ACCESS_SECRET`; a client cannot
  forge or alter its claims without the secret (unchanged, pre-existing guarantee).
- **Existing `UsersService` methods exposed to the user** — `findById`/`getByIdOrThrow` are
  read-only; `markVerified` is internal-only (not exposed through any controller); `update` is the
  one exposed mutation path, covered above.

## Shared catalog mutation policy: consumption vs. administration

**Read access stays open to any authenticated user** (University/Programme/Opportunity `GET`
endpoints carry no `@Roles()`) — this is catalog *consumption*, unchanged from the original "any
authenticated user can read/write" decision's read half. **Create/update/delete on
University/Programme/Opportunity now require `UserRole.ADMIN`** — catalog *administration*. A regular
user can still search universities, view programmes, view opportunities, and associate an Application
with an Opportunity exactly as before; only mutating the shared catalog itself is now privileged.

**OpportunitySource is deliberately NOT admin-gated** — inspected specifically, not assumed to follow
the same rule as its siblings. Reasoning:
1. Creating a source requires an *existing* (already admin-managed) Opportunity to attach to — unlike
   University/Programme/Opportunity, it never creates new canonical catalog identity.
2. Its purpose — provenance/citation for an opportunity ("I found this via this URL") — is
   contributory metadata, not curated catalog identity.
3. The product's own future direction (ordinary users forwarding emails/newsletters/URLs as sources)
   directly requires ordinary users to be able to create these — gating it to ADMIN would contradict
   that vision, not merely defer it.
4. Requirements/Deadlines — architecturally analogous attached sub-records on an Opportunity — are
   explicitly NOT admin-gated per the same instruction that introduced this RBAC work; consistency
   favors treating OpportunitySource the same way.

## F1/F2 — Opportunity relationship validation and University↔Programme consistency

`OpportunitiesService` previously performed ZERO relationship validation on `create()`/`update()` —
the only Group B service with this gap (every sibling validates its FKs). An invalid `universityId`/
`programmeId` surfaced as a raw FK-violation error (effectively a 500) instead of the clean 400/404
every other service gives. Separately, **nothing anywhere checked that a supplied `programmeId`
actually belongs to the supplied `universityId`** — an Opportunity could claim "Programme P at
University A" while P actually belongs to University B, silently wrong catalog data.

Fixed with one `validateRelationships()` method used by both `create()` and `update()`: validates
existence of any newly-supplied id (concurrently via `Promise.all` when both are new — same
established pattern as Track 1 Group A's Checkpoint 5), and — the actual cross-consistency check —
fetches whichever programme row will be in effect after the write (even if `programmeId` itself isn't
the field changing this call, since changing only `universityId` while a programme is already set
needs the SAME check) and rejects a mismatch with a clear `BadRequestException`.

## F3 — OpportunitySource re-parenting

`update()` didn't validate a changed `opportunityId` at all — an invalid id would 500 rather than 404,
and a *valid but different* id would silently re-parent a source's provenance record to an unrelated
opportunity. Fixed by validating it the same way `create()` already does. Considered making
`opportunityId` immutable after creation instead (mirroring `ApplicationDocument.documentId`'s
fixed-at-attach-time design) — validating it was chosen as the smaller, sufficient fix, consistent
with every sibling service's existing pattern; immutability remains available to revisit if a real
need for it appears.

## F4 — Required-string validation, and why trimming happens at the DTO layer

`@IsString()` alone accepts `''`; `@IsNotEmpty()` alone does not reject whitespace-only strings
(confirmed by reading class-validator's own source — `isNotEmpty` only checks `!== ''`). A shared
`trim` `@Transform()` (`common/validators/trim.transform.ts`) runs before `@IsNotEmpty()` on every
required name/title/label/description field across University/Programme/Opportunity/Requirement/
Deadline — turning a whitespace-only value into `''` so `@IsNotEmpty()` actually catches it, and, as a
useful side effect, meaning the *stored* value is always trimmed — leading/trailing whitespace can no
longer create a near-duplicate catalog entry that differs only invisibly from an existing one.

## I2 — Non-negative funding amounts

`Opportunity.fundingAmount` used `@IsNumberString()`, which allows negative values — nonsensical for
a funding amount. Replaced with `@Matches(/^\d+(\.\d{1,2})?$/)`, matching the column's actual
`numeric(12,2)` shape (non-negative, up to 2 decimal places) directly in the validation rule.

## F5 — CHECK constraints for Requirement/Deadline's "at least one parent" invariant

`RequirementsService`/`DeadlinesService` already enforced "at least one of
opportunityId/applicationId(/taskId/requirementId)" at the service layer on `create()` — but nothing
enforced it at the database level, and the project's own stated principle (preserved through this
audit) is to prefer DB constraints where they provide a real guarantee. The specific risk: a future
write path that doesn't go through today's single `create()` method — exactly what the product's own
planned ingestion pipelines would be — could insert a fully-orphaned row with no error at any layer.
Added `@Check()` constraints on both entities' migrations. Verified directly against Neon DEVELOP
before migrating (a query confirming zero existing rows would violate either constraint) and after
(a deliberate, rolled-back `INSERT` proving the constraint genuinely rejects an all-null row).

## F7 — Opportunity.findAll() no longer eager-loads everything

Already self-documented as a known limitation (see the Phase 1.5 "Existence check vs. full detail
load" entry above) — now actually fixed: `findAll()` no longer requests
`sources`/`requirements`/`deadlines` relations; only `findOneWithDetailsOrThrow` (the real detail view,
`GET /opportunities/:id`) does. The list view never needed that nested detail.

## I1 — Deadline's independent link checks now run concurrently

`validateAndAuthorizeLinks()`'s up to four checks (Opportunity/Application/Task/Requirement) are each
independent of the others' result — previously sequential, now concurrent via `Promise.all`, the exact
pattern already established for this class of fix (Track 1 Group A, Checkpoint 5).

## University/Programme duplicate handling: application-level, not a DB constraint (deferred)

No reliable natural key exists for a University (no external/domain identifier field) — a hard
`UNIQUE` constraint on `name` alone would risk incorrectly blocking legitimate distinct institutions
that happen to share a display name. Recommended (not yet built, pending product/UX design for the
confirmation workflow): case-insensitive, whitespace-normalized duplicate *detection* that warns
rather than blocks. Deliberately not a database constraint.

# Track 1 Group C — Application Journey & Workflow

## A Journey fans out into multiple Applications; Application.journeyId is immutable (I5 / C1.3)

A single `ApplicationJourney` (e.g. "MSc Computer Science — University of Twente") legitimately owns
several `Application`s at once — an admission application and one or more independent scholarship
applications for the same programme, each tracked separately. Nothing restricts this fan-out, and
nothing needs to: `Application.opportunityId` is independent of the Journey's own University/Programme
and is never cross-checked against it (an Application can legitimately link an Opportunity unrelated
to the Journey's declared institution — e.g. a general/external scholarship tracked under the same
Journey for convenience).

**`journeyId` cannot be changed after an Application is created.** `Task` independently stores both
`applicationId` and `journeyId` (see below) — allowing an Application to move between Journeys would
silently desynchronize every Task already attached to it, with nothing at any layer to catch or repair
the mismatch afterward. `ApplicationsService.update()` treats a resent-but-unchanged `journeyId` (the
common case for a client that always submits every field) as a no-op, and rejects an actual attempted
change with a clear `BadRequestException` rather than silently ignoring it or silently applying it.
Deliberately NOT built: cascading Task reassignment, a dedicated "move Application to a different
Journey" feature, or a transaction wrapping this check — none were asked for, and the immutability
guard alone is the smaller, sufficient fix for the identified risk.

## Task.journeyId is now a required column, matching every code path that already assumed it (C1.1)

`Task.journeyId` was schema-nullable despite `CreateTaskDto` always requiring it and
`TasksService`'s own lookup helper already defensively guarding against a missing one — the schema
wasn't actually backing an invariant every code path already assumed held. Verified zero existing
`NULL journey_id` rows on Neon DEVELOP before migrating (and re-verified the resulting schema state,
plus a deliberate rolled-back `INSERT` proving the constraint is genuinely enforced, after). Every
Task now unconditionally belongs to a Journey; `applicationId`/`requirementId` remain optional
scoping refinements within that Journey.

## Task dependency scope: same-Application or same-Journey only, never cross-scope (I3 / C2)

`Task.dependsOnTaskId` is informational only (see `task.entity.ts` — never enforced as a workflow
blocker, confirmed by a dedicated regression test that a HARD dependency never blocks a DONE
transition), but an informational link to a task in a completely unrelated Application or Journey
would still be a meaningless, confusing pointer with no consistent interpretation. `TasksService` now
validates dependency *scope* (never *satisfaction*) via one shared `validateDependencyScope()` helper
used by both `create()` and `update()`:

- A task cannot depend on itself.
- An **Application-scoped** dependent task (has `applicationId`) may only depend on a task belonging
  to that **same Application**.
- A **Journey-level** dependent task (no `applicationId`) may only depend on another **journey-level**
  task (also no `applicationId`) belonging to the **same Journey** — it may never depend on an
  Application-scoped task, even one under the same Journey, since that task's own completion is
  scoped to a narrower context the journey-level task doesn't share.
- The dependency target is resolved via `findOwnedOrThrow()`, the same ownership-enforcing lookup used
  everywhere else — a dependency can never silently reference another user's task.

`dependsOnTaskId` accepts `undefined` (leave unchanged), `null` (explicitly clear an existing
dependency), or a UUID (`@ValidateIf` in `CreateTaskDto`/`UpdateTaskDto`) — clearing a dependency also
clears `dependencyType`. `dependencyType` can never be set without a resulting `dependsOnTaskId`
(checked on both `create()` and `update()`, using each field's *effective* post-write value, not just
whichever fields the PATCH happened to touch).

## Task update() cross-consistency uses "effective value" validation (C2.5)

Same pattern established in Group B's Opportunity `F2` fix: on `update()`, whichever of
`journeyId`/`applicationId` the PATCH does *not* touch still keeps its current stored value, and that
effective pair — not just the field(s) actually present in the DTO — is what gets validated for
mutual consistency. Concretely: changing only `journeyId` on a Task that already has an `applicationId`
re-validates that the (unchanged) Application still belongs to the (new) Journey, and rejects the move
if it doesn't — an Application isn't itself reassignable between Journeys (see above), so this
correctly rejects any attempt to route around that immutability by moving the Task instead.

## Opportunity → Application Requirement copy: one-time, with provenance, never live sync (I6 / C3)

When an `Application` is created with a linked `opportunityId`, every `Requirement` currently attached
to that Opportunity is copied into a new, independent Application-scoped `Requirement` row — status
reset to `RequirementStatus.UNKNOWN` (a requirement's satisfaction is specific to *this* application,
never inherited from the catalog row's current status), `requirementType`/`description`/`notes` copied
verbatim, `opportunityId: null` (the copy belongs to the Application only), and
`copiedFromRequirementId` set to the source row's id — provenance only, a breadcrumb, never a live
link. Nothing anywhere re-reads or re-syncs a copy from its source after creation.

**This is deliberate and must not be "fixed" later**: live synchronization would mean an Application's
already-submitted or already-tracked requirements silently change after the fact when the Opportunity
catalog entry is edited — directly conflicting with the historical-integrity guarantee established for
`ApplicationSnapshot`/`ApplicationDocument` (an Application's state must reflect what was true *at the
time*, not the catalog's current state). If the Opportunity is later edited or its source Requirements
deleted (`onDelete: 'SET NULL'` on `copiedFromRequirementId`), already-copied rows are completely
unaffected — only the provenance breadcrumb is lost, never the copied data itself.

**Not indexed**: `copiedFromRequirementId` is a provenance/reference field, not a high-volume lookup
path — no query in this system filters or joins on it. An index would be pure write-amplification with
no corresponding read benefit; add one later only if a genuine lookup need appears.

**Transaction scope kept minimal**: the Opportunity's requirements are read *before* the transaction
opens (a plain read with no correctness dependency on the write that follows — worst case, a
requirement added to the Opportunity a moment after this read simply isn't copied this time, which is
acceptable, not a correctness bug). The transaction itself contains exactly the two writes that must
succeed or fail together: the Application INSERT and the bulk Requirement INSERT (one
`manager.save(Requirement, copies[])` call, not one round trip per requirement). Default (READ
COMMITTED) isolation — no demonstrated need for SERIALIZABLE was identified.

**Scoped to creation only, not to every Application write.** If an Application's `opportunityId` is
changed later via `update()`, no copy is triggered — the copy is explicitly a one-time action tied to
Application *creation*, not a general "keep requirements in sync with whatever opportunity is
currently linked" behavior (which would reintroduce exactly the live-sync problem this feature is
designed to avoid). This wasn't asked for and isn't built.

# Track 1 Group D — Documents & Historical Records

## Application Snapshot creation model

(This section is the one `application-snapshot.entity.ts`'s own doc comment has always pointed
readers at — it was never actually written down until Group D closed; the pointer was dangling
until now.)

**Creation is always an explicit user action.** Nothing in this codebase creates a snapshot
automatically — not on status change, not on submission, not on a document change, not on a
schedule. `CreateApplicationSnapshotDto` accepts only an optional `label`; `createdVia` is always
server-set to `SnapshotCreatedVia.MANUAL` and is never accepted from the client (proven by a
dedicated test). A future "intelligent suggestion" layer may recommend *when* a user might want to
take a snapshot, based on signals (e.g. "you're about to change your submission status — snapshot
first?") — but the suggestion itself never creates the row; only an explicit user decision does.
`SnapshotCreatedVia.SUGGESTED` exists in the enum for exactly this future case and is not written by
anything today.

**Snapshot content is a hybrid, not a single normalized shape.** A snapshot's `data` jsonb blob
captures: relevant Application facts (status, type, title, dates, portal/URL, notes), relevant
Profile fields (nationality, education, experience, skills, certifications, languages — explicitly
excluding internal-only Profile metadata), Requirement state (type, description, status, notes, and
— since Group D — `requirementId` and the `copiedFromRequirementId` provenance breadcrumb),
attached-document identity (`documentId` + `version` only — never a copy of the file or its
metadata), and written responses (currently always empty — no storage model for that exists yet).
This is a deliberate hybrid: enough breadth to be useful as a real historical record, without
duplicating data that's safely re-derivable from an immutable source (a Document row never changes
after it's written, so `documentId` + `version` alone is sufficient — see "Snapshot document
integrity" below).

**Immutability is architectural, not just documented.** `ApplicationSnapshotsService` has no
`update()`/`remove()` method — proven by a dedicated test asserting both are `undefined` on the
service instance. `data` is populated once, from primitive values copied at `create()` time, and
nothing anywhere re-reads or re-derives it afterward.

**Application deletion is the one way a snapshot can be destroyed, and this is intentional — see
"Application deletion: hard delete, explicitly documented" below.**

## Cloudinary deletion ordering — now DB-first, not Cloudinary-first

**The defect:** `DocumentsService.remove()` used to delete the Cloudinary asset, then attempt the
Postgres row delete. Because `application_documents.document_id` carries `ON DELETE RESTRICT`,
deleting a Document that's still attached to any Application was **guaranteed** to fail at the DB
step — but only *after* the real file had already been irreversibly destroyed at Cloudinary. The
failure surfaced as a generic, unhelpful 500 (an uncaught `QueryFailedError` isn't an
`HttpException`, so `AllExceptionsFilter` logs it server-side and returns `Internal server error`
with no detail). Net effect: the DB row (and anything still referencing it — an `ApplicationDocument`
or an `ApplicationSnapshot`) survived, now permanently pointing at a file that 404s from Cloudinary —
exactly the outcome the `RESTRICT` constraint exists to prevent.

**The fix — the database is the source of truth for document-reference integrity, always checked
first:**
1. Ownership check.
2. Three independent eligibility checks, run concurrently: is this version currently attached
   (`ApplicationDocument`)? Is it referenced by any existing `ApplicationSnapshot`? Does a newer
   version depend on it via `previousVersionId`? Each produces a clean `ConflictException` (409),
   never a raw DB error — and each also has a DB-level backstop (`ON DELETE RESTRICT` on the
   relevant FKs, confirmed via `psql`) as defense-in-depth, consistent with this codebase's
   established double-layer pattern (cf. Requirement/Deadline's CHECK constraints).
3. Delete the Postgres row (in the same transaction as the current-version promotion, if
   applicable — see "Version deletion & current-version promotion" below).
4. **Only after the DB deletion has committed**, attempt the Cloudinary delete.

**Cloudinary and Postgres cannot share one transaction** — there is no distributed-transaction
mechanism here, and building one is explicitly out of scope for this stage of the product. If the
Cloudinary delete fails after a successful DB deletion, the DB deletion is **not** reversed (there is
nothing to compensate — the row is correctly gone) and nothing re-inserts a "deleted" row to
paper over it. The failure is logged with enough detail (Document id, Cloudinary `publicId`) to
find and manually clean up the orphaned asset later. This is the practical, proportionate answer for
this stage — not a retry queue, not an outbox pattern, not a job platform; those remain V2 unless
real operational experience shows orphaned assets are actually piling up.

**Upload ordering is unchanged and remains correct**: Cloudinary upload still happens before the DB
write, and a DB-write failure after a successful upload still just orphans the upload (wasted
storage, never a broken reference) — this was already sound and Group D didn't touch it.

## Version deletion & current-version promotion (D-P2 / D-P3)

**Version-chain integrity is now DB-enforced, not just convention.** `Document.previousVersionId`'s
FK changed from `ON DELETE SET NULL` to `ON DELETE RESTRICT` (migration
`1788989842296-GroupDDocumentVersionChainIntegrity`) — deleting a version that a newer version still
depends on is now rejected by the database itself, the same protective pattern already used for
`ApplicationDocument.document`. `SET NULL` would have let the chain silently truncate one hop early
with no error to anyone; `RESTRICT` means it can't happen at all. `DocumentsService.remove()` also
checks this explicitly up front for a clean 409 — the DB constraint is the backstop, not the only
defense.

**Snapshot references can't be protected by a normal FK** (`ApplicationSnapshot.data` is jsonb, not a
relational column), so this is enforced at the service layer instead: a targeted PostgreSQL JSONB
containment query (`data -> 'documents' @> '[{"documentId": "..."}]'`, confirmed against real
Postgres to match on a documentId regardless of what other keys — like `version` — the stored array
element also carries) checks whether the version being deleted appears in ANY of the owning user's
existing snapshots, scoped by a join through `applications` → `application_journeys` → `user_id` so
the query can never be used to probe another user's snapshot contents. This closes the exact gap the
Group D inspection found: a version that was attached at snapshot-creation time but has since been
detached has no FK protecting it at all, since a jsonb column can't carry a real foreign key — this
explicit check is the only thing that can.

**Current-version deletion promotes the previous version**, in the same transaction as the delete —
so a document family is never left with zero `isCurrent: true` rows. If there is no previous version
(the version being deleted is the only one in its family), deleting it removes the family entirely;
there's no "empty current state" left to worry about, since no rows remain for that family at all.

**No document-family-id column was introduced.** The version chain (`previousVersionId`) remains the
only notion of "family" — sufficient for every rule above; a denormalized family-id column remains a
possible future simplification, not a genuine requirement surfaced by this work.

**No speculative index was added** for the new JSONB containment query. Snapshot volume at this
stage of the product is tiny; add a targeted (likely partial/expression) index later if real usage
data shows the query is actually slow — consistent with this project's established "no speculative
indexes" convention (cf. pagination, Requirement/Deadline indexing decisions).

## Concurrent document-version creation is now race-safe (D1)

**The race:** two concurrent `uploadNewVersion()` calls targeting the same parent document could both
read `previous.version = N` before either committed, and both create a sibling with `version: N + 1`
and `isCurrent: true` — producing duplicate version numbers and two "current" rows for one document
family.

**The fix:** the version-determining read now happens *inside* the transaction, against a row locked
with `SELECT ... FOR UPDATE` (`createQueryBuilder(...).setLock('pessimistic_write')`), and the locked
row's `isCurrent` flag is re-checked before proceeding. The second of two concurrent calls blocks on
the row lock until the first commits; once unblocked, it re-reads the row's latest **committed**
state (documented Postgres behavior for `SELECT ... FOR UPDATE` under READ COMMITTED, this
connection's isolation level) — sees `isCurrent: false` (the winner already flipped it), and is
rejected with a clean `ConflictException` ("this document has already been superseded... refresh and
try again") instead of silently creating a duplicate-numbered sibling.

**A row lock is sufficient — no advisory lock was introduced.** The invariant being protected ("only
the current version's row may be superseded") lives entirely on the one row being locked; there is no
cross-row or cross-table coordination need here, unlike the per-user advisory lock used for refresh-
token consumption (which coordinates across potentially many rows for one user).

## ApplicationDocument detach (D-P4)

**New operation**: `DELETE /applications/:id/documents/:documentId` — removes exactly one attachment
(the `ApplicationDocument` join row), and nothing else. It never touches the underlying `Document`
row, never calls Cloudinary, and never touches any existing `ApplicationSnapshot` — a snapshot's
`data.documents[]` is a point-in-time copy made once, at snapshot-creation time, entirely
disconnected from whatever is or isn't currently attached afterward (proven directly by a dedicated
historical-integrity test: detaching a document after a snapshot was taken leaves that snapshot's
stored reference completely unchanged).

**Identified by `documentId`, not the `ApplicationDocument` row's own `id`.** This matches the attach
endpoint's own request-body field name, and is unambiguous by construction:
`UNIQUE(applicationId, documentId)` guarantees at most one attachment row can ever match a given
(applicationId, documentId) pair, so there is no scenario where `documentId` could identify more than
one candidate row to remove.

**Only Application ownership is (re-)checked** — the Document's own ownership was already verified at
`attach()` time, and the row being removed is inherently scoped to an Application the caller already
owns; there is no additional ownership dimension to check.

This closes a real, previously-identified product gap: before this, there was no way to remove a
stale attachment short of deleting the underlying Document entirely (which the `RESTRICT` constraint
correctly refuses anyway while attached) — a user could accumulate attachments with no cleanup path.

## Application deletion: hard delete, explicitly documented (D-P5)

**Current, verified, intentional behavior**: deleting an Application cascades
(`ON DELETE CASCADE`, confirmed via `psql`) through `ApplicationDocument`, `Requirement`, `Task`,
`Deadline`, and — yes — `ApplicationSnapshot`. **Deleting an Application permanently destroys every
snapshot it ever had.** No soft-delete/archive mechanism exists anywhere in this codebase (`BaseEntity`
carries no `deletedAt`), and none was introduced by Group D.

**This is not a historical-integrity bug.** The historical-integrity guarantee this codebase
maintains is about *mutation*: a snapshot must never be rewritten by a later change to the
Application/Profile/Requirement/Document data it was built from — and that guarantee holds completely
(see the historical-integrity test suite). Application *deletion* is a different, explicit,
ownership-scoped action: a user deleting their own Application is exercising their own prerogative
over their own data, not something that happens to them silently. **This is irreversible** — there is
no undo, no trash/recycle-bin concept anywhere in this codebase — and that irreversibility is a
property worth stating plainly rather than leaving implicit, which this section now does. If a
"soft-delete Applications" need is ever demonstrated (e.g. accidental-deletion recovery becomes a
real support burden), that is a distinct, larger feature — introducing `deletedAt`-style soft delete
across every cascading child entity — and remains explicitly deferred, not silently ruled out.

## Snapshot requirement provenance (D-P6)

The Requirement mapping inside `ApplicationSnapshotsService.create()` now also captures
`requirementId` and `copiedFromRequirementId` alongside the fields already captured
(`requirementType`/`description`/`status`/`notes`). For a manually-created Application Requirement,
`copiedFromRequirementId` is `null`; for a Group C copied Requirement, it's the source Opportunity
Requirement's id — copied as a plain value at snapshot-creation time, exactly like every other
captured field. **The source row is never re-read or re-resolved later** — a snapshot's stored
provenance value survives the source Opportunity Requirement being edited or deleted unchanged
(proven by a dedicated historical-integrity test), consistent with every other "point-in-time, not
live" guarantee this entity already provides.
