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
- Enable Web Push notifications (iPhone PWA, Android, desktop)
- Confirm rally launch
- Cannot manage rallies or other users

## Quick Start (Local)

```bash
npm install
cp .env.example .env
# Set DATABASE_URL, SESSION_SECRET (32+ chars), VAPID keys
npm run db:deploy   # push schema + seed admin
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
| `ADMIN_USERNAME` | First-deploy admin username |
| `ADMIN_PASSWORD` | First-deploy admin password |

## iPhone PWA

1. Open site in Safari → Add to Home Screen
2. Open installed PWA → Log in
3. Tap **Enable Rally Notifications**
4. Receive alerts when it is your turn to throw

## Architecture

- **PostgreSQL** — users, events, assignments, notification schedule
- **Persistent scheduler** — survives Render restarts; no in-memory-only timers
- **Web Push (VAPID)** — per-caller WARNING_10, WARNING_5, LAUNCH notifications
- **Server clock sync** — NTP-style HTTP + WebSocket for accurate countdowns
- **requestAnimationFrame** countdown — not `setInterval`

Server schedule is exact; push delivery latency depends on OS/browser/network.

## Deploy (Render)

Blueprint in `render.yaml`. Build runs `db:deploy` (schema push + admin seed). Set `SESSION_SECRET` and VAPID keys in the dashboard.
