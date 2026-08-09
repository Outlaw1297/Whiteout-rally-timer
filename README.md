# Whiteout Rally Timer

A Progressive Web App (PWA) for coordinating precisely timed Whiteout Survival rallies with **server-authoritative clock** synchronization.

## Features

- Create, modify, and cancel rallies with exact UTC timestamps
- Live countdown synchronized to server time (not device clock)
- Web Push notifications at T-30, T-10, T-5, T-1, and T+0
- iOS Safari PWA support (Add to Home Screen)
- WebSocket live time sync for drift correction
- Server-side scheduler with restart recovery
- Testing mode for quick rally validation
- Debug panel with notification latency tracking

## Architecture

```
┌─────────────┐     WebSocket (/ws)      ┌──────────────┐
│   Client    │◄──── time_sync ─────────►│ Custom Node  │
│   (PWA)     │                          │   Server     │
│             │     REST API             │              │
│             │◄────────────────────────►│  Scheduler   │
│  SW (push)  │                          │  Web Push    │
└─────────────┘                          └──────┬───────┘
                                                │
                                         ┌──────▼───────┐
                                         │  PostgreSQL  │
                                         └──────────────┘
```

**Important:** The server is the sole authority for rally timing. Client clocks, JavaScript timers, and notification delivery times are never used to determine the official rally start time.

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- PostgreSQL + Prisma ORM
- Web Push (VAPID)
- WebSocket (ws)
- Tailwind CSS
- Custom Node.js server

## Quick Start (Local Development)

### Prerequisites

- Node.js 20+
- PostgreSQL 16+

### Setup

```bash
# Install dependencies
npm install

# Generate PWA icons
npx tsx scripts/generate-icons.ts

# Generate VAPID keys
npm run generate:vapid

# Copy and configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL and VAPID keys

# Push database schema
npm run db:push

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Docker

```bash
# Generate VAPID keys first
npm run generate:vapid

# Set keys in .env or export them
export VAPID_PUBLIC_KEY="your-public-key"
export VAPID_PRIVATE_KEY="your-private-key"

# Start with Docker Compose
docker compose up --build
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | Server port (default: 3000) |
| `HOSTNAME` | Bind address (use `0.0.0.0` for production) |
| `VAPID_PUBLIC_KEY` | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | Web Push VAPID private key (never expose to client) |
| `VAPID_SUBJECT` | mailto: or https: contact URI |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/time` | Server time (supports NTP-style offset via `x-client-send-time` header) |
| GET | `/api/health/time` | Server time + NTP sync status |
| GET/POST | `/api/rallies` | List/create rallies |
| GET/PATCH/DELETE | `/api/rallies/[id]` | Get/modify/cancel rally |
| GET/POST | `/api/push/subscribe` | Get VAPID key / subscribe to push |
| POST | `/api/push/unsubscribe` | Unsubscribe from push |
| WS | `/ws` | WebSocket time sync |

## iOS PWA Setup

1. Open the app in Safari on iPhone/iPad
2. Tap Share → "Add to Home Screen"
3. Open the installed PWA
4. Navigate to a rally page
5. Tap **"Enable Rally Notifications"** (must be a user gesture)
6. Allow notifications when prompted

**Note:** iOS Web Push requires iOS 16.4+ and the app must be installed to the Home Screen. Push notification delivery is best-effort — the server's rally timestamp is exact, but Apple controls notification delivery timing.

## Testing Mode

On the home page, use the testing buttons to create rallies starting in 5, 10, 30, or 60 seconds. The debug panel on the rally page shows scheduled and actual notification timestamps with latency.

## Production Deployment

### Server Clock

The production server **must** use NTP time synchronization. Verify with:

```bash
timedatectl status
```

The `/api/health/time` endpoint reports NTP sync status.

### Render Deployment

1. Create a PostgreSQL database on Render
2. Create a Web Service from this repo
3. Set environment variables (DATABASE_URL, VAPID keys)
4. Build command: `npm install && npx tsx scripts/generate-icons.ts && npx prisma generate && npm run build`
5. Start command: `npx prisma db push && npx tsx server.ts`
6. Bind to `0.0.0.0:$PORT`

### Security Notes

- VAPID private keys are server-side only
- API endpoints are rate-limited
- Rally IDs are validated as UUIDs
- Client-provided timestamps are never trusted as server time
- Expired push subscriptions (HTTP 404/410) are automatically deactivated

## Notification Messages

| Event | Message |
|-------|---------|
| T-30 | ⚔️ Rally in 30 seconds |
| T-10 | ⚔️ Rally in 10 seconds |
| T-5 | ⚔️ Rally in 5 seconds |
| T-1 | ⚔️ RALLY IN 1 SECOND |
| T+0 | ⚔️ RALLY NOW |

## License

MIT
