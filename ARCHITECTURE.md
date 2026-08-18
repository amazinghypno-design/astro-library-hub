# Architecture — Astro Library Hub

Greenfield build. No existing source project reference was found on disk, so this is a clean start guided by `../Astro-Library-Hub-Claude-Code-Manual/`.

## Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | React + TypeScript + Vite + Tailwind CSS | Fast local dev, static-deployable build output, good Thai font support via system/Google fonts |
| API | Node.js + Express + tRPC | Typed procedures end-to-end, no separate REST/Axios layer, matches manual's stated boundary |
| Domain | Plain TypeScript pure functions (`server/src/domain/`) | Testable without network/DB; used by API and by unit tests directly |
| Database | SQLite (file) via `better-sqlite3` + Drizzle ORM | Zero external account, zero network dependency for local dev; Drizzle makes a later move to managed Postgres a schema-only change |
| Object storage | Local filesystem adapter (`server/src/storage/local.ts`) behind a `StorageAdapter` interface | No file bytes in DB row; adapter can be swapped for R2/Supabase Storage later without touching domain/UI |
| Auth | Session cookie + local admin credential (`server/src/auth/local.ts`) behind a `getCurrentUser`/`requireRole` interface | No OAuth provider account exists yet; interface is provider-neutral so real OAuth can replace it later |
| Tests | Vitest | Works with Vite + TS out of the box, fast |
| Package manager | npm workspaces | Already installed on this machine; functionally equivalent to the manual's `pnpm` examples |

## Repo layout

```
Astro-Library-Hub/
  client/            React app (Vite)
    src/
  server/
    src/
      domain/         pure functions: publication policy, duplicate predicate, preview classification, safe key
      db/             Drizzle schema + migrations + query helpers (db.ts)
      storage/         StorageAdapter interface + local filesystem implementation
      auth/            auth adapter interface + local credential implementation
      routers/        tRPC routers (routers.ts) — API/policy boundary
      index.ts         Express + tRPC server entry
    data/              gitignored: sqlite file
    storage/           gitignored: uploaded file bytes (local adapter root)
  todo.md
  ARCHITECTURE.md
  DECISIONS.md
  .env.example
```

## Adapter boundaries (must not leak into domain/UI)

- `StorageAdapter`: `put(key, bytes) / get(key) / delete(key) / createDownloadUrl(key, filename) / createPreviewUrl(key)`
- `AuthAdapter`: `getCurrentUser(req) / requireRole(role)`

Swapping either adapter must not require changes to `domain/`, `routers.ts` business logic, or any page in `client/src`.

## Entities (Phase 1 will formalize as Drizzle schema)

`User`, `Category`, `LibraryFile`, `AIWorkItem`, `AIWorkItemEvent` — fields per `01-guides/DATA-AND-API-CONTRACT.md` and `01-guides/PROJECT-SPECIFICATION.md` section 9.

## What Phase 0 deliberately does not do

No UI, no schema migration, no upload code yet. Phase 1 starts only after this file, `DECISIONS.md`, `todo.md`, and `.env.example` are reviewed.
