# Whiteout Rally Timer

Server-authoritative rally coordination for **Whiteout Survival**. One player creates and starts a rally; alliance members receive push alerts on iPhone/iPad even when the PWA is backgrounded or the phone is locked.

**Live demo:** https://whiteout-rally-timer.onrender.com/

## How It Works

### Rally Controller
1. Enter rally name → **Create Rally**
2. Share the rally link with your alliance
3. Choose countdown (5 / 10 / 30 / 60 seconds)
4. Press **START RALLY** — the **server** sets the official UTC timestamp
5. Watch the live server-synced countdown

### Rally Participant
1. Open the shared `/rally/[id]` link
2. Tap **Enable Rally Alerts**
3. Receive push notifications at T-30, T-10, T-5, T-1, and T+0
4. See live countdown if the page is open (uses server time, not phone clock)

## Important Timing Notes

- The **server rally timestamp is exact** (millisecond UTC precision)
- **Push notifications are advance alerts** — Apple controls delivery timing
- Multiple alerts (30s, 10s, 5s, 1s, 0s) provide redundancy
- The open-page countdown uses NTP-style clock sync + WebSocket drift correction
- Push delivery cannot be guaranteed at an exact millisecond on iOS

## Rally States

| State | Meaning |
|-------|---------|
| `READY` | Created, waiting for controller to press START |
| `ACTIVE` | Started, countdown running, notifications scheduled |
| `COMPLETED` | Rally time reached |
| `CANCELLED` | Cancelled by controller |

## Tech Stack

- Next.js 14, TypeScript, Tailwind CSS
- PostgreSQL + Prisma ORM
- Custom Node.js server (WebSocket + scheduler)
- Web Push (VAPID) — no Firebase
- Service Worker for push handling

## Local Development

### Prerequisites
- Node.js 20+
- PostgreSQL 16+

### Setup

```bash
npm install
npx tsx scripts/generate-icons.ts
npm run generate:vapid
cp .env.example .env
# Add DATABASE_URL and VAPID keys to .env
npm run db:push
npm run dev
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | Server port (default 3000) |
| `HOSTNAME` | Bind address (`0.0.0.0` for production) |
| `VAPID_PUBLIC_KEY` | Web Push public key |
| `VAPID_PRIVATE_KEY` | Web Push private key (server only) |
| `VAPID_SUBJECT` | `mailto:` contact URI |

## iPhone PWA Setup

1. Open https://whiteout-rally-timer.onrender.com/ in **Safari**
2. Tap **Share → Add to Home Screen**
3. Open the installed PWA
4. Join a rally link and tap **Enable Rally Alerts**
5. Allow notifications when prompted (requires iOS 16.4+)

Notifications work when the PWA is backgrounded, the phone is locked, or you're in another app. The service worker handles push — no background JavaScript timers.

## Testing Procedure

Use the **Testing Mode** buttons on the home page (5s / 10s / 30s / 60s). These use the **same production code path** as manual rallies:

1. Create rally → server sets `READY`
2. Auto-start with chosen delay → server sets `rallyTime = serverNow + delay`
3. Scheduler fires T-30 through T+0 push notifications
4. Debug panel shows scheduled vs sent timestamps and scheduler latency

### What to verify
- Countdown matches server time (check Debug page offset)
- Notifications arrive (best-effort on iOS)
- WebSocket reconnect does not reset countdown to local clock
- Server restart recovers pending notifications (within recovery window)
- No duplicate notifications (DB flags prevent this)

## Render Deployment

Blueprint: `render.yaml` (web service + PostgreSQL)

```bash
# One-click deploy
open "https://dashboard.render.com/blueprint/new?repo=https://github.com/Outlaw1297/Whitout-rally-timer"
```

Set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in the Render dashboard.

Build: `npm ci --include=dev && npx tsx scripts/generate-icons.ts && npx prisma generate && npm run build`  
Start: `npx prisma db push && npx tsx server.ts`

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/time` | Server time (NTP sync with `x-client-send-time` header) |
| GET | `/api/health/time` | Server time + NTP status |
| POST | `/api/rallies` | Create rally (name only → `READY`) |
| POST | `/api/rallies/:id/start` | **Server sets rally timestamp** |
| GET/PATCH/DELETE | `/api/rallies/:id` | Get / rename / cancel |
| GET/POST | `/api/push/subscribe` | VAPID key / subscribe |
| WS | `/ws` | Time sync + rally updates |

## License

MIT
