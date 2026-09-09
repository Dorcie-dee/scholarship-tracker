# Scholarship OS

Personal (foundation-phase) scholarship and university application management system.

> **Status**: Foundation phase. This proves the core domain model — Application
> Journeys, Applications, Requirements, Tasks, Deadlines, Documents, and a
> production-oriented authentication foundation — end to end. AI, email
> integrations, and agentic features are intentionally not implemented yet. See
> `docs/decisions.md` for why.

## Two independent apps, one parent folder

- **[`backend/`](./backend)**: NestJS + TypeORM + PostgreSQL + Cloudinary
- **[`frontend/`](./frontend)**: Next.js (App Router) + Ant Design + Tailwind CSS + TanStack Query

There is no root `package.json`, no shared `node_modules`, and no shared code between them — each
is a complete, standalone project with its own dependencies, lockfile, `.gitignore`, and
`README.md`. Each has exactly two env files: `backend/` has `.env` (real) + `sample.env`
(committed template); `frontend/` has `.env.local` (real) + `.env.example` (committed template).
Each could be extracted into its own git repository as-is. See
[`docs/decisions.md`](./docs/decisions.md), "Independent repos over a shared types package," for
why, and what the one accepted trade-off is (a couple of small files — enum definitions — are
duplicated between them and kept in sync by hand).

This root level holds only documentation: this file and [`docs/`](./docs), which covers what
concerns *both* apps — architecture spanning the whole system, the domain model, the full API
reference, and decisions that affect both sides.

## Documentation

- [`docs/development.md`](./docs/development.md) — setup, running, testing, migrations (both apps)
- [`docs/architecture.md`](./docs/architecture.md) — stack, request flow, auth flow
- [`docs/domain-model.md`](./docs/domain-model.md) — entities and how they relate
- [`docs/api-reference.md`](./docs/api-reference.md) — endpoints by module
- [`docs/decisions.md`](./docs/decisions.md) — why the non-obvious choices were made
- [`backend/README.md`](./backend/README.md) — backend-specific setup, scripts, structure
- [`frontend/README.md`](./frontend/README.md) — frontend-specific setup, scripts, structure

## Quick start

Each app is installed and run independently — two separate terminals:

```bash
# Terminal 1
cd backend
yarn install
cp sample.env .env
yarn migration:run
yarn seed
yarn start:dev      # http://localhost:8769/api
```

```bash
# Terminal 2
cd frontend
yarn install
cp .env.example .env.local
yarn dev            # http://localhost:3000
```

Both templates (`backend/sample.env`, `frontend/.env.example`) are ready-to-run local defaults
(dev-only secrets, no editing required) — see
[`docs/development.md`](./docs/development.md) for the full walkthrough including database setup.
