# API reference

Base URL: `http://localhost:8769/api` (see `NEXT_PUBLIC_API_URL`). Every route requires a valid
`Authorization: Bearer <accessToken>` header **except** those marked 🌐 Public below — see
`architecture.md`'s "Authorization model".

Request/response bodies are validated with `class-validator` DTOs (`whitelist: true,
forbidNonWhitelisted: true` — unknown fields are rejected, not silently dropped). Errors always come
back as `{ statusCode, message, error, path, timestamp, requestId }` (see
`common/filters/http-exception.filter.ts`). Every response also carries an `X-Request-Id` header
(Production hardening Batch 10) — the same value as the error body's `requestId` — for correlating a
specific request with server-side logs; include it when reporting an issue.

## Auth (`/auth`)

Every route below is also rate-limited (`@nestjs/throttler`, Redis-backed and shared across all
instances when `REDIS_URL` is configured — see `decisions.md`, "Batch 3 — Distributed rate limiting")
independently of its auth requirement; limits are set per-route in `auth.controller.ts`. Every route
here is also marked `@StrictRateLimit()`: if the Redis-backed store is unavailable, these routes fail
CLOSED (`503`) rather than silently going unthrottled — see `decisions.md`.

| Method | Path                       | Auth | Notes |
| ------ | -------------------------- | ---- | ----- |
| POST   | `/auth/register`           | 🌐   | Creates the user + an empty profile, logs them in, issues + emails a verification OTP (best-effort — failure doesn't fail registration) |
| POST   | `/auth/login`               | 🌐   | Also throttled per-account (normalized email), independent of the IP-based limit above — a self-recovering window, not a hard lock (Production hardening Batch 2, see `decisions.md`) |
| POST   | `/auth/refresh`             | 🌐   | Reads the refresh cookie; rotates it (atomic consume + per-user advisory lock — see `decisions.md`) |
| POST   | `/auth/logout`               | 🌐*  | *Acts on the refresh cookie only — works even with an expired access token |
| POST   | `/auth/logout-all`           |      | Revokes every session for the current user |
| GET    | `/auth/sessions`             |      | Lists active (non-revoked) sessions — device list |
| GET    | `/auth/me`                   |      | Returns `{ userId, email, isVerified, role }` from the access token |
| POST   | `/auth/verify-email`         |      | Body: `{ code }`. Authenticated — acts on the caller's own account only, never a client-supplied email |
| POST   | `/auth/resend-verification`  |      | No body. Cooldown-gated (data-layer, not just rate-limit) |
| POST   | `/auth/forgot-password`      | 🌐   | Body: `{ email }`. Always returns the same generic response, whether or not the account exists |
| POST   | `/auth/reset-password`       | 🌐   | Body: `{ token, newPassword }`. Revokes every existing refresh session on success |

## Users (`/users`)

| Method | Path               | Notes |
| ------ | ------------------ | ----- |
| GET    | `/users`           | 🔒 ADMIN. Keyset-paginated directory. Query: `search?` (name/email substring, LIKE-escaped), `role?` (`user`\|`admin`), `cursor`, `limit`, `order`. Response `{ items, nextCursor, hasNextPage }`. Each item: `id`, `name`, `email`, `role`, `isVerified`, `createdAt` only — never secrets. Frontend: Profile → Account admin role picker (no separate Users page) |
| GET    | `/users/me`        | Full user record (password hash always stripped) |
| PATCH  | `/users/me`        | Update `name` only — never accepts `role` |
| PATCH  | `/users/:id/role`  | 🔒 ADMIN. Body: `{ role: 'user' \| 'admin' }`. Cannot change your own role; cannot demote the last remaining ADMIN. Emits structured audit log `user.role_changed`. Never returns secrets. Live DB role is re-checked on `@Roles()` routes (demotion takes effect immediately even if the access JWT still claims ADMIN) |
| DELETE | `/users/me`        | Full account erasure — irreversible, immediate (not soft-deleted). Deletes every owned database row AND every Cloudinary asset the account's Documents referenced — database cascade alone is not sufficient, see `decisions.md`, "Batch 7" (Production hardening) |

## Profile (`/profile`) — the "Master Profile", one per user

| Method | Path        | Notes |
| ------ | ----------- | ----- |
| GET    | `/profile`  | |
| PATCH  | `/profile`  | Partial update — see `domain-model.md` for the jsonb array fields |

## Catalog modules — Universities, Programmes, Opportunities, OpportunitySources

Universities and Programmes: reads (`GET`) are open to any authenticated user; mutation
(`POST`/`PATCH`/`DELETE`) requires `UserRole.ADMIN`.

**Opportunities:** any authenticated user may `POST` (record a personal funding find — URL/article
capture). `PATCH`/`DELETE` stay ADMIN-only for shared-catalog curation. See `decisions.md`.

| Method | Path                        | Auth |
| ------ | --------------------------- | ---- |
| POST   | `/universities`             | 🔒 ADMIN |
| GET    | `/universities?search=`     | |
| GET    | `/universities/:id`         | |
| PATCH  | `/universities/:id`         | 🔒 ADMIN |
| DELETE | `/universities/:id`         | 🔒 ADMIN |

Same ADMIN mutation pattern for `/programmes` (filter: `?universityId=`).

`/opportunities` (filters: `?studyLevel=&country=&opportunityType=&universityId=&programmeId=`):
`GET` open; `POST` any authenticated user; `PATCH`/`DELETE` 🔒 ADMIN.

`/opportunity-sources` (filter: `?opportunityId=`) is **not** ADMIN-gated — full CRUD stays open to
any authenticated user (sources hang off an opportunity you are tracking).

Additional source-capture routes:

| Method | Path                                 | Notes |
| ------ | ------------------------------------ | ----- |
| POST   | `/opportunity-sources/fetch-preview` | Strictly rate-limited. Body: `{ url }`. SSRF-safe fetch → `{ url, finalUrl, title, extractedContent, contentType }`. Does not persist anything |
| POST   | `/opportunity-sources`                 | Optional `autoFetch: true` fills empty `sourceName`/`extractedContent` only (never overwrites user text, never creates an Opportunity). Sets `contentOrigin` to `manual` or `fetched` |

## Requirements (`/requirements`)

Linked to an Opportunity and/or an Application (at least one required on create) — see
`domain-model.md`.

| Method | Path                                          | Notes |
| ------ | --------------------------------------------- | ----- |
| POST   | `/requirements`                               | |
| GET    | `/requirements?opportunityId=&applicationId=` | At least one filter required |
| GET    | `/requirements/:id`                           | |
| PATCH  | `/requirements/:id`                           | |
| DELETE | `/requirements/:id`                           | |
| POST   | `/requirements/:id/ai-suggestion`             | Strictly rate-limited. Persists `suggestedStatus` / `suggestedAt` / `suggestionRationale` / `suggestionSource`. **Does not change** authoritative `status` |
| POST   | `/requirements/:id/ai-suggestion/confirm`     | Copies pending suggestion into `status`, then clears suggestion fields |
| POST   | `/requirements/:id/ai-suggestion/reject`      | Clears pending suggestion; leaves `status` unchanged |

## Deadlines (`/deadlines`)

Linked to any combination of Opportunity/Application/Task/Requirement (at least one required).

| Method | Path                                                                   |
| ------ | ------------------------------------------------------------------------ |
| POST   | `/deadlines`                                                            |
| GET    | `/deadlines?opportunityId=&applicationId=&taskId=&requirementId=`       |
| GET    | `/deadlines/:id`                                                        |
| PATCH  | `/deadlines/:id`                                                        |
| DELETE | `/deadlines/:id`                                                        |

## Journeys (`/journeys`) — owned

| Method | Path             |
| ------ | ---------------- |
| POST   | `/journeys`      |
| GET    | `/journeys`      |
| GET    | `/journeys/:id`  |
| PATCH  | `/journeys/:id`  |
| DELETE | `/journeys/:id`  |

## Applications (`/applications`) — owned via Journey

A Journey can own several Applications (e.g. one admission + one or more scholarship applications for
the same programme) — see `domain-model.md`. `journeyId` is **immutable after creation**: `PATCH` with
a changed `journeyId` returns `400`; resending the same (unchanged) value is a no-op (Track 1 Group C —
see `decisions.md`). If `opportunityId` is set on `POST`, every Requirement currently attached to that
Opportunity is copied into new, independent Application-scoped Requirement rows at creation time only
(never re-triggered by a later `PATCH` that changes `opportunityId`) — see `decisions.md`, "Opportunity
→ Application Requirement copy".

| Method | Path                              |
| ------ | ---------------------------------- |
| POST   | `/applications`                    |
| GET    | `/applications?journeyId=`         |
| GET    | `/applications/:id`                |
| PATCH  | `/applications/:id`                |
| DELETE | `/applications/:id`                |
| POST   | `/applications/:id/restore`        |

**`DELETE /applications/:id` is a soft delete** (Production hardening Batch 7): the row is marked
`deletedAt` and immediately stops appearing in `GET /applications`/`GET /applications/:id`, but is
only permanently removed (cascading to every `ApplicationDocument`/`Requirement`/`Task`/`Deadline`/
`ApplicationSnapshot` it had) after `applications.softDeleteRetentionDays` (default 30) by a
background purge job.

**`POST /applications/:id/restore`** is owner-only: clears `deletedAt` for the caller's soft-deleted
application. Returns `404` for another user's deleted application or after permanent purge; `409` if
the application is already active. Children were never soft-deleted separately — restoring the
Application restores normal visibility for its Tasks/Requirements/Deadlines/etc. under existing
ownership rules. ADMIN has no general ability to restore another user's application.

### Attached documents (`/applications/:id/documents`)

| Method | Path                                          | Notes |
| ------ | --------------------------------------------- | ----- |
| POST   | `/applications/:id/documents`                 | Body: `{ documentId, label? }`. Pins the EXACT document version supplied — ownership of both the Application and the Document is verified. `409` if this exact version is already attached to this Application |
| GET    | `/applications/:id/documents`                 | Lists attachments with their pinned document version |
| DELETE | `/applications/:id/documents/:documentId`     | **Detach** (Track 1 Group D) — removes only the attachment. Never deletes the underlying Document, never touches Cloudinary, never affects any existing Snapshot. `404` if no such attachment exists on this Application. See `decisions.md`, "ApplicationDocument detach" |

### Snapshots (`/applications/:id/snapshots`)

Point-in-time historical records with **append-only revisioning** for edits — see `domain-model.md`
and `decisions.md`. Creation is always an explicit user action. Editing creates a new snapshot row
linked via `supersedesSnapshotId`; historical rows are never mutated in place. Explicit delete is
allowed (no “must keep one snapshot” invariant). Cross-application access returns `404`.

| Method | Path                                                         | Notes |
| ------ | ------------------------------------------------------------ | ----- |
| POST   | `/applications/:id/snapshots`                                | Body: `{ label? }` only — `createdVia` is always server-set to `manual`, never client-suppliable |
| GET    | `/applications/:id/snapshots`                                | Creation order, oldest first |
| GET    | `/applications/:id/snapshots/:snapshotId`                    | `404` if `:snapshotId` belongs to a different Application, even one the caller owns |
| POST   | `/applications/:id/snapshots/:snapshotId/revisions`          | Append-only edit. Body: `{ label?, data? }`. Creates a new row with `supersedesSnapshotId` pointing at the previous snapshot. Clients cannot set `applicationId`, ownership, `createdVia`, `createdAt`, or lineage fields |
| DELETE | `/applications/:id/snapshots/:snapshotId`                    | Explicit delete after ownership chain check. Descendants keep lineage with `ON DELETE SET NULL` on `supersedesSnapshotId` |

## Tasks (`/tasks`) — owned via Journey (`journeyId` is always required on create, `NOT NULL` in the DB)

`dependsOnTaskId` (informational only — see `domain-model.md`, never a workflow blocker) accepts a
task UUID, `null` (explicitly clears an existing dependency), or omission (leave unchanged). The
dependency target must be in scope: same Application if the dependent task itself has an
`applicationId`, otherwise same Journey and also journey-level (no `applicationId`) — a cross-scope
dependency, or a task depending on itself, returns `400` (Track 1 Group C — see `decisions.md`, "Task
dependency scope"). `dependencyType` (`hard`/`soft`) can never be set without a resulting
`dependsOnTaskId`.

| Method | Path                                       | Notes |
| ------ | -------------------------------------------- | ----- |
| POST   | `/tasks`                                     | |
| GET    | `/tasks?journeyId=&applicationId=`           | |
| GET    | `/tasks/:id`                                 | |
| PATCH  | `/tasks/:id`                                 | Setting `status: 'done'` auto-stamps `completedAt` |
| DELETE | `/tasks/:id`                                 | |

## Documents (`/documents`) — owned directly, multipart upload via Cloudinary

| Method | Path                       | Notes |
| ------ | -------------------------- | ----- |
| POST   | `/documents`                | Multipart: `file` + `title`/`documentType`/`notes` fields. Creates version 1. Rejects a file whose bytes don't match its declared MIME type, or whose MIME type isn't allowlisted (Production hardening Batch 6 — see `decisions.md`) |
| POST   | `/documents/:id/versions`   | Multipart, same validation as above. Creates the next version, marks the old one `isCurrent: false`. `409` if `:id` has already been superseded by a concurrent call (Track 1 Group D — race-safe, see `decisions.md`) |
| GET    | `/documents`                | Current version of each of the user's documents (paginated — see "Pagination" below) |
| GET    | `/documents/:id`             | Metadata only — `cloudinaryUrl` is not directly retrievable (uploads are Cloudinary `type: 'authenticated'`); use `:id/download-url` |
| GET    | `/documents/:id/download-url` | Returns `{ url, expiresInSeconds }` — a signed Cloudinary delivery URL (Production hardening Batch 6). `url` is genuinely signed (unguessable, verified server-side by Cloudinary) but not yet server-enforced-expiring — see `decisions.md`, "Honest scope on 'signed' vs. 'time-expiring'" |
| GET    | `/documents/:id/versions`   | Full version history, oldest first |
| PATCH  | `/documents/:id`             | Metadata only — upload a new version to change the file |
| DELETE | `/documents/:id`             | Deletes the DB row **first**, then the Cloudinary asset (Track 1 Group D — reversed from the previous, unsafe ordering; see `decisions.md`, "Cloudinary deletion ordering"). `409` if this version is currently attached to an Application, referenced by an existing Snapshot, or depended on by a newer version — detach/resolve first |

Requires `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` to be set — uploads
fail with a clear error otherwise (see `common/cloudinary/cloudinary.service.ts`).

## Pagination (Production hardening Batch 4)

Every list endpoint that returns a potentially-unbounded or user-scoped-growing collection
(Universities, Programmes, Opportunities, OpportunitySources, Journeys, Applications, Tasks,
Deadlines, Requirements, Documents) accepts `?cursor=&limit=` and returns
`{ items, nextCursor, hasNextPage }` — never a bare array. `cursor` is an opaque, base64url-encoded
token from a previous response's `nextCursor`; don't construct one by hand. `limit` is clamped to a
configured default/max (`pagination.defaultPageSize`/`maxPageSize`). This is keyset (not offset)
pagination — see `decisions.md`, "Batch 4 — Pagination" for why. `ApplicationDocuments` and
`ApplicationSnapshots`' `findAllForApplication` list endpoints are the two deliberate exceptions —
both structurally bounded to one Application's own rows.

## Misc

| Method | Path           | Auth | Notes |
| ------ | -------------- | ---- | ----- |
| GET    | `/health`      | 🌐   | Liveness — process is up, no DB dependency. `{ status: 'ok', timestamp }` |
| GET    | `/health/ready`| 🌐   | Readiness — real `SELECT 1` against the DB; `503` on failure, no driver-detail leak (Production hardening Batch 1) |
