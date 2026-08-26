# Whiteout Rally Timer

Server-authoritative **multi-caller rally coordination** for Whiteout Survival. One shared target arrival time; each caller gets their own launch time based on march duration and gather time.

## Core Equation

```
launchTime = targetArrivalTime - gatherDurationSeconds - marchDurationSeconds
```

Example (target 8:00 PM, gather 5:00):

| Caller | March | Launch |
|--------|-------|--------|
| Alice  | 8:00  | 7:47:00 PM |
| Bob    | 6:30  | 7:48:30 PM |
| Charlie| 4:15  | 7:50:45 PM |
| Dave   | 2:00  | 7:53:00 PM |

All rallies arrive at **8:00:00 PM**.

## Roles

**Admins can be rally callers too** — link an admin account to a caller slot and they receive the same launch alerts. **Not every caller is an admin**; most alliance members only need a caller account.

### Admin
- Create/edit rally events, assign callers, set march times
- Start rally schedule (activates per-caller notifications)
- Manage caller accounts, view notification monitor
- Can also be linked to a caller slot to throw their own rally

### Caller
- Log in, view assigned rallies and personal launch time
- Enable push notifications (Web Push on PWA/desktop, Expo Push on native app)
- Confirm rally launch
- Cannot manage rallies or other users

## Quick Start (Local)

```bash
npm install
cp .env.example .env
# Set DATABASE_URL, SESSION_SECRET (32+ chars), VAPID keys
npm run db:deploy   # apply migrations + seed admin
npm run dev
```

Default admin (first deploy): `admin` / `changeme-admin-123` (override with `ADMIN_USERNAME` / `ADMIN_PASSWORD`).

Verify timing math: `npm run test:timing`

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | JWT session secret (min 32 chars) |
| `VAPID_PUBLIC_KEY` | Web Push public key |
| `VAPID_PRIVATE_KEY` | Web Push private key |
| `VAPID_SUBJECT` | `mailto:` contact URI |
| `PUSH_APP_ORIGIN` | Public HTTPS app origin used when notifications are opened; set this explicitly in production (for example, `https://your-app.onrender.com`) |
| `ADMIN_USERNAME` | First-deploy admin username |
| `ADMIN_PASSWORD` | First-deploy admin password |

## iPhone PWA

1. Open site in Safari → Add to Home Screen
2. Open installed PWA → Log in
3. Tap **Enable Rally Notifications**
4. Receive alerts when it is your turn to throw

## Native caller app (Expo)

Caller-first iOS/Android app in [`mobile/`](mobile/). Uses **Expo SDK 54** (matches App Store Expo Go), Bearer JWT auth, and Expo Push (stored alongside Web Push subscriptions).

**Production API:** `https://whiteout-rally-timer.onrender.com`

```bash
cd mobile
cp .env.example .env   # set EXPO_PUBLIC_API_URL
npm install
npx expo start         # iPhone: Expo Go (SDK 54)
```

| Platform | Remote push |
|----------|-------------|
| iPhone (Expo Go / EAS) | Yes |
| Android with Google Play Services (EAS build) | Yes |
| Android Expo Go | No (SDK 53+) |
| Amazon Fire / Kindle | No — Fire OS lacks Google Play Services; use a normal Android phone or iPhone |

Full setup, EAS builds, FCM, and troubleshooting: [`mobile/README.md`](mobile/README.md).

## Contributing

The repo is public. Fork → branch → PR, or ask for collaborator access. See [CONTRIBUTING.md](CONTRIBUTING.md) for web/mobile setup, EAS access, and **keeping READMEs updated when you change code**.

## Architecture

- **PostgreSQL** — users, events, assignments, notification schedule
- **Persistent scheduler** — survives Render restarts; no in-memory-only timers
- **Web Push (VAPID)** + **Expo Push** — per-caller WARNING / LAUNCH notifications
- **Server clock sync** — NTP-style HTTP + WebSocket for accurate countdowns
- **requestAnimationFrame** countdown — not `setInterval` (web); native app uses 50ms ticks

Server schedule is exact; push delivery latency depends on OS/browser/network.

## Database migrations

Schema changes go through **Prisma Migrate**. Every deploy replays the same reviewed SQL from `prisma/migrations/`.

```bash
# after editing prisma/schema.prisma
npx prisma migrate dev --name describe_your_change   # generates the migration
npm run db:verify                                    # SHADOW_DATABASE_URL required
npm run db:status                                    # what is applied where
```

| Command | Does |
|---------|------|
| `npm run db:deploy` | Apply pending migrations (used by Render build) |
| `npm run db:verify` | Fail if `schema.prisma` has changes with no migration |
| `npm run db:status` | Show applied vs pending migrations |
| `npm run db:push` | **Dev scratch only** — never used in deploy |

Rules:

- **Commit a migration with every `schema.prisma` change.** CI fails otherwise.
- Deploys **never** run `db push --accept-data-loss`. A failed migration fails the build and Render keeps the previous version serving.
- Server startup does not alter the schema; it logs `pending_migrations_detected` if the DB is behind.

Databases created before migrations existed are **baselined** automatically on the next deploy: legacy pre-migrations run, `0_init` is marked as applied, then normal migrations resume. This happens once and preserves existing data.

## Deploy (Render)

Blueprint in `render.yaml`. Build runs `db:deploy` (migrations + admin seed). Set `SESSION_SECRET` and VAPID keys in the dashboard.

Production: `https://whiteout-rally-timer.onrender.com`
