# Architecture

## Stack

| Layer    | Choice                                                                 |
| -------- | ----------------------------------------------------------------------- |
| Backend  | NestJS 11, TypeORM 0.3 + PostgreSQL, Passport-JWT, Cloudinary SDK       |
| Frontend | Next.js 16 (App Router, Turbopack), React 19.2, Ant Design 5, TanStack Query 5, Tailwind CSS 4 |
| Repo     | Two independent projects side by side — see "Independent repos" below  |

## Layout

```
scholarship-os/
├── backend/            NestJS API — own package.json, yarn.lock, node_modules (see domain-model.md)
│   ├── .env, sample.env, .gitignore, README.md   (exactly these two env files — see decisions.md)
│   └── src/, test/
├── frontend/           Next.js app — own package.json, yarn.lock, node_modules
│   ├── .env.local, .env.example, .gitignore, README.md   (exactly these two)
│   └── src/
├── docs/               This directory — the only thing shared between them: documentation
└── README.md
```

`backend` and `frontend` are top-level folders (not nested under a generic `apps/`) — a deliberate,
explicit choice over the more common `apps/*` monorepo convention, made because this repo only ever
holds exactly these two projects; a generic `apps/` wrapper buys nothing here and just adds a path
segment everyone has to type.

## Independent repos, not a monorepo

There is no root `package.json`, no root `node_modules`, no shared lockfile, and no `packages/`
directory. `backend` and `frontend` are installed separately (`cd backend && yarn install`, `cd
frontend && yarn install`), each with its own complete dependency tree, and share **no source code**
— either could be extracted into its own git repository exactly as it sits today.

Anything both apps need to agree on (the domain enums, the two auth response shapes) is duplicated
by hand: `backend/src/types.ts` and `frontend/src/lib/shared-types.ts` are two independently-
maintained copies of the same content, each carrying a doc comment pointing at its counterpart. See
`decisions.md`, "Independent repos over a shared types package," for why, and the trade-off that
comes with it (nothing enforces the two copies staying in sync — a deliberate choice, not an
oversight).

This root level (this `docs/` directory plus the top-level `README.md`) is the one thing that isn't
duplicated per app — a description of how the two independent projects relate to each other has to
live somewhere that isn't "inside" either one of them. Each app also documents itself standalone in
its own `README.md`, since that's what a reader arriving at just `backend/` or just `frontend/` (e.g.
after it's split into its own repo) would see.

Each app keeps its own real, gitignored env file (`backend/.env`, `frontend/.env.local`) — copy it
from that app's committed template (`backend/sample.env`, `frontend/.env.example`) to get started.
`development.md` has the full setup walkthrough for both.

## Request flow

The frontend never talks to Postgres, Cloudinary, or anything else directly — every piece of state
lives behind the NestJS API, reached over plain HTTP:

```
Browser (Next.js client components)
   │  fetch(), credentials: 'include'
   ▼
NestJS API  (/api/*)
   │  TypeORM
   ▼
PostgreSQL
   │
   └─ Cloudinary (document file storage only — see documents module)
```

Next.js's server-side rendering is used only for the initial HTML shell; all data fetching is
client-side via TanStack Query. This was a deliberate simplification for the foundation phase — see
`decisions.md`, "Client-side data fetching over Server Components fetching".

**PostgreSQL is authoritative for document-reference integrity; Cloudinary never is (Track 1 Group
D).** Postgres and Cloudinary cannot share one transaction, so every document-deletion path follows
the same fixed order: verify eligibility against Postgres → delete the Postgres row → only then
attempt the Cloudinary delete. A Cloudinary-side failure after a successful DB deletion is logged for
operational follow-up and never reverses the DB deletion — there is no distributed-transaction
mechanism here, and building one is out of scope for this stage. See `decisions.md`, "Cloudinary
deletion ordering".

## Auth flow

Access + refresh tokens, with refresh rotation and reuse detection. Full rationale in
`decisions.md`, "Refresh token storage"; mechanics:

1. **Login/register** — API sets an httpOnly, `SameSite=Lax`, `path=/api/auth` cookie holding an
   opaque refresh token, and returns a short-lived (15m default) JWT access token in the response
   body.
2. **The access token lives in memory only** on the frontend (a module-level variable in
   `lib/api-client.ts`), never in `localStorage` — a page reload loses it by design.
3. **On reload**, `AuthProvider` silently calls `POST /auth/refresh`. The browser sends the httpOnly
   cookie automatically; if it's still valid, the API rotates it (issues a new refresh token,
   revokes the old one) and returns a fresh access token — the user never sees a login screen.
4. **Every subsequent API call** that gets back a 401 triggers exactly one silent refresh-and-retry
   (de-duplicated across concurrent requests) before giving up and redirecting to `/login`.
5. **Refresh token reuse** (a revoked token presented again — only possible via a stolen/leaked
   token, since the legitimate client always moves on to the rotated one) revokes every session for
   that user and forces a full re-login.

```
        register/login                    refresh (cookie only)
Client ─────────────────► API        Client ─────────────────► API
       ◄───── access token + Set-Cookie          ◄───── new access token + rotated Set-Cookie
```

### Email verification (Track 1)

Registration issues a 6-digit OTP (only its hash is ever stored — same pattern as refresh tokens) and
emails it via `EmailService.sendVerificationOtpEmail()` — real SMTP delivery when `EMAIL_SMTP_HOST` is
configured, a dev-log fallback otherwise (see `decisions.md`, "Email delivery is now complete, not
deferred"). `POST /auth/verify-email`/`POST /auth/resend-verification` are both authenticated, acting
on the caller's own account only — there is no public, email-addressed verification endpoint.
`User.isVerified` is tracked and exposed but does **not** currently gate access to the rest of the API
— see `decisions.md`, "Email verification does not gate API access (yet)".

### Password reset (Track 1)

`POST /auth/forgot-password` always returns the same response whether or not the email belongs to an
account; `POST /auth/reset-password` validates + consumes a hashed reset token, then — in one
transaction — updates the password hash and revokes every existing refresh session for the account.
Already-issued access tokens remain valid for their remaining (≤15m) lifetime, since this app's JWTs
are stateless with no denylist; see `decisions.md` for the full reasoning. Delivery goes through the
same `EmailService.sendPasswordResetEmail()` path as verification.

### Refresh-token concurrency (Track 1 hardening pass)

`POST /auth/refresh` wraps its consume-or-reuse-and-issue sequence in a database transaction guarded by
a per-user Postgres advisory lock (`pg_advisory_xact_lock`), so at most one refresh per user is ever
mid-flight at a time — closing a second-order race where a reuse-detection sweep could otherwise miss
a session created by the very race it was reacting to. Verified directly against Neon DEVELOP (not
just documented) — see `decisions.md`, "Advisory lock: verified against real Postgres".

## Authorization model

- **Global guard, opt-out by default.** `JwtAuthGuard` is registered as `APP_GUARD` — every route
  requires a valid access token unless annotated `@Public()`. New routes are private by default
  instead of every developer needing to remember to add a guard.
- **Catalog data vs. owned data.** Universities/Programmes/Opportunities are shared reference data —
  any authenticated user can *read* them, but *mutating* them (create/update/delete) requires
  `UserRole.ADMIN` (Track 1 Group B — see `decisions.md`, "RBAC dependency: why shared catalog
  administration needed it now"). OpportunitySource stays fully open (read + write) to any
  authenticated user — see `decisions.md` for why it's treated differently from its siblings.
  Journeys, Applications, Tasks, and Documents are scoped to their owning user; Requirements and
  Deadlines can be scoped to either, depending on what they're attached to.
- **Role-based authorization (Track 1 Group B).** A third global guard, `RolesGuard`, sits alongside
  `JwtAuthGuard`: `Authentication → Authorization/role check → Controller`. `@Roles(UserRole.ADMIN)`
  on a route (or no `@Roles()` at all, the default — no restriction) works the same opt-in way
  `@Public()` opts a route OUT of authentication. Minimal two-role (`USER`/`ADMIN`) foundation, not a
  full permissions system — see `decisions.md`.
