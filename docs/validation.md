# Phase 1.5 — validation change log

This is the mandatory, checkpoint-by-checkpoint change record for Phase 1.5 (see `phase-1o5.txt`
for the operating rules this phase followed). Every change below was proposed as a numbered
checkpoint, approved explicitly before any file was touched, and verified (unit tests + build + lint;
**no e2e tests were run at any point in this phase**, per standing instruction) before being reported
back as complete.

This document covers **Group 1 only** (items 1–7: the approved foundation-correctness/performance
work). It is not the formal `Phase-1.5-Foundation-Validation-Report.md` — that report is deferred
until the remaining open items (application-snapshot and user-isolation test coverage, and Group 2's
design-only work) are further along, so it can be written once, accurately, rather than needing a
rewrite. See `docs/decisions.md`'s "Phase 1.5 decisions" section for the architectural reasoning
behind each change below.

---

## CHANGE-001

**Date:** 2026-08-29

**File(s):**
- `backend/src/documents/documents.service.spec.ts` (new)

**What changed:** Added 6 unit tests covering document version-history integrity — no source code
changed.

**Why it changed:** Document versioning is named a "core architectural guarantee" (phase-1o5.txt
§14) and had zero automated test coverage. This also became the regression safety net for
CHANGE-002.

**Problem being solved:** No test existed proving that uploading a new document version leaves prior
versions' data untouched, or that a historical `ApplicationDocument` reference survives later
versions being created.

**Previous behaviour:** N/A (test-only addition).

**New behaviour:** 6 passing tests: version-1 creation, new-version creation without mutating the
prior row, `findAllCurrentForUser` excludes superseded versions, `findVersionHistory` returns the
full chain oldest-first, the exact CV v1→Application A / CV v2→Application B / then v3 scenario from
§14, and rejection when a different user attempts to version someone else's document.

**Database impact:** None — mocked repositories, no real database connection.

**API impact:** None.

**Frontend impact:** None.

**Performance impact:** None.

**Security impact:** None.

**Tests/verification:** `yarn test documents.service.spec` (6/6 passed). Full `yarn test` (4 suites,
17 tests, all passed at the time). No e2e run.

**Reversible:** Yes — trivially (delete the file). Not planned to be reverted.

**Affects future phases:** Yes, positively — this suite is the regression check every subsequent
`DocumentsService` change (CHANGE-002, CHANGE-006) was verified against.

---

## CHANGE-002

**Date:** 2026-08-29

**File(s):**
- `backend/src/documents/documents.service.ts`
- `backend/src/documents/documents.service.spec.ts`

**What changed:** Rewrote `findVersionHistory()` to fetch the full version chain via one recursive
SQL query (`WITH RECURSIVE`) plus one `find(... In(ids))` hydration call, instead of one query per
version in a loop. Updated the CHANGE-001 test mock to add a `manager.query` stub simulating the
recursive walk against the same in-memory test data.

**Why it changed:** Approved Group 1 item 2 — a confirmed N+1 query pattern.

**Problem being solved:** `findVersionHistory` issued one database round trip per hop while walking
the `previousVersionId` linked list — unbounded growth as a document accumulates more versions.

**Previous behaviour:** `1 + N` sequential queries for a document with N prior versions (e.g. 11
queries for a 10-version chain).

**New behaviour:** Exactly 3 queries regardless of chain length (ownership check, one recursive CTE,
one hydration `find`). Same return value, same order (oldest-first), same errors.

**Database impact:** No schema change. New query pattern: one raw parameterized recursive CTE (the
only raw-SQL query in the codebase), scoped to this single method.

**API impact:** None — identical response shape and ordering.

**Frontend impact:** None.

**Performance impact:** Expected improvement based on bounded (constant) vs. unbounded (linear)
round trips as version count grows; not benchmarked — no version chain in current data is long
enough to measure meaningfully.

**Security impact:** None — the one query parameter (`documentId`) is passed through TypeORM's
parameterized `$1` binding, not string-interpolated.

**Tests/verification:** All 6 CHANGE-001 tests re-verified passing, unchanged, after the rewrite.
Full `yarn test` (4 suites, 17 tests), `yarn build`, `yarn lint` all clean. No e2e run.

**Reversible:** Yes — the old loop-based implementation is fully described in this record and in the
checkpoint conversation history if a revert is ever needed.

**Affects future phases:** Minor — any future change to `Document`'s columns must remember this
method's raw SQL only selects `id`/`previous_version_id`, not every column, so it isn't affected by
new columns being added elsewhere.

---

## CHANGE-003

**Date:** 2026-08-29

**File(s):**
- `backend/src/opportunities/opportunities.service.ts`
- `backend/src/opportunities/opportunities.controller.ts`
- `backend/src/opportunities/opportunities.service.spec.ts` (new)

**What changed:** Split `OpportunitiesService.findOneOrThrow()` into a lean existence check (no
relations) and a new `findOneWithDetailsOrThrow()` (the original eager-loaded behavior). Only
`OpportunitiesController.findOne()` (`GET /opportunities/:id`) now calls the detail-load version.

**Why it changed:** Approved Group 1 item 3 — one method was serving two different jobs.

**Problem being solved:** Every FK-existence check across Applications, Requirements, Deadlines, and
OpportunitySources (plus this service's own `update()`/`remove()`) — 6 of 7 call sites — paid for
three joined one-to-many relations (`sources`, `requirements`, `deadlines`) they never read.

**Previous behaviour:** `findOneOrThrow` always eager-loaded all three relations.

**New behaviour:** `findOneOrThrow` is lean (single-table lookup). `findOneWithDetailsOrThrow`
carries the eager load, used only by the real detail-view endpoint.

**Database impact:** Removes 3 joined relations from 6 of 7 call sites. No schema change.

**API impact:** `PATCH /opportunities/:id`'s response no longer includes
`sources`/`requirements`/`deadlines` (previously present only as a side effect of the shared method
— see `decisions.md` for why this is treated as a consistency fix, not a regression). `GET
/opportunities/:id` is unchanged.

**Frontend impact:** None — no frontend page currently reads the removed fields from the `PATCH`
response.

**Performance impact:** Expected improvement from removed joins/row-multiplication risk on 6 of 7
call sites; not benchmarked — current catalog data doesn't have enough child rows per opportunity to
measure a difference yet.

**Security impact:** None.

**Tests/verification:** New suite (5 tests) asserts on the exact arguments passed to the mocked
`findOne` — proving the query *shape* changed, not just the return value. Full `yarn test` (5 suites,
22 tests), `yarn build`, `yarn lint` all clean. No e2e run.

**Reversible:** Yes — revert the controller's one-line call-site change and merge the two methods
back.

**Affects future phases:** Any new caller needing opportunity existence only (not full detail) should
use `findOneOrThrow`, not the detail-load variant — documented directly in the method's doc comment.

---

## CHANGE-004

**Date:** 2026-08-29

**File(s):**
- `backend/src/deadlines/deadlines.service.ts`
- `backend/src/deadlines/deadlines.service.spec.ts` (new)

**What changed:** `DeadlinesService.update()` now computes which link fields
(`opportunityId`/`applicationId`/`taskId`/`requirementId`) are actually changing versus the
deadline's current values, and only re-validates those.

**Why it changed:** Approved Group 1 item 4 — confirmed redundant re-validation.

**Problem being solved:** `update()` re-validated every link field present in the incoming DTO
unconditionally, even when it matched the value the deadline already had — a value that
`findOneAccessible()` (called one line above) had just proven valid.

**Previous behaviour:** Up to 9 sequential queries in the worst case (1 deadline fetch + up to 3
current-link checks via `findOneAccessible` + up to 4 DTO-link checks, always run + 1 save).

**New behaviour:** Only genuinely-changing link values are re-validated. No link fields touched: 1
ownership check total instead of 2 (per the specific case verified by test). Genuinely-changing
links: unchanged query count from before — no regression, since those do need validating.

**Database impact:** Fewer redundant round trips in the common case (updating label/date/status
without touching links). No schema change.

**API impact:** None — identical inputs produce identical outputs and errors.

**Frontend impact:** None.

**Performance impact:** Expected reduction in round trips for the common case; not benchmarked.

**Security impact:** None — every value that is actually new to the record still gets fully validated
before being persisted.

**Tests/verification:** New suite (3 tests) asserts on actual mock call *counts* in three scenarios
(no link change, same value resubmitted, genuinely different value) — proving the redundant call is
gone in the first two cases and preserved in the third. Full `yarn test` (6 suites, 25 tests),
`yarn build`, `yarn lint` all clean. No e2e run.

**Reversible:** Yes — straightforward to revert to unconditional re-validation.

**Affects future phases:** None expected.

---

## CHANGE-005

**Date:** 2026-08-29

**File(s):**
- `backend/src/applications/applications.service.ts`
- `backend/src/journeys/journeys.service.ts`
- `backend/src/tasks/tasks.service.ts`
- `backend/src/applications/applications.service.spec.ts` (new)
- `backend/src/journeys/journeys.service.spec.ts` (new)
- `backend/src/tasks/tasks.service.spec.ts` (extended — existing tests untouched)

**What changed:** In all 6 `create()`/`update()` methods across these 3 services, independent
existence/ownership checks (ones that don't depend on each other's result) now run concurrently via
`Promise.all` instead of sequentially.

**Why it changed:** Approved Group 1 item 5 — a review of independent sequential queries for safe
parallelization.

**Problem being solved:** Checks that validate unrelated foreign keys (e.g. journey ownership vs.
opportunity existence) waited for each other's round trip to complete before starting, even though
neither's outcome affects whether/how the other runs.

**Previous behaviour:** Sequential `await` per check — total latency was the sum of every check's
round trip.

**New behaviour:** Concurrent execution via `Promise.all` — total latency approaches the *slowest*
single check instead of the *sum* of all of them. Query count is unchanged (this was a latency fix,
not a count reduction).

**Database impact:** None — same queries, same count, different timing.

**API impact:** None, with one documented exception: if a request has multiple simultaneously-invalid
fields, which specific validation error is reported first is no longer deterministic by program
order (see `decisions.md` for the full reasoning on why this is an accepted trade-off).

**Frontend impact:** None.

**Performance impact:** Expected latency reduction proportional to one round trip's network cost per
additional concurrent check — most relevant now that the app runs against a remote (Neon) database
rather than a local one. Not benchmarked.

**Security impact:** None — every check that used to run still runs; confirmed by new tests asserting
each mock was actually called, not silently skipped.

**Tests/verification:** 3 new/extended suites (11 tests total across the three services) confirm:
both checks run when both apply, a failure in either check still surfaces correctly, and (for Tasks)
the application/journey cross-check still works after parallelization. Full `yarn test` (8 suites, 36
tests), `yarn build`, `yarn lint` all clean. No e2e run.

**Reversible:** Yes — revert each `Promise.all` back to sequential `await` calls independently per
service if ever needed.

**Affects future phases:** Anyone adding a new validation check to these methods should consider
whether it's independent of the existing ones (parallelizable) or genuinely needs a prior check's
result (must stay sequential) — noted in each method's inline comment.

---

## CHANGE-006

**Date:** 2026-08-29

**File(s):**
- `backend/src/documents/documents.service.ts`
- `backend/src/documents/documents.service.spec.ts`

**What changed:** `uploadNewVersion()`'s two writes (mark previous version not-current, insert new
version) now run inside `this.documents.manager.transaction(...)`. Added a `manager.transaction` mock
(simulating commit/rollback semantics) and 2 new tests; all 6 CHANGE-001 tests re-verified unchanged.

**Why it changed:** Approved Group 1 item 6 — document version creation/update atomicity.

**Problem being solved:** The two writes were independent statements with no transaction boundary. A
failure between them (crash, lost connection, etc.) could leave a document with no version marked
current at all — it would silently disappear from `findAllCurrentForUser`'s results.

**Previous behaviour:** `update()` then `save()` as two unguarded statements.

**New behaviour:** Both writes commit together or neither does. The Cloudinary upload deliberately
stays outside the transaction (external network call — see `decisions.md` for why).

**Database impact:** Adds a `BEGIN`/`COMMIT` around the two existing writes — a small, deliberate,
necessary cost for the atomicity guarantee. No schema change. This is the codebase's first explicit
use of a transaction.

**API impact:** None on success. On a failure mid-operation, the caller now sees a clean failure
instead of a record left in a half-updated state.

**Frontend impact:** None.

**Performance impact:** Negligible — two round trips become four (`BEGIN`, update, save, `COMMIT`);
the correct cost of the guarantee, not overhead to optimize away. Not benchmarked.

**Security impact:** None.

**Tests/verification:** New test forces the second write to fail and confirms the first write's
effect is not visible afterward (rollback proof) and no orphaned row exists; another confirms the
happy path produces the same end state as before. Full `yarn test` (8 suites, 38 tests), `yarn
build`, `yarn lint` all clean. No e2e run.

**Reversible:** Yes — unwrap the two statements back out of the transaction callback.

**Affects future phases:** Establishes the pattern (`this.documents.manager.transaction(...)`) for
any future multi-write operation elsewhere in the codebase that needs the same guarantee (e.g.
`remove()`'s Cloudinary/DB delete ordering, noted but not changed here).

---

## CHANGE-007

**Date:** 2026-08-29

**File(s):**
- `backend/src/users/users.service.ts`
- `backend/src/users/users.service.spec.ts` (new)

**What changed:** `UsersService.createUser()` now catches a Postgres unique-constraint violation
(code `23505`) during `save()` and translates it into `ConflictException` — the same exception the
existing upfront `findByEmail` check already throws.

**Why it changed:** Approved Group 1 item 7 — duplicate-email race-condition handling.

**Problem being solved:** The upfront check left a race window: two concurrent registrations for the
same email could both pass the check before either commits. The email column's existing unique
index would reject the second insert, but that failure previously surfaced as an unhandled
`QueryFailedError` → generic `500 Internal Server Error`.

**Previous behaviour:** Common case (existing email, no race): clean `409 Conflict`. Race case: raw,
unhandled `500`.

**New behaviour:** Common case: unchanged. Race case: clean `409 Conflict`, same message as the
common case. Any *other* database error still propagates unchanged (verified by test, not assumed).

**Database impact:** None — no schema change, relies on the unique index that already existed on
`User.email`.

**API impact:** The race case now returns `409 Conflict` instead of `500 Internal Server Error`, with
a client-appropriate message.

**Frontend impact:** None currently — the frontend does not specifically branch on 409 vs. 500 for
registration failures, but would now be able to going forward.

**Performance impact:** None — no new query, only a `try`/`catch` around the existing insert.

**Security impact:** None — no new information exposed. If anything, removes a path where an
unexpected 500 (with a server-side stack trace logged) occurred for a routine, non-malicious case.

**Tests/verification:** New suite (4 tests) confirms: the upfront-check path is unchanged and never
reaches `save()`; a real `QueryFailedError` (constructed via TypeORM's own class, verified against its
actual source to confirm it copies the driver error's `code` onto itself) carrying code `23505` is
translated to `ConflictException`; a `QueryFailedError` with a *different* code is not swallowed; a
plain `Error` is not swallowed either. Full `yarn test` (9 suites, 42 tests), `yarn build`, `yarn
lint` all clean. No e2e run.

**Reversible:** Yes — remove the `try`/`catch`, back to relying solely on the upfront check.

**Affects future phases:** None expected — this is a self-contained hardening of one existing method.

---

## Summary across CHANGE-001 – CHANGE-007

| # | Area | Kind of fix |
|---|---|---|
| 001 | Documents | Test coverage added (no code change) |
| 002 | Documents | N+1 query fix |
| 003 | Opportunities | Over-fetching fix (method split) |
| 004 | Deadlines | Redundant query fix |
| 005 | Applications/Journeys/Tasks | Latency fix (parallelization) |
| 006 | Documents | Atomicity fix (transaction) |
| 007 | Users | Error-handling fix (race condition) |

**Files touched in total across Group 1:** `documents.service.ts`, `documents.service.spec.ts`,
`opportunities.service.ts`, `opportunities.controller.ts`, `opportunities.service.spec.ts`,
`deadlines.service.ts`, `deadlines.service.spec.ts`, `applications.service.ts`,
`applications.service.spec.ts`, `journeys.service.ts`, `journeys.service.spec.ts`, `tasks.service.ts`,
`tasks.service.spec.ts`, `users.service.ts`, `users.service.spec.ts` — 15 files, no migrations, no
package.json changes, no environment/configuration changes. Zero schema changes were made during
Group 1 — every fix that would have required one (denormalized document grouping, Requirement/
Deadline ownership architecture) was explicitly identified and deferred instead.

**Not run at any point:** e2e tests, migrations, seed operations — per standing instruction.

**Superseded:** the "still open" items originally listed here (application-snapshot validation,
user-isolation validation, Group 2 design-only work) were closed in later work — application snapshots
across Checkpoints 9A–9C (see conversation record; not folded into this Group-1-scoped log), and the
full identity/auth foundation (previously "Group 2 — design only") in Track 1 below, upgraded from a
design-only scope to a fully implemented one at the user's explicit direction.

---

# Track 1 — Identity & Authentication Foundation

Closed as one coherent unit (not Group 1's per-checkpoint numbering) — every capability the Group A
audit found missing or defective was either implemented and tested, or explicitly identified as
out of scope with a stated reason (see `docs/decisions.md`'s "Track 1 decisions" section for the full
architectural reasoning behind each row below).

| Area | What changed | Files (primary) |
|---|---|---|
| Refresh-token race (A1.1) | Atomic conditional consume + per-user Postgres advisory lock, closing both the original TOCTOU race and a second-order race the fix's own test uncovered | `auth.service.ts`, `auth.service.spec.ts` |
| Email normalization (A1.2) | `findByEmail()` normalizes (trim+lowercase) internally so every caller benefits | `users.service.ts`, `users.service.spec.ts` |
| Controller/service layering (A1.3) | `UsersController.updateMe()` no longer touches the database directly | `users.controller.ts`, `users.service.ts` |
| Email verification | New OTP entity/service, hash-only storage, atomic consume + attempt-limiting, cooldown-gated resend, authenticated (not public-by-email) endpoints | `email-verification.service.ts` (+spec), `entities/email-verification-otp.entity.ts`, `user.entity.ts` (`isVerified`) |
| Password reset | New reset-token entity/service, same hash-only pattern, transactional password+session-revocation on success, enumeration-safe request endpoint | `password-reset.service.ts` (+spec), `entities/password-reset-token.entity.ts` |
| Password policy | Shared min/max-length constants across register+reset; bcrypt 72-byte truncation risk closed with an explicit validator | `password-policy.ts`, `register.dto.ts`, `reset-password.dto.ts` |
| Rate limiting | `@nestjs/throttler` (in-memory), global guard + per-route limits on every auth-sensitive endpoint | `app.module.ts`, `auth.controller.ts` |
| Email delivery boundary | New `EmailService` — dev-mode logs, fails loud (not silently) in production with no provider configured | `common/email/` |
| Profile test coverage | New spec file — previously zero tests existed for `ProfileService` | `profile.service.spec.ts` |
| Migration | `AddEmailVerificationAndPasswordReset` — `users.is_verified` column + two new tables, run and verified against Neon DEVELOP | `database/migrations/1788883224490-*.ts` |

**Not run at any point:** e2e tests. **Explicitly out of scope, stated as such rather than silently
deferred:** gating other API routes on `isVerified` (a cross-cutting product decision, not an
identity/auth-foundation one — see `decisions.md`).

---

# Track 1 hardening pass

A second, closing pass — every item the report above left as a "documented limitation" was reassessed;
each was either genuinely infrastructure-dependent (stays documented) or actually solvable now (fixed
here). See `docs/decisions.md`'s "Track 1 hardening pass" section for full reasoning.

| Area | What changed | Files (primary) |
|---|---|---|
| **CRITICAL fix** — refresh-token rollback bug | The reuse-detection/expired-token branches threw *inside* the advisory-lock transaction, so TypeORM silently rolled back the very writes (the cross-session revoke-all sweep) they existed to make. Fixed: the transaction callback now always resolves with an outcome value; the exception is thrown after commit. Two new regression tests assert persisted DB state directly. | `auth.service.ts`, `auth.service.spec.ts` |
| Advisory lock — real-Postgres verification | Same-key serialization, different-key independence, and release-on-ROLLBACK all verified directly against Neon DEVELOP via raw `psql` (lock calls only, no table data touched) | see `decisions.md` for exact timings |
| Rate limiting — wiring verification | New tests read the literal Reflector metadata `ThrottlerGuard` itself consumes (route limits) and `AppModule`'s own `@Module()` metadata (global guard registration) — real code, not re-implementation. Caught and fixed a real bug: `@nestjs/throttler` doesn't publicly export its metadata-key constants. | `auth.controller.throttle.spec.ts`, `app.module.guards.spec.ts` |
| Email delivery — completed | New `EmailProvider` abstraction (`DevLogEmailProvider` / `SmtpEmailProvider` via `nodemailer`), purpose-built `sendVerificationOtpEmail()`/`sendPasswordResetEmail()` methods, HTML+text templates with config-driven URLs, fail-fast SMTP config validation, and asymmetric failure handling per call site (best-effort at register, hard error at resend, silent at forgot-password for enumeration safety) | `common/email/` (service, provider interface, 2 providers, templates), `auth.controller.ts` |
| Password policy — Unicode coverage | New tests using actual multibyte characters (emoji, accented letters) prove the byte-limit validator catches what character-length alone would miss, on both `RegisterDto` and `ResetPasswordDto` | `password-policy.spec.ts` |
| Email config validation | SMTP port/credential-pair consistency checks, fail-fast at startup | `email.service.ts` |
| User isolation — re-audit | Grepped every `findOne`/`findById`/`@Param` across Users/Profile/Auth/OTP/Reset — confirmed zero id-based lookup routes exist for these entities; every lookup is either server-derived-userId-scoped or credential-hash-scoped (refresh/reset tokens, where possessing the raw credential IS the authorization) | no code change — audit conclusion only |

**New dependency:** `nodemailer` (+ `@types/nodemailer`, dev) — the real SMTP delivery provider,
justified in `decisions.md`.

**Not run at any point:** e2e tests. **Genuinely infrastructure-dependent, not implementation-deferred:**
real SMTP credentials (the code path is complete and tested with fakes — see `decisions.md`).

---

# Track 1 → Group B: Academic & Opportunity Discovery

Closes the domain audit's findings plus a scope amendment that pulled RBAC into Group B (originally
classified V2) — see `docs/decisions.md`'s "Track 1 → Group B" section for full reasoning behind every
row.

| Area | What changed | Files (primary) |
|---|---|---|
| **RBAC dependency implemented because shared catalog administration depends on it** | Minimal `UserRole.USER`/`UserRole.ADMIN` foundation: `role` column (default `USER`), carried in the JWT, checked by a third global guard (`RolesGuard`) reading `@Roles()` metadata — same enhancer pattern as `@Public()`, not a competing system. University/Programme/Opportunity mutation is now ADMIN-only; reads stay open. | `types.ts`, `user.entity.ts`, `roles.decorator.ts` (+guard, +spec), `app.module.ts`, three catalog controllers |
| Privilege escalation closed at both layers | `RegisterDto`/`UpdateUserDto` have no `role` field (DTO-boundary, proven via `validate()` with the real ValidationPipe options); `UsersService.update()` additionally uses an explicit field allowlist rather than passing the whole DTO through, so the service itself refuses to write `role` even if a DTO's shape were ever loosened | `users.service.ts`, `privilege-escalation.spec.ts` |
| OpportunitySource — inspected, deliberately NOT admin-gated | Reasoning recorded, not assumed: requires a pre-existing admin-managed Opportunity to attach to, is contributory provenance metadata rather than catalog identity, and the product's own future direction requires ordinary users to create these | `decisions.md` |
| F1 — Opportunity relationship validation | `create()`/`update()` previously validated nothing — the only Group B service with this gap. Now validates university/programme existence concurrently | `opportunities.service.ts` |
| F2 — University↔Programme consistency | New check: a supplied/effective `programmeId` must actually belong to the effective `universityId`, covering both "change the programme" and "change the university under an existing programme" | `opportunities.service.ts` |
| F3 — OpportunitySource re-parenting | `update()` now validates a changed `opportunityId` the same way `create()` already did | `opportunity-sources.service.ts` |
| F4 — required-string validation | Shared `trim` transform + `@IsNotEmpty()` across University/Programme/Opportunity/Requirement/Deadline's name/title/label/description fields — rejects empty AND whitespace-only input, and trims stored values | `common/validators/trim.transform.ts`, 5 DTOs |
| I2 — non-negative funding amounts | `@IsNumberString()` → `@Matches(/^\d+(\.\d{1,2})?$/)` | `create-opportunity.dto.ts` |
| F5 — DB CHECK constraints | Requirement/Deadline's "at least one parent" invariant now enforced at the DB level too — migrated and verified against Neon DEVELOP (pre-migration: confirmed zero existing violating rows; post-migration: a deliberate, rolled-back INSERT proving the constraint actually rejects an all-null row) | `requirement.entity.ts`, `deadline.entity.ts`, migration `1788965550585-*` |
| F7 — Opportunity.findAll() over-fetch | No longer eager-loads sources/requirements/deadlines — only the real detail view does | `opportunities.service.ts` |
| I1 — Deadline validation parallelization | The up-to-4 independent link checks now run via `Promise.all`, same pattern as Track 1 Group A's Checkpoint 5 | `deadlines.service.ts` |
| Test coverage | Universities/Programmes/OpportunitySources/Requirements: 0 → full coverage. Opportunities: 5 → 17 tests. Deadlines: 3 → 4 tests (added a concurrency proof). Plus RBAC-specific: `roles.guard.spec.ts`, `catalog-authorization.spec.ts`, `privilege-escalation.spec.ts` | see file list below |

**Migration:** `1788965550585-AddUserRoleAndGroupBCheckConstraints` — `users.role` column +
`requirements`/`deadlines` CHECK constraints. Generated, run, and verified against Neon DEVELOP only;
existing rows confirmed compatible before migrating (a pre-flight query, not an assumption); the demo
user's role correctly backfilled to `'user'` via the column's own DEFAULT.

**Not run at any point:** e2e tests. **Deliberately deferred, with reasons (see `decisions.md`):**
University/Programme duplicate-warning UX (needs product/UX design first), Opportunity intelligent
duplicate detection (future ingestion/AI capability), pagination (V2 unless usage data shows a real
need), fine-grained RBAC expansion (only the minimal USER/ADMIN distinction was built).

---

# Track 1 → Group C: Application Journey & Workflow

Closes the read-only domain audit's I3/I5/I6 findings plus the approved C1–C3 implementation scope —
see `docs/decisions.md`'s "Track 1 Group C" section for full reasoning behind every row.

| Area | What changed | Files (primary) |
|---|---|---|
| C1.1 — Task.journeyId required | Schema-level `NOT NULL` now backs an invariant every code path already assumed (`CreateTaskDto` always required it; the service's own lookup already defensively guarded a missing one). Zero existing NULL rows confirmed on Neon DEVELOP before migrating; `NOT NULL` presence and a deliberate rolled-back `INSERT` confirmed after. | `task.entity.ts`, migration `1788967836773-*` |
| C1.3 / I5 — Application.journeyId immutable | `update()` rejects any attempted `journeyId` change with `BadRequestException`; a resent-but-unchanged value is a no-op. Prevents silently desynchronizing Tasks, which independently store both `applicationId` and `journeyId`. No cascade-update, no transaction, no "move Application" feature — none were asked for. | `applications.service.ts` |
| C2.1–C2.4 / I3 — Task dependency scope validation | New `validateDependencyScope()` (shared by `create()`/`update()`): rejects self-dependency; an Application-scoped task may only depend on a task in the *same* Application; a journey-level task may only depend on another journey-level task in the *same* Journey (never an Application-scoped one). Dependency target resolved via the same ownership-enforcing `findOwnedOrThrow()` used everywhere else. `dependencyType` can never be set without a resulting `dependsOnTaskId`, checked against each field's effective post-write value. | `tasks.service.ts`, `create-task.dto.ts` (`dependsOnTaskId` now accepts `null`) |
| C2.5 — Task update() cross-consistency | "Effective value" validation (same pattern as Group B's Opportunity F2 fix): whichever of `journeyId`/`applicationId` a PATCH doesn't touch keeps its current value, and the effective pair is what gets validated — so changing only `journeyId` on a task that already has an `applicationId` correctly re-validates (and can reject) that combination. | `tasks.service.ts` |
| C3 / I6 — Opportunity → Application Requirement copy | Creating an Application with a linked `opportunityId` copies every currently-attached Opportunity Requirement into a new, independent Application-scoped Requirement row (`status` reset to `UNKNOWN`, `copiedFromRequirementId` provenance set, `opportunityId: null`) — a one-time copy, never live synchronization, atomic with the Application's own creation in one short (default-isolation) transaction. The Opportunity's requirements are read *before* the transaction opens, keeping the transaction itself to exactly the two writes that must be atomic. Not re-triggered by a later `opportunityId` change on `update()`. New `copiedFromRequirementId` self-FK, deliberately not indexed (not a lookup path). | `applications.service.ts`, `requirement.entity.ts`, `applications.module.ts` (doc comment only), migration `1788967836773-*` |
| Test coverage | `TasksService`: +19 tests (self-dependency, same/cross-Application, same/cross-Journey, journey-level-depends-on-application-scoped rejection, dependency-target ownership, clearing, dependencyType-without-target on both create/update, update() cross-consistency). `ApplicationsService`: +12 tests (journeyId immutability accept/reject paths, multi-Application-per-Journey, Opportunity-unrelated-to-Journey, full Requirement-copy battery: correct fields/applicationId/opportunityId-null/provenance/no-copy-without-opportunity/zero-requirement-opportunity/scope-isolation/transaction-atomicity). | `tasks.service.spec.ts`, `applications.service.spec.ts` |

**Migration:** `1788967836773-GroupCTaskJourneyRequiredAndRequirementProvenance` —
`tasks.journey_id SET NOT NULL` + `requirements.copied_from_requirement_id` column and self-FK
(`ON DELETE SET NULL`, not indexed). Generated, run, and verified against Neon DEVELOP only; a
pre-migration query confirmed zero existing rows would violate the new `NOT NULL` constraint, and a
post-migration `\d` inspection plus a deliberate, rolled-back `INSERT` confirmed both the constraint
and the FK are genuinely enforced.

**Not run at any point:** e2e tests. **Deliberately deferred, stated as such rather than silently
skipped (see `decisions.md`):** Task status-transition/workflow-state rules beyond the existing
informational-dependency model, live synchronization of copied Requirements with their Opportunity
source (explicitly rejected — conflicts with historical integrity), an Application "move to a
different Journey" feature, re-triggering the Requirement copy on a later `opportunityId` change.
**Confirmed VALID BY DESIGN, no change needed:** `ApplicationSnapshotsService` already reads
Requirements generically by `applicationId` with no distinction between copied and manually-created
rows, so copied Requirements flow into snapshots correctly with zero code change.

---

# Track 1 → Group D: Documents & Historical Records

Closes the read-only inspection's 1 CRITICAL + 6 IMPORTANT findings — see `docs/decisions.md`'s
"Track 1 Group D" section for full reasoning behind every row.

| Area | What changed | Files (primary) |
|---|---|---|
| **CRITICAL fix — Cloudinary deletion ordering (D-P7)** | `DocumentsService.remove()` used to delete the Cloudinary asset BEFORE the DB row, which `ON DELETE RESTRICT` on `application_documents.document_id` made deterministically unsafe for any attached document (file destroyed, DB delete then fails, generic 500). Reordered: ownership check → three concurrent eligibility checks (attached / snapshot-referenced / has a dependent child), each a clean 409 → DB delete (+ current-version promotion, same transaction) → only then, Cloudinary delete. A Cloudinary failure after a successful DB delete is logged (orphaned-asset follow-up) and never reverses the DB deletion. | `documents.service.ts` |
| D1 — concurrent version-creation race | `uploadNewVersion()`'s version-determining read now happens inside the transaction against a row locked with `SELECT ... FOR UPDATE`, with `isCurrent` re-checked post-lock — the loser of a race is rejected with a clean `ConflictException`, not left to create a duplicate-numbered sibling | `documents.service.ts` |
| D-P2 — version-chain integrity | `Document.previousVersionId`'s FK changed from `ON DELETE SET NULL` to `ON DELETE RESTRICT` — a version a newer version depends on can no longer be deleted, silently truncating the chain, at either the DB or service layer | `document.entity.ts`, migration `1788989842296-*` |
| D-P1 / D4 — snapshot-reference deletion protection | New `isReferencedInAnySnapshot()` — a targeted, user-scoped PostgreSQL JSONB containment query (`data -> 'documents' @> ...`) — blocks deleting a Document version that any existing Snapshot still references, even if it's no longer currently attached (jsonb can't carry a real FK, so this is the only protection available) | `documents.service.ts` |
| D-P3 — current-version deletion | Deleting the current version now promotes the previous version to `isCurrent: true` in the same transaction as the delete; deleting the sole version of a family removes it entirely, with no "empty current" state left behind | `documents.service.ts` |
| D-P4 — ApplicationDocument detach | New `DELETE /applications/:id/documents/:documentId` — removes only the join row (identified by `documentId`, unambiguous thanks to the existing `UNIQUE(applicationId, documentId)` constraint); never touches the Document, Cloudinary, or any existing Snapshot | `application-documents.service.ts`, `applications.controller.ts` |
| D-P5 — Application deletion policy | No behavior change (remains hard delete + full cascade, including Snapshots) — now explicitly documented as an intentional, irreversible, ownership-scoped action distinct from the mutation-immunity guarantee, correcting a previously-dangling doc reference | `decisions.md`, `domain-model.md` |
| D-P6 — Group C requirement provenance in snapshots | `ApplicationSnapshotsService.create()`'s Requirement mapping now also captures `requirementId` and `copiedFromRequirementId` (`null` for manually-created requirements, the source id for Group C copies) — a plain point-in-time copy, never a live resolution | `application-snapshots.service.ts` |
| Query efficiency | The three deletion-eligibility checks in `remove()` run concurrently via `Promise.all`, same established pattern as everywhere else in this codebase | `documents.service.ts` |
| Test coverage | `DocumentsService`: +22 tests (concurrent-version-race protection, all deletion-eligibility paths, current-version promotion, sole-version removal, full Cloudinary-ordering battery). `ApplicationDocumentsService`: +6 detach tests (success, cross-user application, 404 for a nonexistent/foreign attachment, Document left untouched, targeted-only removal). `ApplicationSnapshotsService`/historical-integrity: +5 tests (requirement id + provenance capture for both manual and copied requirements, provenance-mutation immunity, detach immunity) | `documents.service.spec.ts`, `application-documents.service.spec.ts`, `application-snapshots.service.spec.ts`, `application-snapshots.historical-integrity.spec.ts` |

**Migration:** `1788989842296-GroupDDocumentVersionChainIntegrity` — `documents.previous_version_id`'s
FK changed from `ON DELETE SET NULL` to `ON DELETE RESTRICT`. Generated, run, and verified against
Neon DEVELOP only; a pre-migration query confirmed zero existing orphaned `previous_version_id`
values (structurally guaranteed already, verified anyway), and a post-migration `\d` inspection plus
a deliberate, rolled-back `INSERT`/`DELETE` sequence (fabricating a real two-version chain, then
attempting to delete the ancestor while the child still depended on it) confirmed the constraint is
genuinely enforced — and left zero residual rows behind (`ROLLBACK`, verified by a follow-up count
query).

**No index was added** for the new JSONB containment query — deliberate, see `decisions.md`; revisit
only if real snapshot volume ever shows the query is slow.

**Not run at any point:** e2e tests. **Deliberately deferred, stated as such rather than silently
skipped (see `decisions.md`):** Application soft-delete/archive architecture, signed/expiring
Cloudinary URLs, a Cloudinary retry/outbox/job platform, a document-family-id schema redesign,
logging Cloudinary's non-`ok` delete result (folded into the existing orphaned-asset log line
instead — see "Improvements" below), any change to broader RBAC/organization permissions.
**Improvements included because they fell out naturally, not as separate scope:** the deletion-
eligibility checks were parallelized (see "Query efficiency" above); the Cloudinary-orphan log line
includes both the Document id and its `publicId` for operational follow-up.
