# API reference

Base URL: `http://localhost:8769/api` (see `NEXT_PUBLIC_API_URL`). Every route requires a valid
`Authorization: Bearer <accessToken>` header **except** those marked 🌐 Public below — see
`architecture.md`'s "Authorization model".

Request/response bodies are validated with `class-validator` DTOs (`whitelist: true,
forbidNonWhitelisted: true` — unknown fields are rejected, not silently dropped). Errors always come
back as `{ statusCode, message, error, path, timestamp }` (see
`common/filters/http-exception.filter.ts`).

## Auth (`/auth`)

Every route below is also rate-limited (`@nestjs/throttler`, in-memory — see `decisions.md`, "Rate
limiting") independently of its auth requirement; limits are set per-route in `auth.controller.ts`.

| Method | Path                       | Auth | Notes |
| ------ | -------------------------- | ---- | ----- |
| POST   | `/auth/register`           | 🌐   | Creates the user + an empty profile, logs them in, issues + emails a verification OTP (best-effort — failure doesn't fail registration) |
| POST   | `/auth/login`               | 🌐   | |
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

| Method | Path         | Notes |
| ------ | ------------ | ----- |
| GET    | `/users/me`  | Full user record (password hash always stripped) |
| PATCH  | `/users/me`  | Update `name` |

## Profile (`/profile`) — the "Master Profile", one per user

| Method | Path        | Notes |
| ------ | ----------- | ----- |
| GET    | `/profile`  | |
| PATCH  | `/profile`  | Partial update — see `domain-model.md` for the jsonb array fields |

## Catalog modules — Universities, Programmes, Opportunities, OpportunitySources

Universities, Programmes, and Opportunities: reads (`GET`) are open to any authenticated user;
mutation (`POST`/`PATCH`/`DELETE`) requires `UserRole.ADMIN` — see `decisions.md`, "RBAC dependency:
why shared catalog administration needed it now" (Track 1 Group B). 🔒 marks the ADMIN-only routes
below.

| Method | Path                        | Auth |
| ------ | --------------------------- | ---- |
| POST   | `/universities`             | 🔒 ADMIN |
| GET    | `/universities?search=`     | |
| GET    | `/universities/:id`         | |
| PATCH  | `/universities/:id`         | 🔒 ADMIN |
| DELETE | `/universities/:id`         | 🔒 ADMIN |

Same pattern for `/programmes` (filter: `?universityId=`) and `/opportunities` (filters:
`?studyLevel=&country=&opportunityType=&universityId=&programmeId=`) — `POST`/`PATCH`/`DELETE` are
🔒 ADMIN, `GET` is open.

`/opportunity-sources` (filter: `?opportunityId=`) is **not** ADMIN-gated — full CRUD stays open to
any authenticated user; see `decisions.md` for why it's treated differently from its siblings.

## Requirements (`/requirements`)

Linked to an Opportunity and/or an Application (at least one required on create) — see
`domain-model.md`.

| Method | Path                                                | Notes |
| ------ | ---------------------------------------------------- | ----- |
| POST   | `/requirements`                                      | |
| GET    | `/requirements?opportunityId=&applicationId=`        | At least one filter required |
| GET    | `/requirements/:id`                                  | |
| PATCH  | `/requirements/:id`                                  | |
| DELETE | `/requirements/:id`                                  | |

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

**`DELETE /applications/:id` is a hard delete and is irreversible** — it cascades to every
`ApplicationDocument`/`Requirement`/`Task`/`Deadline`/`ApplicationSnapshot` the Application had,
including permanently destroying its snapshot history. No soft-delete/archive exists. See
`decisions.md`, "Application deletion: hard delete, explicitly documented".

### Attached documents (`/applications/:id/documents`)

| Method | Path                                          | Notes |
| ------ | --------------------------------------------- | ----- |
| POST   | `/applications/:id/documents`                 | Body: `{ documentId, label? }`. Pins the EXACT document version supplied — ownership of both the Application and the Document is verified. `409` if this exact version is already attached to this Application |
| GET    | `/applications/:id/documents`                 | Lists attachments with their pinned document version |
| DELETE | `/applications/:id/documents/:documentId`     | **Detach** (Track 1 Group D) — removes only the attachment. Never deletes the underlying Document, never touches Cloudinary, never affects any existing Snapshot. `404` if no such attachment exists on this Application. See `decisions.md`, "ApplicationDocument detach" |

### Snapshots (`/applications/:id/snapshots`)

Immutable, point-in-time historical records — see `domain-model.md` and `decisions.md`, "Application
Snapshot creation model". Creation is always an explicit user action; there is no update/delete
endpoint for a snapshot itself (it can only be destroyed as a side effect of deleting its owning
Application).

| Method | Path                                              | Notes |
| ------ | -------------------------------------------------- | ----- |
| POST   | `/applications/:id/snapshots`                      | Body: `{ label? }` only — `createdVia` is always server-set to `manual`, never client-suppliable |
| GET    | `/applications/:id/snapshots`                      | Creation order, oldest first |
| GET    | `/applications/:id/snapshots/:snapshotId`          | `404` if `:snapshotId` belongs to a different Application, even one the caller owns |

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
| POST   | `/documents`                | Multipart: `file` + `title`/`documentType`/`notes` fields. Creates version 1 |
| POST   | `/documents/:id/versions`   | Multipart. Creates the next version, marks the old one `isCurrent: false`. `409` if `:id` has already been superseded by a concurrent call (Track 1 Group D — race-safe, see `decisions.md`) |
| GET    | `/documents`                | Current version of each of the user's documents |
| GET    | `/documents/:id`             | |
| GET    | `/documents/:id/versions`   | Full version history, oldest first |
| PATCH  | `/documents/:id`             | Metadata only — upload a new version to change the file |
| DELETE | `/documents/:id`             | Deletes the DB row **first**, then the Cloudinary asset (Track 1 Group D — reversed from the previous, unsafe ordering; see `decisions.md`, "Cloudinary deletion ordering"). `409` if this version is currently attached to an Application, referenced by an existing Snapshot, or depended on by a newer version — detach/resolve first |

Requires `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` to be set — uploads
fail with a clear error otherwise (see `common/cloudinary/cloudinary.service.ts`).

## Misc

| Method | Path           | Auth | Notes |
| ------ | -------------- | ---- | ----- |
| GET    | `/health`      | 🌐   | `{ status: 'ok', timestamp }` |
