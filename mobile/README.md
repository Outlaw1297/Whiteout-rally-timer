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

1. Rally timer backend (Render or local) with a reachable URL.
2. Expo account + EAS project (`npx eas init` in `mobile/`).
3. Physical device for push testing.

## Configure API URL

```bash
cd mobile
cp .env.example .env
# Point at Render (recommended):
# EXPO_PUBLIC_API_URL=https://whiteout-rally-timer.onrender.com
```

Restart Metro after changing `.env` (`npx expo start --dev-client -c`).

## Push: EAS project id (iOS Expo Go + all builds)

```bash
cd mobile
npx eas-cli@latest login
npx eas-cli@latest init
```

## Push: Android FCM (required for EAS / dev builds)

Expo Go on Android **cannot** receive remote push (removed in SDK 53). Use a
**development build**. Android also needs Firebase:

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com).
2. Add an **Android** app with package name **`com.whiteoutrally.caller`**.
3. Download **`google-services.json`** → place it at `mobile/google-services.json`
   (`app.json` already points `android.googleServicesFile` here).
4. Firebase → Project settings → **Service accounts** → **Generate new private key**.
5. Upload that JSON to EAS (do **not** commit it):

   ```bash
   cd mobile
   npx eas-cli@latest credentials
   # Android → (development or production) → Google Service Account
   # → FCM V1 → Upload a new service account key
   ```

   Or: [expo.dev](https://expo.dev) → your project → Credentials → Android → FCM V1.

6. **Rebuild** the Android app (Firebase is baked into the native binary):

   ```bash
   npx eas-cli@latest build --profile development --platform android
   ```

7. Install the new APK, start Metro, enable notifications again:

   ```bash
   npx expo start --dev-client -c
   ```

Guide: [FCM credentials](https://docs.expo.dev/push-notifications/fcm-credentials/).

## Run

**iPhone (Expo Go, SDK 54):**
```bash
npx expo start
```

**Android (dev client):**
```bash
npx expo start --dev-client
```

Phone and Mac on the same Wi‑Fi, or use `--tunnel` / `adb reverse tcp:8081 tcp:8081`.

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
