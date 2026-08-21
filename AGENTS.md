# AGENTS.md

## Cursor Cloud specific instructions

This repo has two services. Standard commands live in `README.md`, `mobile/README.md`, and `package.json` scripts — the notes below only cover Cloud-specific caveats.

### Services

- **Web app (primary):** Next.js on a custom server (`server.ts`, run via `tsx`) with WebSocket clock sync + a persistent notification scheduler. Serves on `http://localhost:3000`. Backed by PostgreSQL via Prisma.
- **Mobile caller app:** Expo/React Native in `mobile/` (Metro bundler on `http://localhost:8081`).

### PostgreSQL (required for the web app)

- PostgreSQL 16 is installed in the base image but the cluster is **not auto-started** on boot. Start it each session:
  - `sudo pg_ctlcluster 16 main start`
- Local DB/role are `rally_timer` / `rally` (password `rally`), matching `DATABASE_URL` in `.env.example`.
- `.env` is gitignored (persisted in the environment snapshot, not in git). If missing, `cp .env.example .env` — its defaults already point at the local Postgres.
- On a fresh database, run `npm run db:deploy` to push the Prisma schema and seed the initial admin. Default login: `admin` / `changeme-admin-123` (this account is seeded with the `DEVELOPER` role).
- Non-obvious: `npm run db:deploy` prints a couple of `Environment variable not found: DATABASE_URL` warnings for its in-process migration/VAPID steps. These are non-fatal — the `prisma db push` and admin seed still succeed (Prisma auto-loads `.env`).

### Running the web app

- Dev: `npm run dev` (this is `tsx watch server.ts`). Do **not** use `next dev` — the app relies on the custom server for WebSockets and the scheduler.
- In development, `SESSION_SECRET` falls back to a built-in dev value and VAPID keys are auto-generated and persisted in the DB, so those env vars are optional locally.

### Running the mobile app

- Install deps with `npm install --legacy-peer-deps` (there are React/React Native peer-dep conflicts; a plain `npm install` fails).
- `mobile/.env` sets `EXPO_PUBLIC_API_URL` (defaults to `http://localhost:3000`).
- Start Metro with `npx expo start`. Real push delivery requires a physical device (per `mobile/README.md`); in the VM you can verify Metro boots (`GET http://localhost:8081/status` → `packager-status:running`) and run `npm run typecheck`.

### Tests / build / lint

- Test scripts (`npm run test:timing`, `test:live-board`, `test:device-id`, `test:activity-log`, `test:push-worker`, `test:expo-push`) are pure logic and need **no** database. CI (`.github/workflows/ci.yml`) runs the first four.
- Build: `npm run build` (`prisma generate && next build`).
- There is no ESLint/lint script; use `tsc --noEmit` (mobile: `npm run typecheck`) for static checks.
