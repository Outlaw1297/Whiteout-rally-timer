# Whiteout Rally — Caller (Expo)

Native iOS/Android caller app for the Whiteout Rally Timer. Reuses the existing web backend (auth, events, WebSocket clock sync, notification scheduler).

## Features (caller-first)

- Login with Bearer JWT (stored in SecureStore)
- Primary rally home with server-synced countdown
- Confirm launch + edit own march (when waiting for GO)
- Expo push registration → server sends WARNING / LAUNCH via Expo Push API
- Warning-lead preferences + change password

Admin GO/reset/templates stay on the web app for now.

## Prerequisites

1. Rally timer backend running (`npm run dev` in repo root) with a reachable URL.
2. Expo account + [EAS project](https://docs.expo.dev/eas/) for production push (set `extra.eas.projectId` in `app.json`).
3. Physical device for real push testing (simulators are limited).

## Configure

```bash
cd mobile
cp .env.example .env
# Set EXPO_PUBLIC_API_URL to your backend, e.g.
#   https://your-app.onrender.com
#   http://192.168.1.20:3000   (LAN device)
#   http://10.0.2.2:3000       (Android emulator → host)
```

Replace `REPLACE_WITH_EAS_PROJECT_ID` in `app.json` after `eas init`.

## Run

```bash
npm install --legacy-peer-deps
npx expo start
```

Scan the QR code with Expo Go (dev), or build a dev client / store build with EAS for reliable push.

## Backend contracts used

| Endpoint | Purpose |
|----------|---------|
| `POST /api/auth/login` | Returns `{ user, token }` |
| `GET /api/auth/me` | Bearer session |
| `GET /api/events`, `GET /api/events/:id` | Rally data |
| `POST /api/assignments/:id/confirm-launch` | Confirm throw |
| `PATCH /api/events/:id/assignments/:assignmentId` | Own march |
| `POST /api/push/native-subscribe` | Register Expo push token |
| `POST /api/push/unsubscribe` | Disable this device |
| `POST /api/push/receipt` | Delivery calibration |
| `WS /ws` | Live rally + NTP clock sync |

Native tokens are stored as `PushSubscription.endpoint = expo:<token>` and dispatched by the same scheduler as Web Push.
