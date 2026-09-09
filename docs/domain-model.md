# Domain model

Every entity extends `BaseEntity` (`backend/src/common/entities/base.entity.ts`): a UUID `id` plus
`createdAt`/`updatedAt` timestamps. Column names are `snake_case` in Postgres, camelCase in
TypeScript (TypeORM's `name:` option on each `@Column`).

## Core distinction: Journey vs. Application

This is the one relationship worth understanding before anything else, because the two are easy to
conflate:

- **ApplicationJourney** — the overarching goal. "MSc Computer Science at University of Twente."
  Owns a University + Programme (both optional), and everything else (Applications, Tasks) hangs off
  it, directly or indirectly.
- **Application** — one concrete process pursued as part of that journey. A single Journey can have
  several: an admission application, a university scholarship application, an external scholarship
  application. Each Application optionally links to a structured **Opportunity** (the scholarship
  itself, if it's been captured as catalog data) but doesn't require one — plenty of applications
  (plain admission) have no "opportunity" to speak of.

```
User ──< ApplicationJourney ──< Application ──< Requirement
  │            │      │              │      ├──< Task
  │            │      │              │      ├──< Deadline
  │            │      │              │      ├──< ApplicationDocument >── Document
  │            │      │              │      └──< ApplicationSnapshot
  │            │      └──< Task (journey-level, not tied to one Application)
  │            ├── University (optional)
  │            └── Programme (optional)
  ├──< Document (versioned; ApplicationDocument pins a specific version)
  └──< ApplicantProfile (1:1 — the "Master Profile")
```

## Catalog vs. owned entities

| Entity                | Scope                                                                 |
| ---------------------- | ---------------------------------------------------------------------- |
| University, Programme  | Shared catalog — reads open to any authenticated user; mutation (create/update/delete) requires `UserRole.ADMIN` (Track 1 Group B — see `decisions.md`, "RBAC dependency") |
| Opportunity            | Shared catalog — same read-open/mutation-ADMIN-only split as above    |
| OpportunitySource      | Shared catalog (belongs to an Opportunity) — mutation stays open to any authenticated user, deliberately NOT admin-gated; see `decisions.md` for the reasoning |
| ApplicationJourney     | Owned (`userId`)                                                       |
| Application            | Owned, via its Journey — `journeyId` is immutable after creation (Track 1 Group C, see `decisions.md`) |
| Task                   | Owned, via its Journey — `journeyId` is a required column (`NOT NULL`, Track 1 Group C); `applicationId`/`requirementId` are optional further scoping within that Journey |
| Document               | Owned directly (`ownerId`)                                             |
| Requirement, Deadline  | Owned **if** linked to an Application; unowned if only linked to an Opportunity — mutation NOT admin-gated (attached sub-records, not catalog identity) |

## Notable modeling choices

- **Requirement** has two independent nullable FKs (`opportunityId`, `applicationId`) rather than
  separate `OpportunityRequirement`/`ApplicationRequirement` tables. A requirement can describe an
  Opportunity's general eligibility criteria, a specific Application's checklist item, or both. See
  `decisions.md` for why this wasn't split further.
- **Deadline** has *four* independent nullable FKs (Opportunity, Application, Task, Requirement) —
  intentionally flexible scoping, since a date might be as broad as "this scholarship's general
  deadline" or as narrow as "the recommendation letter for this specific requirement is due."
- **Requirement/Deadline's "at least one parent" invariant is enforced at both layers** (Track 1
  Group B): the service layer's `create()` check, and — added as a second, DB-level line of defense —
  a `@Check()` constraint on each table, for any future write path (e.g. an ingestion pipeline) that
  might bypass the service. See `decisions.md`, "F5".
- **Task.dependsOnTaskId / dependencyType** (`hard` | `soft`) is purely informational. No service
  reads it to block a status change — see `task.entity.ts`'s doc comment and
  `tasks.service.spec.ts`, which explicitly asserts a task can be marked done while its "hard"
  dependency is still incomplete. What *is* validated (Track 1 Group C) is dependency **scope**, never
  satisfaction: an Application-scoped task may only depend on another task in the same Application; a
  journey-level task may only depend on another journey-level task in the same Journey. See
  `decisions.md`, "Task dependency scope".
- **Requirement.copiedFromRequirementId** (Track 1 Group C) — a self-referencing, nullable,
  deliberately un-indexed FK (`onDelete: 'SET NULL'`) recording which Opportunity-scoped Requirement an
  Application-scoped Requirement was copied *from* at Application-creation time. Provenance only, never
  a live link — see `decisions.md`, "Opportunity → Application Requirement copy" for the full
  historical-integrity reasoning (same category of guarantee as ApplicationSnapshot/ApplicationDocument
  below).
- **Document versioning**: uploading a new version creates a *new* `Document` row
  (`version` incremented, `previousVersionId` pointing at the row it supersedes) rather than
  mutating the existing row in place. `ApplicationDocument` pins the exact version attached to a
  given Application, so a later re-upload of "my CV" never silently changes what a past application
  says was submitted. **Version-chain integrity is DB-enforced** (Track 1 Group D):
  `previousVersionId`'s FK is `ON DELETE RESTRICT`, not `SET NULL` — deleting a version that a newer
  version still depends on is rejected outright, never silently truncating the chain. Concurrent
  `uploadNewVersion()` calls are race-safe (row-locked, re-checked `isCurrent` inside the
  transaction); deleting the current version promotes the previous one so a family is never left
  without exactly one current row. See `decisions.md`, "Version deletion & current-version
  promotion" and "Concurrent document-version creation is now race-safe".
- **Document deletion eligibility** (Track 1 Group D): a Document version can only be deleted if it
  is (a) not currently attached via `ApplicationDocument`, (b) not referenced by any existing
  `ApplicationSnapshot` (checked via a targeted, user-scoped JSONB containment query — jsonb can't
  carry a real FK), and (c) not depended on by a newer version. Each check is backed by a DB
  constraint where one can exist (RESTRICT on both relevant FKs) plus an explicit service-layer check
  for a clean 409 either way. See `decisions.md`.
- **ApplicationDocument detach** (Track 1 Group D): `DELETE /applications/:id/documents/:documentId`
  removes only the attachment (join row) — never the underlying Document, never the Cloudinary
  asset, never an existing Snapshot. A working-state cleanup operation, not a document-deletion
  operation. See `decisions.md`, "ApplicationDocument detach".
- **ApplicationSnapshot** vs. **ApplicantProfile**: the Profile is live, editable data ("what's true
  about me right now"). A Snapshot is a jsonb point-in-time copy taken when it matters (e.g. at
  submission) and never mutated afterward — updating the Profile later must never rewrite a
  Snapshot. Since Track 1 Group D, a snapshot's captured Requirement state also includes
  `requirementId` and the Group C `copiedFromRequirementId` provenance breadcrumb (a copied value,
  never a live resolution of the source row). See `decisions.md`, "Application Snapshot creation
  model" and "Snapshot requirement provenance".
- **Application deletion is a hard delete** (Track 1 Group D, explicitly documented, not a bug):
  cascades through `ApplicationDocument`/`Requirement`/`Task`/`Deadline`/`ApplicationSnapshot` —
  including every Snapshot the Application ever had. No soft-delete/archive mechanism exists
  anywhere in this codebase. This is irreversible and is a distinct thing from the mutation-immunity
  guarantee above: a Snapshot never changes due to normal mutation, but IS intentionally destroyed
  if its owning Application is explicitly deleted. See `decisions.md`, "Application deletion: hard
  delete, explicitly documented".
- **ApplicantProfile**'s education/experience/skills/certifications/languages are jsonb arrays, not
  normalized child tables. See `decisions.md`, "Don't over-model the profile yet."

## Enums

Status/type enums are defined twice — `backend/src/types.ts` (used by the TypeORM column
definitions) and `frontend/src/lib/shared-types.ts` (used by the frontend's labels/filters) — kept
manually in sync since `backend` and `frontend` are independent repos with no shared package (see
`decisions.md`, "Independent repos over a shared types package"). Several enums
(`RequirementStatus`'s `PROFILE_MATCH`/`AI_ASSESSMENT`, in particular) include values for
not-yet-built AI features so the schema won't need a migration when that phase starts — nothing in
this phase writes those values.

## Auth-adjacent tables

- **User** — email + bcrypt `passwordHash` (column-level `select: false` plus
  `@Exclude()`-based response stripping — two independent layers, see `user.entity.ts`). Also carries
  `isVerified` (Track 1) — tracked and exposed, but does not currently gate API access; see
  `decisions.md`, "Email verification does not gate API access (yet)". And `role` (Track 1 Group B) —
  `UserRole.USER`/`UserRole.ADMIN`, defaults to `USER`, gates shared-catalog mutation only (see
  `decisions.md`, "RBAC: a minimal foundation, not a permissions system") — no role-management API
  endpoint exists; promotion is via direct database access only.
- **RefreshSession** — one row per issued refresh credential (i.e. per logged-in device). See
  `architecture.md`'s auth flow and `decisions.md`'s "Refresh token storage" for why this exists
  instead of a single token column on User.
- **EmailVerificationOtp** (Track 1) — one row per issued verification code. Same hash-only-storage
  pattern as RefreshSession; see `decisions.md`, "Email verification: OTP hashed like every other
  credential in this app".
- **PasswordResetToken** (Track 1) — one row per issued reset credential. Same pattern again; see
  `decisions.md`, "Password reset: same credential pattern, plus a transaction where it matters".
