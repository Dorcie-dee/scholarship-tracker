# Architectural decisions

Non-obvious choices made during the foundation build, and why. Ordered roughly by how often they're
referenced from code comments. If you're changing behavior near a comment that says "see
decisions.md", read the matching section here first — there's usually a reason the obvious-looking
alternative wasn't used.

## No AI yet

**Superseded (Phase 2):** AI-assisted requirement suggestions are implemented behind a replaceable
`RequirementAiProvider` boundary (default: deterministic heuristic provider). Providers never mutate
authoritative `Requirement.status` — they persist pending suggestion fields; the user confirms or
rejects. See `api-reference.md` (`POST /requirements/:id/ai-suggestion` and confirm/reject).

Original intent (build core CRUD before AI) remains historically accurate for earlier phases.

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

**Later refinement (opportunity capture UX):** `POST /opportunities` is open to any authenticated
user so a person can record a scholarship they found (URL / article excerpt) without waiting for an
admin-seeded catalog row. `PATCH`/`DELETE` on opportunities remain ADMIN-only. Universities and
programmes stay fully ADMIN for mutations. Frontend primary entry is Dashboard → **Start tracking**.

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

**Stale role claims**: the access token still carries a `role` claim that can lag a DB
change by up to the access TTL (15m default). **`@Roles()` routes re-read the live role
from the database** via `RolesGuard` + `UsersService.getRoleById()` — demotion takes
effect immediately for admin-only endpoints (including `GET /users`). Ordinary routes
without `@Roles()` do not pay that lookup. JWT authentication itself is unchanged.

**How an ADMIN account gets created:** dedicated `PATCH /users/:id/role` (ADMIN-only,
`UpdateUserRoleDto`), with directory discovery via `GET /users` (ADMIN-only). Self-change
forbidden; demoting the last remaining ADMIN forbidden; audit log `user.role_changed` on
every successful change. Bootstrap of the *first* ADMIN may still use a direct SQL update
in a fresh environment. `/users/me` and `UpdateUserDto` still never accept `role`.

**Frontend home for role changes:** Profile → Account & security (ADMIN JWT visibility
only). Uses the server-backed `GET /users` directory (search, role filter, cursor Load
more) plus confirmation before `PATCH /users/:id/role`. No separate Users nav page; no
paste-user-ID field. JWT `role` controls section visibility only — the API remains the
enforcement layer.

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

**Historical integrity is append-only (Phase 2).** In-place `update()` does not exist. Edits go
through `edit()`, which creates a **new** snapshot row with `supersedesSnapshotId` pointing at the
previous revision — the previous row's `data`/`createdAt`/`createdVia` remain untouched. Explicit
`remove()` is allowed after the ownership chain check (user → application → snapshot); there is no
“must keep one snapshot” invariant. Descendants keep lineage via `ON DELETE SET NULL` on
`supersedesSnapshotId`. Document historical-integrity checks (snapshot JSONB references) remain
valid for surviving snapshot rows.

**Application deletion / purge still destroys snapshots owned by that application** — see Batch 7
soft-delete & purge. Explicit snapshot delete is an additional, ownership-scoped path.

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

**Superseded by Production Hardening Batch 7** — see `decisions.md`, "Batch 7 — Application
soft-delete & account erasure". `DELETE /applications/:id` is now a soft delete, narrowly scoped to
Application only (exactly the "distinct, larger feature" flagged above, but deliberately NOT applied
"across every cascading child entity" — only Application itself gets `deletedAt`; its children still
cascade-hard-delete once the purge job removes the parent). The irreversibility framing above still
holds for every other entity in this codebase.

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

# Track 1 Group E — Platform-Wide Quality & Production Readiness

## JWT placeholder rejection in production (E1)

`JwtStrategy` already refused to start with an *empty* `JWT_ACCESS_SECRET` — that check is unchanged.
The Group E inspection found a different, related gap: nothing rejected the exact placeholder value
shipped in `sample.env` (`dev_only_access_secret_change_me_please_1234567890`) if someone copied it
verbatim into a real `.env`, despite the file's own prominent warning to change it. A fixed, publicly-
readable-from-source secret signing every access token would be a serious production vulnerability.

**Fix**: `configuration.ts` — the centralized config-loading boundary, not scattered across
`AuthModule`/`JwtStrategy`/`AuthService` — now calls `validateAuthSecret()` while building the config
object. It throws only when `isProduction && accessTokenSecret === KNOWN_SAMPLE_JWT_ACCESS_SECRET`.
Deliberately **not** merged with the pre-existing empty-secret check (still in `JwtStrategy`, still at
the point it's actually needed): an empty secret and a known-placeholder secret are different risks
with different correct scopes — empty must always fail (dev/test/prod alike), the placeholder must
only fail in production (using it locally is the documented quick-start path, not a mistake).

Same "one place validates, everything downstream just reads an already-valid value" shape as
`EmailService`'s existing production fail-fast check for missing SMTP config (see "Email delivery" —
now this project's second instance of the same pattern, not a new one). The rejection message never
contains the secret's value — the check is a fixed-string comparison against a known constant, so
there's nothing about an *unknown* value to accidentally log or echo back.

## Ownership failures normalized to 404 (E2)

`assertOwnership()` (`common/utils/ownership.ts`) previously threw `ForbiddenException` (403) for "this
resource exists but isn't yours," while a genuinely missing resource threw `NotFoundException` (404)
from the preceding lookup — a minor existence-disclosure inconsistency: a caller could distinguish "a
real resource exists at this id, I just can't reach it" from "nothing exists at this id" purely from
the status code. `ApplicationSnapshotsService.findOneOrThrow()` and
`ApplicationDocumentsService.detach()` (both Track 1 Group D) already avoided this by construction —
each scopes its lookup query by both the resource id and the ownership predicate together, so a
foreign-owned or nonexistent row are indistinguishable 404s from the start.

**Fix**: `assertOwnership()` now throws `NotFoundException` instead — a single, centralized change,
verified to be safe precisely because `assertOwnership()` has exactly four call sites in the entire
codebase (`JourneysService`, `ApplicationsService`, `TasksService`, `DocumentsService`, confirmed by a
full-repository grep before changing it), and `ForbiddenException` is used nowhere else *except*
`RolesGuard` — a completely separate, legitimate 403 (an authenticated, correctly-identified caller
who simply lacks the ADMIN role a shared-catalog mutation requires — see "RBAC: a minimal foundation").
That case has nothing to hide (shared catalog data is already readable by any authenticated user) and
is deliberately untouched — it remains a 403.

**No ownership enforcement was weakened.** A foreign-owned resource is exactly as inaccessible as
before; only the HTTP status code communicating that changed, from 403 to 404. Every affected service's
own test suite gained dedicated "foreign resource → 404" / "nonexistent resource → 404" /
"legitimate owner still succeeds" tests, exercising the real `findOwnedOrThrow()` path rather than a
mocked-away one.

## Requirement re-parenting: an accepted consequence of "not ADMIN-gated" (E3)

Track 1 Group B deliberately decided that `Requirement`/`Deadline` mutation stays open to any
authenticated user (see "Shared catalog mutation policy: consumption vs. administration") — unlike
University/Programme/Opportunity, which require ADMIN. One concrete consequence of that decision,
surfaced by the Group E inspection but not explicitly written down at the time: because
`RequirementsService.update()` allows changing `applicationId` (re-parenting a Requirement onto the
caller's own Application) without independently clearing `opportunityId`, an authenticated user can
take a shared, Opportunity-only catalog Requirement and attach it to their own Application, ending up
with a Requirement scoped to both at once.

**This is intentional current behavior, not a newly discovered vulnerability.** It follows directly
from a decision already made and documented: any authenticated user can *already* mutate an
Opportunity-scoped Requirement's `description`/`status`/`notes` today, re-parenting is not a new
capability layered on top of an otherwise-protected resource — it's the same "not admin-gated"
permission expressed through a different field. No code changed for this item; Group E's job here was
documentation, making an already-accepted consequence explicit rather than leaving it implicit.

**Not addressed, and deliberately so**: whether Requirement mutation should eventually be scoped more
tightly (e.g. only the Opportunity-owning ADMIN can touch an Opportunity-scoped Requirement's identity
fields, independent of whether it's also Application-scoped) is a separate product/authorization
decision for a future checkpoint — not something Group E's production-hardening scope calls for or was
asked to resolve.

## No migration required

Every Group E change (E1, E2, E3) is application-layer only — no new column, index, constraint, or
other structural change. `phase-1o5.txt`'s status block records this explicitly rather than silently.

# Production Hardening (Consolidated Implementation)

This supersedes the earlier "Track 1 closed" position. A dedicated due-diligence checkpoint
(1 CRITICAL, 9 IMPORTANT, 10 production-gap findings) concluded the backend was NOT ready for
genuine production operation — growing users, real traffic, horizontal scaling, external-service
failures, abuse, operational incidents. This section records what the consolidated hardening pass
actually changed, batch by batch, as the batches complete (not written retroactively at the end —
kept current throughout, per this phase's own standing rule). The full pass/fail verdict and
Previously-Deferred-Items table live in the final report, not here; this file only records *why*
each change was made the way it was.

## Batch 1 — Deployment & process safety

**Trust proxy**: `app.set('trust proxy', trustProxyHops)` (configurable, defaults to `1` — a single
reverse proxy/load balancer hop) so `req.ip` and the throttler's IP-keying reflect the real client,
not the proxy, once this app sits behind one in production.

**Graceful shutdown**: `app.enableShutdownHooks()` — in-flight requests and the DB pool get a chance
to drain on SIGTERM instead of being cut mid-request during a rolling deploy or autoscaling
scale-down.

**Body size limits**: `app.useBodyParser('json'/'urlencoded', { limit: '256kb' })`, applied globally
via `NestFactory.create(..., { bodyParser: false })` + explicit `configureApp()` wiring (the default
Express body parser has no limit at all). 256kb comfortably covers this app's actual JSON payload
shapes (profile updates, application/task/requirement bodies) — file uploads go through
`multipart/form-data` + Multer's own `limits.fileSize`, a separate, already-existing control, not this
limit.

**Liveness vs. readiness split**: `GET /health` (liveness — process is up, no DB dependency) vs.
`GET /health/ready` (readiness — real `SELECT 1` against the DB, `ServiceUnavailableException` on
failure with no driver-detail leak in the response). Previously a single `/health` conflated the two,
so a container orchestrator restarting on liveness failure would restart a perfectly healthy process
just because the DB was briefly unreachable — the correct response to a DB outage is "stop routing
traffic here" (readiness), not "kill and restart the process" (liveness).

**Connection pool sizing**: `typeorm.config.ts`'s `extra: { max, min, connectionTimeoutMillis,
idleTimeoutMillis }`, all config-driven (see `configuration.ts`'s `database.pool.*`) rather than
relying on the driver's undocumented defaults, which don't account for this app's actual expected
concurrency or Neon's own connection ceiling.

**`statement_timeout` — a genuinely non-obvious Neon constraint**: a `pg` connection option of
`options=-c statement_timeout=...` is REJECTED outright by Neon's pooled endpoint ("unsupported
startup parameter"); a plain `statement_timeout` connection option is silently IGNORED (connection
succeeds, but `SHOW statement_timeout` still reports the server default) — both empirically verified
against this project's real Neon endpoint, not assumed from generic Postgres/pgbouncer documentation.
The only mechanism confirmed to work: `StatementTimeoutProvider` (`OnApplicationBootstrap`) reaches
into the TypeORM driver's underlying `pg` `Pool` and attaches `pool.on('connect', client =>
client.query('SET statement_timeout = <ms>'))` — issuing it as a real SQL statement on every new
connection, not a startup parameter. Verified end-to-end with a real `pg_sleep(20)` query, genuinely
cancelled at 15000ms. Without this, a single slow/runaway query (a missing index, a pathological
filter) could hold a connection indefinitely and starve the pool.

## Batch 2 — Database & auth maintenance

**Missing index**: `refresh_sessions.user_id` had no index despite being the column every login,
refresh, and logout-all operation filters on — every such query was a sequential scan once the table
grew. Fixed with a migration (`ProductionHardeningIndexesAndConstraints`), verified against Neon
DEVELOP.

**Unbounded auth-artifact growth**: `refresh_sessions`, OTPs, and password-reset tokens are written
on every login/registration/reset request and were never purged — expired and revoked rows accumulate
forever. `AuthCleanupService` (`@Cron(EVERY_HOUR)`) deletes rows that are expired OR
revoked/consumed/invalidated AND past a configurable retention window (`authArtifactRetentionDays`,
default 7 days — long enough for any real investigation into a specific past session, short enough to
bound table growth). Kept as one in-process `@nestjs/schedule` cron rather than a separate worker
process/queue — this workload (a few DELETE statements, hourly) doesn't justify the operational
overhead of a second deployable.

**Account-scoped login brute-force protection — a throttle, not a lock**: the pre-existing rate
limiting was IP-only, so a distributed/rotating-IP attacker could try unlimited passwords against one
known victim email. The obvious fix — lock the account after N failures — was deliberately rejected:
it would let an attacker deny a legitimate user service simply by submitting wrong passwords for their
known email, with no need to actually guess correctly. Instead, `LoginGuardService` tracks failures
per-*email* (normalized) and rejects further attempts only for the remainder of the current window
(`loginLockout.{maxAttempts,windowSeconds}`) — self-recovering, never a hard, attacker-triggerable
lock. Redis-backed (`INCR`+`EXPIRE`) when available, in-process `Map` fallback otherwise, fails OPEN
on Redis errors (an availability incident on the rate-limit store must not become an authentication
outage) — same fail-open reasoning as the IP throttle for non-strict routes, see Batch 3.

## Batch 3 — Distributed rate limiting

The prior due-diligence checkpoint had concluded per-process (in-memory) rate limiting was acceptable
until a second instance existed. This phase's explicit instruction overrides that: implement
Redis-backed distributed rate limiting now, not deferred to "when N>1." `RedisThrottlerStorage`
implements `@nestjs/throttler`'s `ThrottlerStorage` interface with a single atomic Lua `EVAL` script
(INCR + block-tracking in one round-trip, avoiding a check-then-act race between concurrent requests
across instances), mirroring the in-memory implementation's semantics exactly (hits freeze once
blocked; unblock only after the block duration elapses, not immediately when the hit-count window
resets).

**Fail-open vs. fail-closed, per route, not a blanket policy**: `ProductionThrottlerGuard` catches a
Redis-unavailable error and applies one of two policies based on a new `@StrictRateLimit()` marker
decorator. Ordinary routes fail OPEN (a rate-limit-store outage must not take down the whole API —
availability wins). Routes marked `@StrictRateLimit()` — every auth endpoint that gates account
creation or credential validation (register, login, refresh, verify-email, resend-verification,
forgot-password, reset-password) — fail CLOSED (`ServiceUnavailableException`): for these specifically,
an attacker exploiting a Redis outage to bypass throttling is a worse outcome than briefly refusing
new auth attempts during that outage.

**Live-verified, not just unit-tested**: booted two real server instances on different ports sharing
one Redis instance and one Neon connection; confirmed a rate limit exhausted against instance A was
already exhausted on instance B's very first request — genuinely shared state, not per-process.

## Batch 4 — Pagination

Every unbounded, potentially-large list endpoint now returns a keyset/cursor-paginated result
(`{ items, nextCursor, hasNextPage }`) via shared utilities in `common/pagination/cursor.ts` —
deliberately one consistent contract across the whole API rather than a different shape per endpoint
(offset-based here, cursor-based there): Universities, Programmes, Opportunities, OpportunitySources,
Journeys, Applications, Tasks, Deadlines, Requirements, Documents.

**Keyset, not offset**: `(sortColumn, id)` as a tiebreaker pair, opaque base64url-encoded cursor
carrying the last-seen row's sort value + id, `WHERE (sortColumn, id) < (cursorValue, cursorId)`-style
comparison, fetch `limit + 1` rows to detect `hasNextPage` without a separate COUNT query. Chosen over
offset/`LIMIT...OFFSET` specifically because offset pagination degrades (an increasingly expensive
skip-scan) as a table grows and as page depth increases — the exact "increasing database size" concern
this phase is meant to address — while keyset pagination's cost stays roughly constant regardless of
page depth, and it's immune to the "row shifted under you between page 1 and page 2" duplication/skip
bug offset pagination has whenever new rows are inserted concurrently.

**Deterministic ordering**: every paginated query orders by the same `(sortColumn, id)` pair it filters
on — the `id` tiebreaker is required for a stable sort whenever the primary sort column has ties (e.g.
two rows created in the same millisecond), otherwise a page boundary is nondeterministic.

**Two endpoints deliberately left unpaginated**: `ApplicationDocumentsService.findAllForApplication`
and `ApplicationSnapshotsService.findAllForApplication` — both are bounded by construction (one
Application's own attachments/snapshots, not a global or cross-user collection), so pagination would
add complexity with no real unbounded-growth risk to address. Not a production gap — existing
architecture retained because the underlying collection's size is structurally capped by the domain
model itself.

**One default-sort change, deliberate**: `TasksService.findAllForUser()`'s default order moved from
`dueDate ASC` (nullable) to `createdAt DESC` (non-nullable). A keyset comparison against a nullable
sort column needs extra NULL-handling logic with no corresponding benefit here, and `createdAt DESC`
matches every other paginated list's sort axis — consistency over preserving a due-date-first default
that most callers weren't relying on structurally.

## Batch 5 — Index / query-timeout hardening

Folded into Batches 1 and 2 rather than run as a separate pass: the one concrete missing-index gap
identified (`refresh_sessions.user_id`) was fixed in Batch 2, and the query-timeout backstop
(`statement_timeout`) was fixed in Batch 1. No further index gaps were found on inspection of the
query patterns introduced by Batch 4's pagination work (`(sortColumn, id)` pairs already align with
each entity's existing primary-key/creation-order indexes) — adding speculative indexes with no
concrete slow-query evidence would be exactly the kind of overengineering this phase's own instructions
warn against.

## Batch 6 — Document security & Cloudinary

**MIME allowlist + magic-byte validation**: previously, upload validation trusted the client-supplied
`Content-Type` header alone — trivially spoofable (an attacker can label an `.exe` as
`application/pdf`). `upload-validation.ts` adds a small, hand-written signature table (PDF, JPEG, PNG,
WEBP, DOC/OLE, DOCX/zip — the document types this app's `DocumentType` enum actually needs, not a
general-purpose file-type-sniffing dependency) and rejects any upload whose first bytes don't match
its declared MIME type, in addition to rejecting any MIME type not on the configured allowlist.
Verified against genuine spoofing attempts (an EXE labeled as a PDF, HTML content with a `.pdf`
filename) as well as genuine files of every allowlisted type.

**Authenticated, signed delivery — not permanently public URLs**: uploads now use Cloudinary's
`type: 'authenticated'` (previously the default `type: 'upload'`, a permanently public,
unauthenticated URL) — a meaningful gap for what this app's own `DocumentType` enum identifies as
identity-adjacent personal documents (passport copies, transcripts). `GET /documents/:id/download-url`
is the only way to obtain a working URL now; it re-runs the same ownership check as every other
Document read before calling `CloudinaryService.getSignedDeliveryUrl()`, so a signed URL can never be
minted for a document the caller doesn't own.

**Honest scope on "signed" vs. "time-expiring"**: Cloudinary's true server-enforced URL expiry
(`auth_token`) requires a separate, opt-in account feature with its own secret key, distinct from the
standard `cloudName`/`apiKey`/`apiSecret` triple already configured — confirmed directly, not assumed:
calling `cloudinary.url(..., { auth_token: {...} })` without that key configured throws a `TypeError`
deep inside the SDK's `auth_token.js`, caught by a real (non-mocked) unit test exercising the actual
Cloudinary SDK. Shipping that unconditionally would trade a working feature for a broken one on any
account without the add-on enabled — not an acceptable trade for a production system. The shipped
`getSignedDeliveryUrl()` uses `sign_url: true` alone: a real, unguessable, HMAC-signed URL (the
signature is verified server-side by Cloudinary, and a client can never construct one from a
`publicId` alone), but not yet time-expiring. `expiresInSeconds` is still returned to the caller as
the *intended* validity window, communicated honestly as intent rather than a guarantee. Follow-up:
wire up `auth_token` once a Cloudinary account with that add-on is available to actually test against
— tracked here, not silently dropped.

**Cloudinary reconciliation — a compensating delete, not an outbox**: two distinct orphan risks exist
— (a) a Cloudinary delete fails after the DB row is already gone (pre-existing handling, unchanged:
logged for manual follow-up, the DB deletion is never rolled back to "compensate"), and (b) a
Cloudinary *upload* succeeds but the DB write recording it then fails (the transaction rolls back, or
`uploadNewVersion()`'s own concurrent-version-race check rejects it) — previously entirely unhandled,
a genuine gap this batch closes. Considered and rejected: a full transactional-outbox / background-
reconciliation worker (a table of pending Cloudinary operations, processed by a separate consumer) —
this app's Cloudinary usage is low-volume, user-initiated document uploads, not a high-throughput
event stream, and an orphaned asset here has no correctness or security impact (never referenced by
any DB row, never resolvable by `publicId` alone, never returned to any user) — the only cost is
storage. Implemented instead: `compensateFailedUpload()`, called from both `uploadNew()` and
`uploadNewVersion()`'s failure paths, immediately deletes the just-uploaded asset when the following DB
write fails, and — on the rare case that the compensating delete itself also fails — logs clearly for
manual cleanup, the same pattern already used for the delete-side orphan case. This closes the loop for
the overwhelming majority of real failures without any new infrastructure. If orphaned-asset
accumulation is ever observed to be a real operational problem (no evidence of that today), the
appropriate next step is a one-off admin script cross-referencing Cloudinary's Admin API asset listing
against `documents.cloudinary_public_id` — deliberately not built now, since building it without
operational evidence it's needed would be the overengineering this phase's own instructions warn
against.

**New column**: `documents.cloudinary_resource_type` (`varchar(32)`, nullable) — captures Cloudinary's
own `resource_type` ('image'/'raw'/'video') exactly as Cloudinary reported it at upload time, needed to
issue a correct signed-URL or delete call later (both require the exact resource type an asset was
actually stored under). Nullable only for rows written before this column existed; `resolveResourceType()`
falls back to inferring from `mimeType` for those. Migration (`DocumentCloudinaryResourceType`) run
against Neon DEVELOP — verified zero pre-existing `documents` rows before running, so no backfill was
needed.

## Batch 7 — Application soft-delete & account erasure

**Application soft-delete — narrow, not a blanket pattern**: `Application` gains a
`@DeleteDateColumn() deletedAt`; `DELETE /applications/:id` now calls `softDelete()`, not a hard
delete. Deliberately scoped to this one entity, not applied to `BaseEntity` or any other entity in the
domain model — Application is the one place an accidental/reconsidered deletion has real,
hard-to-reconstruct cost (a submission history worth preserving through a grace period: Requirements,
Tasks, Deadlines, attached Document versions, Track 1 Group D's point-in-time ApplicationSnapshots).
Everything else that supports delete stays hard-delete — shared catalog rows have no per-user "undo"
need, and Documents already have their own dedicated version-history model serving the same
"don't lose history" goal a different way. `ApplicationPurgeService` (hourly cron, same pattern as
`AuthCleanupService`) permanently removes a soft-deleted row once `applications.softDeleteRetentionDays`
has passed — a real eventual-cleanup path, not "hidden and considered solved."

**Phase 2 restore:** owner-only `POST /applications/:id/restore` clears `deletedAt` while the row
still exists. Cross-user restore → `404`; already-active → `409`; after purge → `404`. ADMIN does
not get a general restore-of-others capability. Children were never soft-deleted separately.
Query-builder-based reads (`findAllForUser()`'s keyset pagination) filter `deletedAt IS NULL`
explicitly — TypeORM's automatic soft-delete exclusion only covers `repository.find()`/`findOne()`,
not query-builder calls. Migration (`ApplicationSoftDelete`) run against Neon DEVELOP.

**Account erasure (`DELETE /users/me`) — why database cascade alone is not enough**: every entity a
User owns already cascades at the database level when the `users` row is deleted (every relevant FK is
already `onDelete: 'CASCADE'`), so a plain `usersRepository.delete(userId)` would genuinely remove
every database row. **It would not touch a single Cloudinary asset** — those live entirely outside
Postgres, and no database-level cascade can reach them. Relying on that alone would silently leave
every uploaded document (identity-adjacent files: passports, transcripts) live and
retrievable-by-signed-URL forever, with nothing left in the database to even know they exist. This is
the same category of gap Batch 6's Cloudinary reconciliation section addresses for individual document
deletes/uploads — account erasure needed its own explicit closing, not an assumption that Batch 6's fix
already covered it.

`AccountErasureService.eraseAccount()` — one transaction: (1) read the user's Document rows first
(id + Cloudinary identity, ordered `version DESC`), (2) delete every `ApplicationJourney` the user owns
(cascades away every Application and everything scoped to it, including `ApplicationDocument` — this
clears the `RESTRICT` constraint that would otherwise block step 3 for any *attached* document),
(3) delete the Document rows in the order read in step 1 (a document is always a higher version number
than the row it points to via `previousVersionId`, itself `RESTRICT` — Track 1 Group D, D-P2 —
so version-DESC order never tries to delete a row something else still references), (4) delete the
`User` row itself. Only after that transaction commits does the service attempt the Cloudinary
deletes — an external, non-transactional call, same DB-truth-first ordering principle used everywhere
else in this codebase. A per-document Cloudinary failure is logged and does not abort cleanup of the
rest (`Promise.allSettled`) — the account is already gone from the database regardless; an orphaned
asset here is a cleanup task, not a correctness problem, same reasoning as Batch 6's
`compensateFailedUpload()`.

Injected directly against `User`/`ApplicationJourney`/`Document` repositories and `CloudinaryService`
(not `JourneysService`/`DocumentsService`) to avoid a circular module dependency — the same pattern
already established throughout this codebase.

**Accepted, documented limitation — not a new gap**: the caller's already-issued access token remains
technically valid (unexpired, correctly signed) for the rest of its short lifetime after erasure —
this app's JWTs are stateless with no denylist, exactly the same tradeoff already accepted and
documented for password reset. In practice this has no meaningful blast radius: the user row is gone,
so every subsequent authenticated call either finds nothing or 404s.

## Batch 8 — Request/DTO resource limits

Audited every DTO in the codebase for unbounded input. Batch 1 already capped the whole request body
(256kb) — this batch closes the narrower, per-field gap that leaves: a single oversized field can
still consume that entire budget, and (more importantly for `text` columns with no DB-level length
constraint) nothing previously stopped a legitimate-shaped request from writing an arbitrarily long
string into `notes`/`description`/`goal`/`eligibilitySummary`/`extractedContent` repeatedly.

**Free-text fields** (`common/validators/text-limits.ts`, `FREE_TEXT_MAX_LENGTH = 10,000`,
`EXCERPT_MAX_LENGTH = 20,000` for `OpportunitySource.extractedContent` specifically, matching its own
"excerpt, not full page archive" documented scope): applied to every `@IsString()` field across Tasks,
Applications, Journeys, Deadlines, Requirements, OpportunitySources, Universities, Programmes,
Opportunities that previously had none. Centralized as shared constants (not a magic number per DTO)
— same reasoning as `password-policy.ts`'s `PASSWORD_MAX_LENGTH`: one considered value, changed once.

**Auth DTOs — a genuine, concrete gap**: `LoginDto.password` had NO length bound at all, unlike
`RegisterDto`/`ResetPasswordDto` (which already had `PASSWORD_MAX_LENGTH` + a bcrypt-72-byte-limit
check). A grossly oversized login payload would previously reach `LoginGuardService`/bcrypt
unchecked. Fixed with `@MaxLength(PASSWORD_MAX_LENGTH)` — deliberately NOT the bcrypt-byte-limit check
too: that check exists to warn a user, at *creation* time, that their password is ambiguous past 72
UTF-8 bytes; every password that could ever be validly stored already satisfies it, so re-checking at
login would only reject already-wrong credentials a moment earlier, closing no real gap. `LoginDto`/
`RegisterDto`/`ForgotPasswordDto`'s `email` fields gained `@MaxLength(255)` (`EMAIL_MAX_LENGTH`,
matching `User.email`'s column). `ResetPasswordDto.token` gained an exact `@Length(64, 64)` — a real
token is always `randomBytes(32).toString('hex')`, so any other length is definitely not a real one;
rejecting it here is a clean 400 instead of a wasted hash-and-lookup that was always going to fail,
the same precision `VerifyEmailDto` already applies to its 6-digit code.

**`UpdateProfileDto` — the array/object limits named explicitly in this batch's scope**: previously
`@IsArray()` alone, no `@ArrayMaxSize`, and each item an unvalidated `Record<string, unknown>`. Every
PATCH fully replaces the field (`ProfileService.update()`'s `Object.assign`, not an append), so a
single write's total byte size was already bounded by the 256kb request cap — but a request well
under that limit can still carry a pathological item count (tens of thousands of near-empty objects),
nonsensical for what these fields represent. Added `@ArrayMaxSize(50)` (education/experience/
certifications) / `@ArrayMaxSize(100)` (skills/languages — legitimately longer, simple-value lists),
plus `@MaxLength` on the scalar string fields (nationality/dateOfBirth/summary). The "deliberately
permissive on shape" design (each array item still an unvalidated object) is explicitly unchanged —
this batch bounds size, not shape.

**Deliberately left unbounded, and why — not an oversight**: `CreateOpportunityDto.metadata` and
`UpdateProfileDto.metadata` stay `@IsObject()` with no size/shape bound. `CreateOpportunityDto` is
ADMIN-gated (see "RBAC dependency: why shared catalog administration needed it now") — the abuse
surface a per-field cap exists to close (an arbitrary authenticated user writing unbounded data)
doesn't apply the same way to a caller who already holds elevated trust. Both `metadata` fields remain
covered by the global 256kb request cap regardless; a bespoke JSON-size validator for either would be
unjustified complexity with no concrete abuse case behind it.

## Batch 9 — Authorization hardening review

A systematic re-verification pass across the full authorization model — no new roles introduced (per
this phase's explicit instruction), and no code change resulted from this batch: every check below was
either already correct (confirmed by evidence, not assumed) or is noted as an accepted, reasoned
tradeoff rather than a gap.

**Guard registration and coverage, re-verified by direct inspection, not memory**: every controller's
`@Get`/`@Post`/`@Patch`/`@Delete` handler was grepped against its `@Public()`/`@Roles()` decorators.
Confirmed: (1) every catalog-mutation route (Universities/Programmes/Opportunities) carries
`@Roles(UserRole.ADMIN)`; (2) every genuinely-public route (`/health`, `/health/ready`, `/auth/register`,
`/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`) is
marked `@Public()` and nothing else is; (3) `/auth/verify-email` and `/auth/resend-verification` are
deliberately NOT `@Public()` (already documented — acts on the caller's own account only); (4) no
`@Public()` route also carries `@Roles()` (would be contradictory — none exists); (5) no controller
anywhere injects a `Repository`/`@InjectRepository` directly — every data access goes through a service,
so an ownership check can never be routed around at the controller layer.

**Guard ordering (`JwtAuthGuard` → `RolesGuard` → `ProductionThrottlerGuard`, `app.module.ts`) —
re-confirmed correct, one edge case documented rather than "fixed"**: an unauthenticated flood of
requests carrying no/invalid tokens against a *protected* route never reaches
`ProductionThrottlerGuard` (JwtAuthGuard rejects first) — so the generic per-IP throttle doesn't count
those attempts. This is not a new gap introduced by this hardening pass (the ordering predates it) and
is not being changed: rejecting an invalid JWT is a cheap, stateless HMAC-verify with no DB round-trip,
so a flood shaped this way is a raw-request-volume/infrastructure-layer concern (reverse proxy/CDN/WAF),
not an application-layer abuse pattern this guard chain exists to close. The two things that *do* need
in-app throttling — credential-guessing against public auth endpoints, and any authenticated
route being hammered by a legitimate token — both correctly reach the throttler (public routes because
`JwtAuthGuard`/`RolesGuard` are no-ops for them; authenticated routes because the token is valid).

**Cross-entity ownership checks, spot-verified, not assumed**: every service accepting a foreign key to
another owned entity in its create/update DTO (Task → journeyId/applicationId/dependsOnTaskId,
Requirement/Deadline → applicationId, Deadline → taskId/requirementId) independently re-verifies
ownership of that referenced entity via the owning service's own `findOwnedOrThrow`/
`assertApplicationOwnedByUser` — confirmed by direct inspection of every `create()`/`update()` method,
not re-derived from memory of Track 1 Group C's original work. No entity accepts a foreign key from the
client without an ownership check on the referenced row.

**Interaction with Batch 7's Application soft-delete — a genuinely new question this review had to
answer**: does a soft-deleted (but not yet purged) Application still 404 correctly for every downstream
ownership check that resolves through it (`RequirementsService`/`TasksService`/`DeadlinesService`
calling `ApplicationsService.findOwnedOrThrow`/`assertApplicationOwnedByUser`)? Yes, by construction:
`findWithJourneyOrThrow()` uses `repository.findOne()`, and TypeORM's `@DeleteDateColumn` automatically
excludes a soft-deleted row from `findOne()`/`find()` (not just from the paginated query-builder path,
which Batch 7 already filters explicitly) — so a soft-deleted Application's id resolves to "not found"
for every caller, exactly as if it were hard-deleted, with no extra code needed. This is a standard,
well-established TypeORM behavior, not an edge case — confirmed by design/framework documentation here;
empirical confirmation against a real, fully-migrated local Postgres database is planned as part of
Batch 12's DB integration test suite (not deferred without a concrete next step — see that batch).

**Privilege escalation** — re-confirmed via the existing `privilege-escalation.spec.ts` suite (Track 1):
`UsersService.update()`'s explicit field allowlist still means `role` can never be set through any
client-reachable path; no DTO added or modified during this hardening pass (Batches 1-8) introduces a
`role` field anywhere.

**Considered and deliberately not implemented — step-up re-authentication for destructive actions**:
`DELETE /users/me` (Batch 7) and other irreversible mutations are gated only by possessing a valid,
unexpired access token — the same authorization bar as every other authenticated action in this API.
An attacker who already holds a stolen/leaked access token could already read, modify, or delete
anything that token's owner can, one call at a time; account erasure is a higher-consequence action but
not a *new* category of risk on top of that existing threat model. Requiring fresh re-authentication
(a password re-prompt, a recent-login check) before a destructive action is a real, legitimate pattern,
but it's a new mechanism this codebase doesn't have anywhere today — introducing one for exactly one
endpoint, with no broader policy for which actions would need it, would be scope creep unjustified by a
concrete incident or requirement. Noted here as a reviewed, deliberately-deferred enhancement, not a
production gap: the risk it would close is already fully present (and already accepted) everywhere else
in this API's authorization model.

## Batch 10 — Observability & security headers

**Security response headers**: `helmet()` (new dependency, `helmet@8.3.0`) applied globally in
`bootstrap.ts`, default config, unmodified — this is a pure JSON API (no HTML ever served), so
helmet's default Content-Security-Policy (meaningful for HTML-serving apps) has nothing to protect
here; the value is in the other headers (`X-Content-Type-Options`, `X-Frame-Options`,
`Strict-Transport-Security`, `Referrer-Policy`, `Cross-Origin-Opener-Policy`, etc.), which apply the
same way regardless. Verified live: booted the app and confirmed every expected header present on a
real response.

**JWT algorithm pinning**: neither the signing side (`AuthService.issueTokens()`) nor the verification
side (`JwtStrategy`'s `passport-jwt` config) previously pinned an explicit algorithm — signing
happened to default to HS256 (jsonwebtoken's own default) and verification would infer the algorithm
from the token's own header rather than requiring a specific one. This is the precondition for the
classic JWT "alg confusion" vulnerability class. Fixed: `algorithm: 'HS256'` on the sign call,
`algorithms: ['HS256']` on `JwtStrategy`'s `passport-jwt` options — both explicit and matching, closing
the gap outright rather than relying on library defaults staying safe. Verified via `strategy.
_verifOpts.algorithms` (passport-jwt's actual internal field) and `jwtService.signAsync`'s call
arguments in tests, not just that the code compiles.

**Correlated structured logging**: previously, log lines from concurrent requests (or across
instances) had no way to be grouped together, and Nest's default logger produces colorized text
meant for a terminal, not JSON a log aggregation platform can index. Added `RequestIdMiddleware`
(reuses a well-formed upstream `X-Request-Id` header when a reverse proxy/gateway already set one,
generates a fresh `crypto.randomUUID()` otherwise; a malformed/oversized incoming header is never
trusted or echoed back — no log-injection surface via a crafted header), storing the id in Node's
built-in `AsyncLocalStorage` (`request-context.ts`) for the request's lifetime and echoing it on the
response. `StructuredLoggerService` (passed to `NestFactory.create()`, overriding Nest's logger
app-wide with zero per-call-site changes — every existing `new Logger(ClassName.name)` call already in
this codebase picks it up automatically) reads that id into every log line. Structured JSON output is
production-only; development/test keeps delegating to Nest's own `ConsoleLogger` (colorized,
human-readable) with the request id appended to the context — deliberately not trading away local
dev-log readability for machine-parseability nobody needs on a laptop. `AllExceptionsFilter`'s
response body also now carries the same `requestId`, so a client-reported failure can be matched
directly to server logs.

**A real bug this batch's own live verification caught**: booted the app with `NODE_ENV=production`
(deliberately triggering a genuine, pre-existing, already-documented startup fail-fast —
`EmailService`'s missing-SMTP-in-production check) specifically to see the structured-JSON error path
fire for real, not just in a unit test. It did — but the error line showed `"message":{}`: Nest's own
internal exception handler calls `logger.error(exception)` with a single argument, and that error
object didn't satisfy a strict `instanceof Error` check from this module's perspective (a framework
internal/module-boundary effect), and `JSON.stringify` silently drops a real `Error`'s own
`message`/`stack` (non-enumerable by spec) whenever that check misses. Fixed by extracting
`message`/`stack` via duck-typing (property presence, not `instanceof`) instead — re-verified live
against the same real startup failure, which now logs a fully readable message and stack. A dedicated
regression test (an error-shaped plain object that deliberately fails `instanceof Error`) covers this
going forward. Neither the missing-SMTP fail-fast itself nor the placeholder-JWT-secret fail-fast that
fired on a second live run are new — both are pre-existing, correct, already-documented production
safeguards (Batch 1/E1) triggered by this sandbox's own `.env` not being production-configured, not
regressions from this batch.

## Batch 11 — Email reliability review

Reviewed `EmailService`/`SmtpEmailProvider`/every call site (register, resend-verification,
forgot-password) against production email-reliability concerns. Most of the reliability posture was
already sound and needed no change: each call site already applies its own deliberately-differentiated
failure policy (register — best-effort, swallowed; resend-verification — surfaced as a clear 503, since
the user is actively waiting; forgot-password — swallowed, to avoid a response-shape oracle revealing
whether an account exists), and the production/no-SMTP-configured fail-fast-at-startup check already
existed. Two genuine gaps found and closed:

**Unbounded SMTP timeouts on a request-blocking path**: `createTransport()` had no explicit
`connectionTimeout`/`greetingTimeout`/`socketTimeout` — nodemailer's own SMTP transport defaults to
roughly 2 minutes per phase. Three routes (`/auth/register`, `/auth/resend-verification`, and
`/auth/forgot-password` — the last one `@Public()`) `await` an email send directly in the HTTP request
path. An unresponsive SMTP server could previously hold one of those requests open for minutes — a
genuine availability concern, not just a slow-response annoyance. Fixed with explicit, bounded timeouts
(10s connection, 10s greeting, 15s socket) — generous enough for any real SMTP provider (SES, SendGrid,
Postmark, Mailgun, a corporate relay) under normal conditions, bounded enough that a truly unresponsive
server fails predictably instead of hanging.

**No retry on transient failures**: a single SMTP hiccup (a momentary connection blip, a temporary/4xx
rejection under brief provider-side load) previously failed the send outright — for
`resend-verification` specifically, that meant surfacing a 503 to the user on the very first transient
blip. `SmtpEmailProvider.send()` now retries exactly once, after a short fixed delay (500ms), before
giving up. Deliberately simple: this is a low-volume, transactional (auth-related) mail path, not a
bulk sender, so one unconditional retry — rather than classifying errors into retryable/non-retryable
— is cheap, safe (bounded to 2 total attempts, never unbounded), and sufficient; building an
error-classification scheme for marginal additional benefit would be unjustified complexity for this
batch's own instructions to avoid. The retry delay is constructor-overridable (used only by tests, to
avoid real wall-clock cost in the suite) — production always uses the real 500ms default.

No change to provider selection, the SMTP-vs-vendor-SDK architecture, or any of the existing
per-route failure-handling policies — all confirmed already correct on review.

## Batch 12 — DB integration test infrastructure

A new, distinct test layer (`test/db-integration/*.db-integration-spec.ts`, `yarn test:db-integration`,
its own `test/jest-db-integration.json` — never picked up by plain `yarn test`, confirmed) exercising
real Postgres — constraints, cascades, and ORM behaviors a mocked-repository unit test cannot actually
prove, only assume. Complements the existing unit-test suite; doesn't replace it.

**Hardcoded to local Postgres, never derived from `.env`** (`test/db-integration/test-data-source.ts`)
— the one safety property this whole layer depends on. This surfaced a real, pre-existing gap in the
project's OTHER, older e2e harness (`test/jest-e2e.json` / `test/setup-env.ts`, from the original
foundation build): that harness only overrides `POSTGRES_DB` and inherits host/user/password/ssl from
`.env` — and `.env` in this repo currently points at Neon. On a machine in that state, `yarn test:e2e`
would attempt to run destructive integration tests against a database on the Neon project itself
(`scholarship_os_test`, which doesn't even exist there), not local Postgres. This is very likely
*exactly why* this project's standing instructions say never to run `yarn test:e2e` — discovered here,
not assumed. Per that same standing instruction, `test/*.e2e-spec.ts`/`jest-e2e.json`/`setup-env.ts`
were left untouched (not modified, not invoked) this session; fixing that harness's own connection
config is flagged here as a concrete, scoped follow-up (point `setup-env.ts` at the same hardcoded
local values `test-data-source.ts` uses) rather than silently left as an unexplained ban.

**Isolation**: one shared `DataSource` per spec file; every individual test runs inside its own
transaction, always rolled back in `afterEach` regardless of pass/fail — the standard fast, reliable
DB-integration pattern. Verified directly (not assumed): queried `scholarship_os_test`'s tables after a
full suite run and confirmed zero residual rows.

**Local test/dev databases brought current**: `scholarship_os_test` and `scholarship_os_dev` (both
local Postgres 16, pre-existing from the original foundation build but stuck at the very first
migration) were migrated to the full current schema (all 10 migrations) — required for this batch's
tests to run at all, and leaves both databases usable for any future local work.

**Initial coverage** (`constraints.db-integration-spec.ts`) targets exactly the things only a real
database can prove: `users.email` UNIQUE index rejecting a duplicate (not just the app-level
pre-check); `Requirement`'s CHECK constraint rejecting a row with both `opportunityId`/`applicationId`
null even when the service-layer guard is bypassed entirely; `Document.previousVersionId` RESTRICT
genuinely blocking deletion of a version another version depends on; `ApplicationDocument.documentId`
RESTRICT genuinely blocking deletion of an attached Document; `ApplicationDocument`'s
`unique(applicationId, documentId)` rejecting a duplicate attach; the Journey→Application (and
User→Journey→Application) cascade graph `AccountErasureService`/`ApplicationPurgeService` assume;
and — closing Batch 9's own forward pointer — empirical proof that TypeORM's `@DeleteDateColumn`
really does exclude a soft-deleted `Application` from `findOne()`/`find()` by default (the property
every downstream ownership check depends on), that `withDeleted: true` still finds it, and that the
row is genuinely still present (a real `UPDATE`, not a `DELETE`) via a raw SQL check. All 12 tests
pass against real local Postgres.

## Batch 13 — HTTP/API integration test infrastructure

A third, distinct test layer (`test/http-integration/*.http-integration-spec.ts`, `yarn
test:http-integration`, its own `test/jest-http-integration.json`) — real HTTP requests (`supertest`)
through the REAL guard chain, global pipes/interceptors/filters, and controller→service→repository
stack, against real local Postgres (`scholarship_os_test`). Complements the unit-test suite and Batch
12's DB integration layer; proves the pieces work TOGETHER over an actual request, which neither of
those layers can see (real response headers, the real cookie a browser would receive, real global
`ValidationPipe` rejection, real end-to-end persistence-then-retrieval).

**A deliberate, scoped exception to this codebase's "never `Test.createTestingModule()`" unit-test
convention** (`test/http-integration/test-app.ts`): HTTP integration testing's entire point is
exercising the full, real DI graph and guard chain (`JwtAuthGuard` → `RolesGuard` →
`ProductionThrottlerGuard`) together — a hand-assembled subset would just be testing a second,
different pipeline from production's. Boots the real `AppModule` through the real `configureApp()`
(the exact function `main.ts` calls), not a reimplementation.

**Hardcoded to local Postgres** (`test/http-integration/setup-env.ts`), same property as Batch 12's DB
integration layer, and for the same reason: `.env` points at Neon in this repo, and this project's
OTHER, older e2e harness (`test/jest-e2e.json`) doesn't have this property (see "Batch 12"). This
layer sets every relevant `POSTGRES_*` variable explicitly (not just `POSTGRES_DB`), plus a test-only
`JWT_ACCESS_SECRET` and fast bcrypt rounds; Redis/Cloudinary/SMTP are left deliberately unconfigured
(their already-established graceful-degradation paths — in-memory rate-limit fallback, no document
upload flows in this layer, dev-log email transport — apply the same way any real environment missing
them would see).

**Cleanup**: unlike Batch 12's transaction-per-test rollback (not usable here — HTTP requests go
through the app's own connection pool, not a test-controlled `QueryRunner`), each spec file uses a
unique-per-run email/name prefix and deletes exactly its own rows in `afterAll` (cascades handle
everything else the deleted users own) — never a blanket `TRUNCATE`, since this database can be shared
with a concurrent `test:db-integration` run or a developer's own manual poking.

**Coverage**: a full session lifecycle (register → real bcrypt-verified login, including a wrong-
password 401 → authenticated `GET /me` → refresh rotation via the real cookie → logout → a
now-revoked-cookie refresh correctly failing against real DB-backed session state, not an in-memory
mock) — plus security headers/request-id presence and a real global-`ValidationPipe` rejection of an
unknown field; and RBAC + pagination (`RolesGuard` genuinely rejecting a non-ADMIN with 403, a real
ADMIN succeeding, unauthenticated correctly 401ing before `RolesGuard` even runs, GET staying open to
any authenticated user) plus real keyset pagination — a full cursor-chain walk across freshly-inserted
Postgres rows confirming no duplicate or skipped row, and a malformed cursor cleanly 400ing rather than
500ing. 17 tests, all passing, verified stable across a cold-cache re-run (not just once).

**A real bug this batch's own iteration caught (in the test, not production code)**: an early version
asserted a refresh's new access token must differ from the login's — failed on a real run, because both
happened within the same second and JWT claims (`iat`/`exp`) are second-granularity, so a byte-identical
token is correct, expected behavior, not a security flaw. Fixed the assertion (kept the real security
property — the refresh COOKIE/session identity must differ — which is what refresh-rotation actually
guarantees) rather than the code. A separate, now-resolved transient issue during iteration (an early
buggy assertion left a header set to `undefined`, which synchronously threw inside supertest and left
`afterAll` hanging past its timeout) resolved itself once the underlying assertion bug was fixed —
confirmed via a cold-cache re-run, not just written off as a fluke.

## Batch 14 — Concurrency testing

A fourth test layer (`test/concurrency/*.concurrency-spec.ts`, `yarn test:concurrency`) firing
genuinely simultaneous requests — `Promise.allSettled()` over multiple calls into the REAL service,
each opening its own real transaction/connection against real local Postgres — at the two write paths
in this codebase whose correctness depends on a real database lock or constraint actually holding
under real contention, not just on the application code calling things in the right order. This is a
different claim than what a sequential unit test (e.g. `documents.service.spec.ts`'s "a version chain
still works correctly after a rejected concurrent attempt", which calls `uploadNewVersion()` twice in
sequence) can prove: sequential calls against a mocked repository can never actually exercise a real
row lock blocking a second, truly-concurrent transaction — they can only prove the code path's logic is
correct assuming serialization already happened somehow.

**Document version upload race** (Track 1 Group D's `SELECT ... FOR UPDATE` pessimistic lock in
`DocumentsService.uploadNewVersion()`): real `DocumentsService` bound to real repositories from a real
DataSource (only `CloudinaryService` stubbed — no real network call, per this project's standing rule).
Fired 2 and then 3 genuinely concurrent `uploadNewVersion()` calls against the same starting version;
confirmed exactly one ever succeeds, the rest cleanly reject with `ConflictException`, and — checked
directly against the database, not just the returned values — no duplicate-numbered sibling versions
are ever created and exactly one row ends up `is_current = true`, even under 3-way contention.

**Attach-document race** (`ApplicationDocumentsService.attach()`'s documented "the unique constraint
alone closes the race" design): fired 5 genuinely concurrent `attach()` calls for the identical
`(applicationId, documentId)` pair; confirmed exactly one succeeds, the other 4 cleanly reject with
`ConflictException` (the constraint-name-matched translation, not a raw 500), and the database has
exactly one row for that pair afterward.

**A real bug this batch's own test cleanup caught (in the test, not production code)**: an early
version of the attach-race test's `afterAll` issued a plain `DELETE FROM users`, which failed —
`ApplicationDocument.documentId`'s `RESTRICT` constraint blocked the cascade from reaching Documents
while an ApplicationDocument row (reachable only via a separate Journey→Application cascade path)
still referenced one. This is a live, concrete re-confirmation of exactly the reasoning
`AccountErasureService` (Batch 7) was built around — deletion order through this schema's RESTRICT
edges genuinely matters, not just in theory. Fixed the same way: delete Journeys (cascading away
Applications and their ApplicationDocuments) before deleting Users.

## Batch 15 — Load testing

`autocannon` (installed as a dev dependency — no CLI-only tool needed) driving real HTTP load against
the real app (`yarn load-test`, `test/load/run-load-test.ts`) — same hardcoded-local-Postgres safety
property as every other new test layer this phase added (`scholarship_os_test`, never Neon).

**Honest scope, stated up front (and in the script's own doc comment)**: this sandbox is one machine
running both the load generator and the app/DB, and every request arrives from a single source IP.
This measures single-instance, single-machine request-handling latency and this app's own rate-limiter
behavior under load — it does NOT measure multi-instance horizontal scaling, real network latency, or
genuinely distributed multi-client load. See the final report's Load-Test Results section for the full,
explicit statement of what these numbers do and don't prove.

**A real correction this load test itself produced**: the script's first doc comment draft assumed
this app's default rate limiter (100 requests/60s per IP, Batch 3) was a single budget shared across
every unthrottled route. The actual measured results disproved that: `/health` and `/health/ready` each
completed their own full request batch with zero rejections, and `/universities` (a separate handler)
hit its own 100-request ceiling on its own batch, completely unaffected by the ~80 requests already
made against the other two endpoints moments earlier. The real behavior is a budget tracked **per
handler** (controller+route+IP), not pooled globally — corrected in the code comment and here rather
than left as a plausible-sounding but wrong assumption. This is exactly the kind of thing load testing
is supposed to surface, not something a unit test could have caught.

**Results** (single run, this sandbox, local Postgres — see the final report for the full numbered
table):
- `GET /health` (no DB): 50/50 requests succeeded, p50 1ms / p90 4ms / p99 7ms, 0 errors/timeouts.
- `GET /health/ready` (real `SELECT 1` DB round trip): 30/30 succeeded, p50 0ms / p90 8ms / p99 14ms,
  0 errors/timeouts.
- `GET /universities` (authenticated, real keyset-paginated DB query, deliberately driven past its
  100-req/60s budget with 150 requests): 100/150 succeeded (2xx), 50/150 correctly rejected (4xx/429),
  **0 errors, 0 timeouts, 0 5xx** — the app degraded exactly as designed under load exceeding its
  configured budget: no crashes, no unhandled errors, clean 429 responses, and the successful subset
  maintained good latency (p50 4ms, p90 14ms, p99 37ms) even while a third of requests were being
  rejected concurrently.

No code change resulted from this batch — every observed behavior (latency, graceful 429 degradation,
per-handler throttle scoping) was already correct; this batch's job was measuring and documenting it
honestly, not fixing anything it found broken.

## Batch 16 — Failure/recovery testing

A fifth test layer (`test/failure-recovery/*.failure-spec.ts`, `yarn test:failure-recovery`) —
genuine PostgreSQL/Redis/SMTP outages (real unreachable targets, not mocked rejections), proving this
app degrades correctly rather than hanging, crashing, or silently misbehaving. Cloudinary is the one
dependency NOT exercised this way — see below for why, and what covers it instead.

**PostgreSQL outage (at startup)**: two real scenarios — an immediately-refusing port, and a
non-routable address (RFC 5737 TEST-NET, simulating a genuine network black hole rather than a fast
refusal). **A real, previously-undocumented characteristic this test run itself surfaced**:
`TypeOrmModule` has its own built-in retry loop around `DataSource.initialize()` (`typeorm.config.ts`
sets neither `retryAttempts` nor `retryDelay`, so it uses Nest's default — 10 attempts, ~3-8s apart
depending on how long each attempt itself takes to fail). A genuinely bad DB connection therefore takes
roughly 30-100 seconds to surface as a startup failure, not instantly. Confirmed as the right default to
keep, not a bug: it's exactly the tolerance a real deployment needs for a DB-container/orchestrator
startup-order race, and `connectionTimeoutMillis` (5s default, Batch 1) is confirmed to genuinely bound
each individual attempt — the whole sequence finishes in under 100s rather than hanging for the OS's
much longer (60-130+s per attempt) black-hole TCP timeout, which would make 10 retries take 10-20+
minutes if that config weren't actually being honored. **Mid-flight** (an already-running app losing DB
connectivity) was deliberately NOT simulated by stopping/revoking privileges on the actual shared local
Postgres server other test layers depend on — too invasive for what this checkpoint needs; `GET
/health/ready`'s real 503-on-failure behavior (already covered) is exactly the mechanism a production
orchestrator uses to detect and route around that scenario.

**Redis outage (real, unreachable target)**: app boots successfully despite Redis being genuinely
unreachable (not just unconfigured); an ordinary route stays available (fail-open, Batch 3); a
`@StrictRateLimit()` route (register) correctly returns 503 rather than silently going unthrottled
(fail-closed, Batch 3) — now confirmed end-to-end over real HTTP requests against a real failed
connection, not just at the guard-unit level.

**A real, concrete bug this test layer's own execution caught and fixed — not a test artifact**:
running the Redis-outage scenario left the Node process alive past `app.close()`/`enableShutdownHooks()`
(Batch 1) — `RedisModule`'s ioredis client was never disposed on module shutdown, so its connection (and,
since Redis was unreachable, its own bounded reconnect retry loop) kept running. In a real container/
orchestrator deployment this means the process wouldn't exit cleanly on SIGTERM and would need
SIGKILL after the grace period expired — a real, if minor, operational gap, not merely a test-harness
nuisance. Fixed with a new `RedisLifecycleService implements OnModuleDestroy` (`redis.module.ts`),
calling `client.disconnect()` (not `.quit()` — `quit()` assumes a working connection to send its
command over; `disconnect()` immediately tears down the socket and retry strategy regardless of
reachability) — verified both by a direct unit test and by re-running the same real Redis-outage
scenario, which now completes and exits within the run instead of requiring a manual kill.

**SMTP outage (real, unreachable target)**: registration still succeeds (Batch 11's already-established
best-effort policy) despite SMTP being completely unreachable, and completes within a bounded time
(Batch 11's connection timeout + single retry cap the worst case well under nodemailer's own
~2-minute default). A second scenario (resend-verification's differently-surfaced 503 policy under a
real outage) proved flaky in this specific harness — traced to `jest --runInBand` running every
`*.failure-spec.ts` file in one shared Node process, where an orphaned background timer from an
earlier file's deliberately-broken client observably interleaved with a later file's request handling
— a harness limitation, not a finding about the application. That investigation surfaced a genuine,
separate gap, though: **neither of `AuthController`'s two documented, differentiated email-failure
policies (resend-verification surfaces 503; forgot-password swallows the failure) had any direct unit
coverage at all** — closed with a new `auth.controller.spec.ts` (4 tests, direct construction, this
codebase's established convention) rather than left silently uncovered or reported as an unverified
"production gap" from the flaky harness result.

**Cloudinary outage — deliberately not simulated, and why**: unlike Postgres/Redis/SMTP, Cloudinary's
API endpoint (`api.cloudinary.com`) can't be pointed at a controllable local target — the SDK doesn't
expose a configurable host, and this project has no real Cloudinary credentials to test against (and
wouldn't use production ones for a deliberate outage drill regardless). Real-outage simulation for this
one dependency was assessed as out of reach for this checkpoint, not silently skipped: its
orphan-handling and compensating-delete logic (Batch 6/7) is instead verified through realistic mocked
failures (`cloudinaryService.deleteByPublicId.mockRejectedValueOnce(...)`, etc.) — the correctness of
that logic doesn't depend on which specific mechanism produced the failure, only on the application
correctly handling *a* failure when it happens, which the existing mocked coverage does prove.

## Batch 17 — Production config/deployment review + backup/recovery documentation

**Config review**: `sample.env` confirmed complete and current against every environment variable
introduced through this entire hardening pass (Batches 1-11 — pool sizing, Redis, auth artifact
retention, login lockout, pagination, document limits, application soft-delete retention; Batches
12-16 introduced no new *application* config — their hardcoded-local-Postgres test infrastructure is
deliberately separate from `.env`/`sample.env`, see "Batch 12"). No gap found or closed here — this
batch's job was confirming that, not assuming it.

**New `docs/deployment.md`** — required-vs-optional production config (with the actual fail-fast
behaviors named, not just "see the code"), startup-behavior expectations an operator needs (the
~30-100s DB-retry characteristic from Batch 16, the liveness/readiness split from Batch 1, graceful
shutdown), scaling guidance (connection pool sizing formula, Redis's role once horizontal), backup/
recovery responsibility split (Neon's managed PITR/branching is infrastructure-level and explicitly
NOT reimplemented or claimed to be verified by this application; this codebase's own responsibility —
reversible migrations, confirmed by direct inspection that every one of the 10 migrations to date has
a working `down()` and none contains a data-mutating `UPDATE` — plus what's deliberately NOT durable
state: seed data, purge-job-eligible rows, Cloudinary's own durability for stored assets), and a
concise deployment runbook (migrate-before-deploy, readiness-gated traffic cutover, rollback
guidance).

**`docs/development.md`'s Testing section rewritten** to list all seven test layers this hardening
pass built (unit, DB integration, HTTP integration, concurrency, failure-recovery, load, plus the
pre-existing e2e layer) with an explicit, prominent warning not to run `test:e2e` against this repo's
current `.env` (which points at Neon) — the same finding from Batch 12, now surfaced where a developer
actually encountering `test:e2e` in the command list would see it, not buried only in `decisions.md`.

No production code change resulted from this batch — it is a documentation consolidation, confirming
what Batches 1-16 already built is correctly and completely reflected in the docs an operator or new
contributor would actually read.

## Batch 18 — Final scalability review

A systematic 10×/100× growth and N-instance review across every table and cross-cutting mechanism,
not a re-audit of things already covered by earlier batches. One concrete, real gap found and fixed;
everything else confirmed already correctly scoped, with reasoning recorded here rather than just
asserted.

**Found and fixed — missing indexes on the actual keyset-pagination query shape for shared, unscoped
catalog tables**: `UniversitiesService`/`ProgrammesService`/`OpportunitiesService`'s default (no
filter) keyset pagination sorts on `(name, id)` / `(name, id)` / `(createdAt, id)` respectively — none
of the three tables had any index on those columns (confirmed by direct inspection of the live schema,
`\d <table>`), meaning every unfiltered catalog browse would force a full-table sort once these tables
grow past what fits comfortably in a sort buffer. Added a composite `(sortColumn, id)` btree index to
each (`University`/`Programme`/`Opportunity` entities, migration
`ScalabilityReviewCompositeIndexes`, run against Neon DEVELOP and both local databases) — the
textbook-correct index shape for `common/pagination/cursor.ts`'s exact `WHERE (col > :cursor) OR (col
= :cursor AND id > :cursorId) ORDER BY col, id` query, not a speculative addition. `id` alone already
has the primary key's own index, which cannot serve a query ordered by `name`/`createdAt` first — this
is genuinely new coverage, not a duplicate. Deliberately does NOT help `?search=` on Universities
(`ILIKE '%term%'`, a leading wildcard no plain btree can accelerate — already acknowledged in that
method's own comment); a trigram (`pg_trgm`) index would be the correct fix for that specific query
shape but was assessed as premature without concrete evidence search performance is an actual
bottleneck — not added, this session's own instructions against unjustified infrastructure weighed
directly.

**Reviewed, confirmed already correctly scoped — no change needed**:
- **Every owner-scoped table** (Documents, Applications, Tasks, Deadlines, Requirements, Journeys,
  RefreshSessions) — each query is bounded by an already-indexed `owner_id`/`journey_id`/`user_id` FK
  to one user's own, naturally small row set, regardless of total platform size. 10×/100× *user*
  growth doesn't change any single query's cost here — only 10×/100× growth in one individual user's
  *own* row count would, and that's not a realistic scenario this domain model produces (a person's
  own applications/documents/tasks stay bounded by their own activity, not by the platform's total
  user count).
- **`OpportunitySource`** — sorted by `(capturedAt, id)`, unindexed beyond its `opportunity_id` FK.
  Left as-is: every real access pattern scopes by one Opportunity's own sources (a handful of
  citations per scholarship, not a platform-wide collection) — no endpoint browses sources
  unscoped across every opportunity, so this table's growth tracks Opportunity count linearly but
  each individual query's cost doesn't.
- **Auth artifact tables** (`refresh_sessions`, `email_verification_otps`, `password_reset_tokens`) —
  `AuthCleanupService`'s hourly purge (Batch 2) already bounds their steady-state size independent of
  platform growth; already-indexed `user_id` (Batch 2) covers the per-user lookups that matter.
- **N-instance cron duplication** — `AuthCleanupService`/`ApplicationPurgeService`'s `@Cron()` jobs
  have no distributed lock/leader election, so at N>1 instances every instance fires its own copy of
  each job every hour. Confirmed safe, not merely assumed: each job is a stateless, idempotent
  `DELETE ... WHERE <eligibility condition>` (see `AuthCleanupService`'s own doc comment) — a second
  concurrent instance's identical query simply finds nothing left to delete. The only cost is N
  redundant cheap queries per hour instead of one; adding a distributed lock (a new Redis-based
  coordination primitive) to eliminate that redundancy was assessed as unjustified complexity for a
  cost this small at any realistic instance count.
- **Redis-backed mechanisms at scale** (rate limiting, login lockout) — the atomic Lua `INCR`+
  block-check script (Batch 3) is O(1) per request regardless of platform size or instance count; no
  scaling concern.
- **Horizontal scaling (N instances)** — the app is stateless where it needs to be: JWT access tokens
  validate without any server-side lookup (any instance can validate any token); refresh sessions are
  Postgres-backed, not instance-local (any instance can service a refresh); correlation ids (Batch 10)
  are generated per-request with no shared state. The one genuine N-instance requirement is
  `REDIS_URL` for correctly *coordinated* (not just individually-correct) rate limiting/login lockout
  — already documented as a hard requirement above one instance (`deployment.md`), not newly
  discovered here.
- **Connection pool ceiling** — `(instances × DB_POOL_MAX)` against the provider's connection limit is
  a deployment-time sizing decision, not an application-code gap; documented with the actual formula
  in `deployment.md` rather than left implicit.

No other schema, query, or architectural change resulted from this review. The one gap found (missing
catalog indexes) is now closed and verified: full unit suite (438 tests), DB integration suite (12
tests, re-run against the now-changed local schema), build, and lint all pass with no regression.

## Final verification pass

A skeptical, evidence-based re-audit of the completed 18-batch hardening work — explicitly not
trusting the final report's own claims, verifying each against the actual repository and real test
runs. Found and fixed four genuine issues; confirmed the rest of the report's claims hold under direct
re-verification.

### Fixed: legacy E2E harness was genuinely unsafe (Phase 1)

`test/setup-env.ts` (used by `test/*.e2e-spec.ts`) previously overrode only `POSTGRES_DB`, inheriting
host/user/password/ssl from `.env` — which points at Neon in this repo. Rewritten to hardcode local
Postgres explicitly, identically to the five newer test layers (`localhost`, `scholarship_os`,
`scholarship_os_test`, `ssl: false`) — never derived from `.env` under any circumstance. Both
`test/*.e2e-spec.ts` files un-skipped and rewritten to reuse `bootstrapTestApp()`/`cleanupTestUsers()`/
`extractCookie()` from `test/http-integration/test-app.ts` (the same already-audited safe bootstrap
path) instead of re-implementing app construction.

**Verified empirically, not just by code inspection**: queried Neon DEVELOP's `users` table before
(`count = 1`) and after (`count = 1`, unchanged) running `yarn test:e2e`; confirmed local
`scholarship_os_test` received and then correctly cleaned up every e2e-created row (`count = 0`
afterward). `yarn test:e2e` now runs 10/10 tests passing in ~2-3 seconds, safely, regardless of what
`.env` points at.

### Found and fixed: three DTO fields escaped the Batch 8 `MaxLength` sweep

`PaginationQueryDto.cursor` (shared by all ten paginated list endpoints), `ListUniversitiesQueryDto.
search`, and `ListOpportunitiesQueryDto.country` had no `@MaxLength` — the only client-controllable
string fields in the entire codebase without one, missed because Batch 8's sweep targeted request-body
DTOs and these are query-parameter DTOs. Fixed with two new shared constants
(`CURSOR_MAX_LENGTH = 2048`, `SHORT_TEXT_MAX_LENGTH = 255`, matching the `varchar(255)` columns they
filter against) in `text-limits.ts`. `cursor`'s fix lives on the shared `PaginationQueryDto` base
class, closing the gap for all ten endpoints in one change. 7 new regression tests, all passing,
proven against real `class-validator` `validate()` calls.

### Found and fixed: a real, latent `reflect-metadata` fragility bug

Writing the three regression tests above (the first tests in this codebase's history to directly
`plainToInstance`/`validate()` `PaginationQueryDto`, which uses `class-transformer`'s `@Type()`)
surfaced `TypeError: Reflect.getMetadata is not a function`. `reflect-metadata` — required by every
decorator-heavy piece of this codebase (TypeORM entities, class-validator/class-transformer DTOs,
Nest's own DI) — was never explicitly imported anywhere; it happened to work in the real app and in
every *existing* test only because something else in that specific import chain (deep inside
`@nestjs/core`'s own internals) loaded it as a side effect first. That's an implementation detail of
Nest's current internals, not a real guarantee, and it genuinely broke the moment a test's own import
chain didn't happen to include it. Fixed with an explicit `import 'reflect-metadata'` as the first line
of `main.ts` (matching standard NestJS convention, not previously followed here) and
`"setupFiles": ["reflect-metadata"]` added to every one of the six Jest configs (the main
`package.json` config plus all five `test/jest-*.json` files) — the dependency is now real and
declared everywhere it's needed, not accidental anywhere.

### Verified: migration round-trip, against a genuinely fresh database

Created a brand-new, empty local Postgres database (`scholarship_os_migration_check`), ran all 11
migrations `up` (clean, in order), then ran `migration:revert` 11 times in a row (every migration's
`down()`, in correct reverse order) — the database ended with exactly one table left
(`migrations`, the tracker itself) and nothing else, proving every `down()` is genuinely complete, not
just present. Ran `up` again afterward to confirm the full round trip — 18 tables present, matching the
expected final schema exactly. Database dropped afterward; never touched Neon for any part of this.

### Verified: the Batch 18 composite indexes with real EXPLAIN ANALYZE evidence, not just theory

Populated `universities`/`opportunities` with 20,000 synthetic rows each in the local test database,
then ran `EXPLAIN ANALYZE` on the actual keyset-pagination query shape. With the composite index: an
`Index Scan` (backward, for the DESC case), **0.023-0.035ms**. Dropped the index and re-ran the
identical query: a full `Seq Scan` + `Sort`, **26.6ms** — roughly 750× slower at this data volume alone,
a gap that widens further as the table grows past 20,000 rows. Index recreated; synthetic data deleted
afterward. This is the concrete, measured evidence behind Batch 18's index claim, not merely
architectural reasoning.

### Reviewed, confirmed safe, no change needed

- **Child-resource/soft-delete-Application boundary**: `RequirementsService.findOneAccessible()`/
  `findAll()` and `DeadlinesService`'s equivalent re-verify the parent Application's *current*
  (non-soft-deleted) status via `ApplicationsService.assertApplicationOwnedByUser`/
  `findOwnedOrThrow` on every read, not just at creation — confirmed by direct inspection of every
  call site. No relation is ever eagerly loaded or requested for `application` on a Task/Requirement/
  Deadline query, so a soft-deleted Application's own row data can never leak through a child
  resource's response.
- **A genuinely open product-semantics question, not a defect, stated explicitly**: a `Task` whose
  `applicationId` points at a soft-deleted Application remains independently readable via
  `GET /tasks/:id`, because `Task`'s primary ownership anchor is its (required, never-soft-deleted)
  Journey, not its optional Application link — and Batch 7's soft-delete design never specified
  whether child Tasks/Requirements/Deadlines should also become invisible during an Application's
  retention window. This crosses no ownership boundary (the task remains the same user's own data) and
  was not silently "fixed" by guessing at unspecified product semantics across five services — flagged
  here as a genuine, evidenced open question for a product decision, not a security or correctness
  defect.
- **`ApplicationDocumentsService.detach()` under concurrent calls**: two simultaneous detach() calls
  for the same (application, document) pair both succeed (a delete of an already-deleted row simply
  affects zero rows in Postgres, no error) — reviewed and confirmed this is correct, idempotent
  DELETE-semantics behavior, not a race bug: the end state (no attachment row) is identical regardless
  of which request "actually" performed the deletion.
- **N+1 / unbounded relation loading**: no entity relation is `eager: true`; no list/paginated query
  uses `leftJoinAndSelect`/`innerJoinAndSelect`; every `.find()`/`.findOne()` with `relations:` is
  scoped to a single row or an already-ownership-bounded collection — confirmed by a full-repository
  grep, not assumed.
- **Cron jobs, Redis-optional documentation, Cloudinary signed-not-expiring claims**: all confirmed
  accurate against the actual running code (`ScheduleModule.forRoot()` + both cron services genuinely
  registered; no documentation claims Redis is required below N>1 instances; every Cloudinary
  reference — `api-reference.md`, `decisions.md`, code comments — consistently says "signed" and
  explicitly not "time-expiring"). One `sample.env` comment ("stays valid") was imprecise enough to
  read as an enforcement claim — corrected to state plainly that the TTL is communicated intent, not
  yet server-enforced.
- **Load test reproducibility**: re-ran `yarn load-test` after all fixes above; identical result shape
  (same latency percentiles, same 100/150 pass/reject split, 0 errors/timeouts/5xx throughout) —
  confirmed genuinely reproducible, not a one-off.

Full suite re-verified clean after every fix above: 445 unit tests / 50 suites (up from 438/47 — 3 new
DTO-validation spec files), 12 DB-integration, 17 HTTP-integration, 3 concurrency, 7 failure-recovery,
10 E2E (now passing, previously skipped) — 494 automated tests total across 6 independently-runnable
layers, plus a reproduced load test. `yarn build`/`yarn lint` clean.

## Track 2, §0 — Soft-deleted Applications: full visibility, not just list-exclusion

Explicit product decision: a soft-deleted Application and every one of its workflow resources
(Tasks, Requirements, Deadlines, ApplicationDocuments, snapshots) must be invisible through the
*entire* normal API surface — not just excluded from the Application list.

**Audit findings, by resource**:
- **Applications**: already fully correct (Batch 4/7) — `findOne()`'s automatic `@DeleteDateColumn`
  exclusion covers the detail endpoint; the list query already filters `deletedAt IS NULL` explicitly.
- **ApplicationDocuments / ApplicationSnapshots**: already fully correct — every method takes
  `applicationId` directly and calls `ApplicationsService.findOwnedOrThrow()` first, which already
  excludes a soft-deleted Application.
- **Requirements / Deadlines**: already fully correct — `findOneAccessible()`/`findAll()` re-verify
  the current Application/Task ownership chain on every access (`assertApplicationOwnedByUser`,
  `tasksService.findOwnedOrThrow`), not just at creation.
- **Tasks — a real, confirmed gap**: `Task`'s ownership anchor is its `journeyId` (required, never
  soft-deleted itself), not its optional `applicationId` — so neither `findOwnedOrThrow()` (single
  record) nor `findAllForUser()` (list) had ever checked whether a Task's linked Application was
  currently soft-deleted. Fixed in both methods with a `LEFT JOIN` to `application` plus an explicit
  visibility filter.

**A real bug this fix's own testing caught, not just a code-review nicety**: the first version of the
fix used `application.deletedAt IS NULL` as the filter condition — passed every unit test (mocked
query builders don't replicate this), but **failed against real Postgres**, confirmed by the new HTTP
integration test. Root cause: TypeORM automatically appends the joined entity's own
`@DeleteDateColumn` condition to the `LEFT JOIN`'s own `ON` clause (`LEFT JOIN applications
application ON application.id = task.application_id AND application.deleted_at IS NULL`) — so a
soft-deleted Application already fails to match the join, and `application` comes back `NULL` for
that row. A `WHERE application.deletedAt IS NULL` check can't then distinguish "no application at
all" from "application matched but is soft-deleted" — both look like `NULL IS NULL` (true). Fixed by
checking `application.id IS NOT NULL` instead — "did the join actually find a live application",
which is the question that actually needs answering. This was caught specifically by the HTTP
integration layer (real Postgres, real generated SQL) exactly as intended by this project's own
test-layer separation — a mocked unit test could not have found it, and didn't.

**Testing**: 5 new unit tests (`tasks.service.spec.ts`, mocked), 5 new DB-integration tests (real
`TasksService` against real Postgres, proving the exact query behavior), 8 new HTTP-integration tests
(`soft-delete-visibility.http-integration-spec.ts` — a full real scenario: Journey → Application →
Task/Requirement/Deadline → soft-delete → verify every one of the 8 required regression scenarios,
plus a parallel, untouched Application confirmed to remain fully visible throughout), and the
pre-existing E2E suite re-run to confirm no regression. All passing: 450 unit / 50 suites, 17
DB-integration, 25 HTTP-integration, 10 E2E.

No other backend change was needed — Journeys never eagerly load their `applications` relation
(confirmed by direct inspection), so no soft-deleted Application's data can leak through a Journey
response either.
