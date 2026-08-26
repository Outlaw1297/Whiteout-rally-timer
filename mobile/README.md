# Whiteout Rally — Caller (Expo)

Native iOS/Android caller app for the Whiteout Rally Timer. Reuses the existing web backend (auth, events, WebSocket clock sync, notification scheduler).

**SDK:** Expo **54** (matches Apple App Store Expo Go). SDK 55+ is not on the App Store yet.

**Production API:** `https://whiteout-rally-timer.onrender.com`

## Features (caller-first)

- Login with Bearer JWT (stored in SecureStore)
- Primary rally home with server-synced countdown
- Confirm launch + edit own march (when waiting for GO)
- Expo push registration → server sends WARNING / LAUNCH via Expo Push API
- **Local OS alarms** (hybrid) — when a rally is ACTIVE, the app also schedules DATE triggers from your `launchTime` so alerts fire even if remote push is late; remote + local are deduped so you only see one banner
- Warning-lead preferences + change password

Admin GO/reset/templates are available in the **Admin** tab (ADMIN and DEVELOPER roles). User management and developer diagnostics remain on the web app for now.

## Device support

| Platform | Use for dev / test | Remote push |
|----------|--------------------|-------------|
| iPhone | Expo Go (SDK 54), TestFlight, or EAS ad hoc | Yes (APNs via EAS) |
| iPad | TestFlight or EAS ad hoc (`supportsTablet: true`) | Yes (APNs via EAS) |
| Android (Play Store phone/tablet) | EAS **preview** or **development** APK | Yes (FCM) |
| Android Expo Go | UI only | **No** (removed SDK 53+) |
| **Amazon Fire / Kindle** | Not recommended | **No** — Fire OS has no Google Play Services |

## Prerequisites

1. Rally timer backend (Render or local) with a reachable URL.
2. Expo account; EAS project id is in `app.json` → `extra.eas.projectId`.
3. Physical device for push testing (not Fire tablet).
4. For iOS TestFlight / device builds: paid **Apple Developer** account.

## Configure API URL

Local Metro / Expo Go read `mobile/.env`:

```bash
cd mobile
cp .env.example .env
# EXPO_PUBLIC_API_URL=https://whiteout-rally-timer.onrender.com
```

**EAS cloud builds do not upload `.env`** (gitignored). Preview/production APKs get the URL from `eas.json` → `env.EXPO_PUBLIC_API_URL` and `app.json` → `extra.apiUrl` (both default to the Render app). Rebuild after changing those.

Restart Metro after changing `.env` (`npx expo start --dev-client -c`).

## Push: EAS project id (iOS Expo Go + all builds)

Only needed if you create a **new** EAS project. The repo already includes project id `d2a1cc81-7ab9-46c3-9037-93e279eac29f`.

```bash
cd mobile
npx eas-cli@latest login
npx eas-cli@latest init   # skip if using existing project
```

Ask the repo owner for an **Expo org invite** if you need to run cloud builds on the shared project.

## Push: Android FCM (required for EAS / dev builds)

Expo Go on Android **cannot** receive remote push (removed in SDK 53). Use a
**development** or **preview** build. Android also needs Firebase:

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com).
2. Add an **Android** app with package name **`com.whiteoutrally.caller`**.
3. **`google-services.json`** is committed at `mobile/google-services.json` for EAS builds.
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
   npx eas-cli@latest build --profile preview --platform android
   ```

7. Install the new APK, log in, enable notifications in **Settings**.

Guide: [FCM credentials](https://docs.expo.dev/push-notifications/fcm-credentials/).

## Hybrid local notifications

When your assignment is **ACTIVE** with a `launchTime`, the app schedules local OS notifications (warnings + LAUNCH) at the **ideal wall-clock times** using the synced clock (`pushLeadMs: 0`). Remote Expo push remains the backup and still uses delivery-lead compensation on the server.

- Android needs **`SCHEDULE_EXACT_ALARM`** (declared in `app.json`) — rebuild the APK/IPA after this change
- Deduping: remote and local share `assignmentId:notificationType`; only one banner shows
- Logout / disable notifications cancels pending local alarms

Shared schedule math lives in `packages/shared` (`@whiteout/shared`) so web and mobile stay aligned.

## iOS / iPadOS — internal & test releases

Bundle ID: **`com.whiteoutrally.caller`** (must match App Store Connect).

You have two options. Prefer **TestFlight** with your Apple Developer account.

### Option A — TestFlight (recommended)

Best for alliance testers: install via the **TestFlight** app, no UDID list, easy updates.

1. **Apple Developer / App Store Connect**
   - [developer.apple.com](https://developer.apple.com/account/) → enroll (you already have this)
   - [App Store Connect](https://appstoreconnect.apple.com) → **Apps** → **+** → New App
   - Platforms: **iOS** (covers iPhone + iPad when tablet is enabled)
   - Bundle ID: create/select **`com.whiteoutrally.caller`**
   - Name / SKU: e.g. Whiteout Rally / `whiteout-rally`

2. **Build + submit from your Mac** (from `mobile/` on latest `main`):

   ```bash
   cd mobile
   git pull origin main
   npx eas-cli@latest login
   npx eas-cli@latest build --profile production --platform ios
   ```

   First time, EAS will ask to log into Apple and create signing certificates / provisioning. Let it manage credentials.

   When the build finishes:

   ```bash
   npx eas-cli@latest submit --platform ios --latest
   ```

   Or one-shot (build + submit):

   ```bash
   npx testflight
   ```

3. **Invite internal testers**
   - App Store Connect → your app → **TestFlight**
   - Wait until the build finishes **Processing** (email when ready)
   - **Internal Testing** → add yourself / team (up to 100 App Store Connect users)
   - Testers install **TestFlight** from the App Store, accept the invite, install **Whiteout Rally**
   - Log in → **Settings → Enable notifications** (APNs via Expo/EAS)

4. **External testers** (optional, anyone with email)
   - Create an External group → add emails → submit build for **Beta App Review** (first time only)
   - After approval, later builds usually go out faster

**Note:** TestFlight needs a **store** (production) build — not the `preview` ad hoc profile.

### Option B — EAS ad hoc (install from URL)

Install link from Expo, no TestFlight. Each device UDID must be registered **before** the build.

```bash
cd mobile
npx eas-cli@latest device:create   # QR / URL for each iPhone/iPad
npx eas-cli@latest build --profile preview --platform ios
```

Share the build URL from the EAS dashboard. To add a new device later: register it, then **rebuild** (profile includes the new UDID).

### iOS push (APNs)

EAS usually configures APNs when you build/submit with Apple credentials. If push fails on a TestFlight install:

```bash
npx eas-cli@latest credentials
# iOS → production → Push Notifications → set up / regenerate
```

Then rebuild and resubmit.

### Profile cheat sheet

| Goal | Profile | Command |
|------|---------|---------|
| TestFlight / App Store | `production` | `eas build --profile production --platform ios` then `eas submit` |
| Ad hoc install link | `preview` | `eas build --profile preview --platform ios` (+ `eas device:create`) |
| Dev client + Metro | `development` | `eas build --profile development --platform ios` |

## Android preview build checklist

EAS only uploads **committed** files. Before `eas build`:

```bash
cd mobile
git pull origin main

# 1) Icons — assets/icon.png on main
ls -la assets/icon.png

# 2) Firebase client config — committed for cloud builds
ls -la google-services.json

# 3) EAS project id — app.json extra.eas.projectId

# 4) FCM service account — upload via eas credentials (private key, not committed)

npx eas-cli@latest build --profile preview --platform android --clear-cache
```

After install: **uninstall old app** → install new APK → log in → **Settings → Enable notifications** (must say success) → admin presses **GO** on web.

**Preview** builds do not need Metro. **Development** builds need Metro (`npx expo start --dev-client`).

## Run

**iPhone (Expo Go, SDK 54):**
```bash
npx expo start
```

**Android (dev client or preview APK):**
```bash
npx expo start --dev-client   # dev build only
```

Phone and Mac on the same Wi‑Fi, or use `--tunnel` / `adb reverse tcp:8081 tcp:8081`.

## Test push (developer)

With a logged-in JWT:

```bash
export TOKEN="<Bearer token from login>"
curl -sS https://whiteout-rally-timer.onrender.com/api/push/status \
  -H "Authorization: Bearer $TOKEN"
curl -sS -X POST https://whiteout-rally-timer.onrender.com/api/push/test \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

Expect `success: true` and a banner on a **Play Store Android** or **iPhone**. If Expo returns 200 but nothing shows on **Kindle Fire**, that is expected — see Device support above.

Server sends Expo pushes **without** a custom Android `channelId` (uses platform default). The app creates `default` and `rally-alerts` notification channels on register.

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
| `GET /api/push/status` | VAPID + registered devices (auth) |
| `POST /api/push/test` | Send test notification to your devices (auth) |
| `WS /ws` | Live rally + NTP clock sync |

Native tokens are stored as `PushSubscription.endpoint = expo:<token>` and dispatched by the same scheduler as Web Push.

## Sharing with others

| Goal | What to share |
|------|----------------|
| **Contribute code** | GitHub repo + this README; fork or collaborator access |
| **Run cloud builds** | Expo project invite + FCM/APNs on EAS (owner-managed) |
| **Try Android** | EAS **preview** APK download link |
| **Try iPhone / iPad** | TestFlight invite (preferred) or EAS ad hoc install URL |

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full workflow and doc-update checklist.

## Troubleshooting

### EAS iOS “Bundle JavaScript” / Unknown error
Usually Metro resolution. Confirm `mobile/metro.config.js` does **not** set `resolver.disableHierarchicalLookup = true` (that breaks nested deps like `expo-asset`). Sanity-check locally from `mobile/`:

```bash
npx expo export --platform ios --output-dir /tmp/expo-export-test
```

Then rebuild: `npx --yes eas-cli@latest build --platform ios --profile production`.

### Icons did not update
Built from stale `main` or EAS cache. Pull latest, verify `assets/icon.png`, rebuild with `--clear-cache`, reinstall.

### Push does not arrive (Play Store Android / iPhone)
1. Settings → Enable notifications — any error? (Firebase / projectId)
2. Web admin → user has active push device?
3. Rally must be **GO** / active with notifications scheduled
4. Android: disable battery optimization; check notification channel not muted
5. Run `/api/push/test` — if `success: true` but no banner, check device type (not Fire)

### Push on Kindle Fire
Not supported with current Expo/FCM stack. Do not use Fire tablets to validate push.

## Keeping this doc current

When you change mobile behavior, update **this file in the same PR**. See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full mapping (env vars, API routes, EAS profiles, push, etc.).

### iOS layout / bottom cut off
Caller home uses a scrollable rally view plus home-indicator safe-area padding. Confirm stays in a sticky footer above the home bar. Rebuild TestFlight/`preview` after layout changes.
