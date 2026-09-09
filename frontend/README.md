# Scholarship OS — frontend

Next.js (App Router) + Ant Design + TanStack Query. Independent of `../backend` — see
`../docs/decisions.md`, "Independent repos over a shared types package," for why (and what that
trade-off costs).

## Setup

```bash
yarn install
cp .env.example .env.local   # the only two env files in this app — ready-to-run as-is
yarn dev                      # http://localhost:3000
```

Requires the backend to be running (see `../backend/README.md`) — every page except `/login` and
`/register` is behind auth and fetches from it directly.

## Scripts

| Script       | What it does |
| ------------ | ------------ |
| `yarn dev`   | Dev server (Turbopack) |
| `yarn build` | Production build — also type-checks and prerenders static routes |
| `yarn start` | Runs the production build |
| `yarn lint`  | ESLint |

## Structure

```
src/
├── app/
│   ├── login/, register/        Public auth pages
│   ├── (app)/                    Route group behind auth (layout.tsx gates it — see below)
│   │   ├── dashboard/            Journeys list
│   │   ├── journeys/[id]/        Journey detail: applications + tasks
│   │   └── profile/              Applicant profile
│   ├── layout.tsx, providers.tsx Root layout — AntD, TanStack Query, AuthProvider
│   └── page.tsx                  Redirects to /dashboard or /login based on auth state
└── lib/
    ├── api-client.ts             fetch wrapper: access token in memory, silent refresh-and-retry on 401
    ├── auth-context.tsx          AuthProvider / useAuth() — owns the user + access token lifecycle
    ├── queries.ts                TanStack Query hooks per resource (journeys, applications, tasks, profile)
    ├── types.ts                  UI-facing shapes for API responses (not full backend entities)
    └── shared-types.ts           Domain enums + auth response shapes — duplicated from
                                  ../backend/src/types.ts, kept manually in sync (see
                                  ../docs/decisions.md)
```

**Auth**: the access token lives in memory only (`api-client.ts`'s module-level variable), never in
`localStorage`. A page reload loses it by design — `AuthProvider` silently calls `POST /auth/refresh`
on mount to restore the session from the httpOnly refresh cookie. See `../docs/architecture.md`'s
"Auth flow" for the full picture.

**Data fetching** is entirely client-side via TanStack Query — there's no server-side data fetching
in this app. See `../docs/decisions.md`, "Client-side data fetching over Server Components fetching,"
for why.

## This Next.js version may differ from what you expect

This repo is on Next.js 16 with React 19.2 — `AGENTS.md` in this directory (auto-managed by
`next dev`, don't hand-edit it) points at `node_modules/next/dist/docs/` for the version-matched
docs. Worth a read before assuming an older API (e.g. synchronous `params`/`searchParams`) still
works — it doesn't; see `docs/app/guides/upgrading/version-16.md` in that bundled docs tree.

## Further documentation

Cross-cutting docs that concern both this app and the backend live in `../docs/`:

- [`../docs/architecture.md`](../docs/architecture.md) — overall stack, request flow, auth flow
- [`../docs/domain-model.md`](../docs/domain-model.md) — entities and how they relate
- [`../docs/api-reference.md`](../docs/api-reference.md) — every endpoint this app calls
- [`../docs/decisions.md`](../docs/decisions.md) — why the non-obvious choices were made
- [`../docs/development.md`](../docs/development.md) — full local setup for both apps together
