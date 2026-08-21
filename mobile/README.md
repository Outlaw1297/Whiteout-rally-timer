# Whiteout Rally — Caller (Expo)

Native iOS/Android caller app for the Whiteout Rally Timer. Reuses the existing web backend (auth, events, WebSocket clock sync, notification scheduler).

**SDK:** Expo **54** (matches Apple App Store Expo Go). SDK 55+ is not on the App Store yet.

## Features (caller-first)

- Login with Bearer JWT (stored in SecureStore)
- Primary rally home with server-synced countdown
- Confirm launch + edit own march (when waiting for GO)
- Expo push registration → server sends WARNING / LAUNCH via Expo Push API
- Warning-lead preferences + change password

Admin GO/reset/templates stay on the web app for now.

## Prerequisites

1. Rally timer backend running (`npm run dev` in repo root) with a reachable URL.
2. **Expo Go from the App Store** (SDK 54).
3. Physical device for real push testing (simulators are limited).
4. Optional later: Expo account + [EAS project](https://docs.expo.dev/eas/) for production push (`extra.eas.projectId` in `app.json`).

## Push notifications (required once)

Expo push needs a real EAS project UUID (not a placeholder):

```bash
cd mobile
npx eas-cli@latest login
npx eas-cli@latest init
```

That writes `extra.eas.projectId` into `app.json`. Restart Expo (`npx expo start -c`), then tap **Enable notifications** in the app.

You can instead set `EXPO_PUBLIC_EAS_PROJECT_ID=<uuid>` in `mobile/.env`.

## Configure

```bash
cd mobile
cp .env.example .env
# Set EXPO_PUBLIC_API_URL to your backend, e.g.
#   https://your-app.onrender.com
#   http://192.168.1.20:3000   (LAN device)
#   http://10.0.2.2:3000       (Android emulator → host)
```

## Run

```bash
npm install
npx expo start
```

If Expo asks to log in, either **Log in** or **Proceed anonymously** is fine for a first smoke test.

Open on your **phone with Expo Go** (scan the QR code). Do not press `w` for web unless you intentionally want the browser target.

### If you see “incompatible with this version of Expo Go”

App Store Expo Go only supports **SDK 54**. This project is pinned to 54 on purpose. If you previously pulled an SDK 57 build of this branch, `git pull` and reinstall:

```bash
git pull
cd mobile
rm -rf node_modules
npm install
npx expo start -c
```

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
