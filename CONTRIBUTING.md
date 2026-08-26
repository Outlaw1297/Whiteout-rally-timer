# Contributing

Thanks for helping with Whiteout Rally Timer. The repo is public:

**https://github.com/Outlaw1297/Whiteout-rally-timer**

## How to contribute

1. **Fork** the repo (or ask for **Collaborator** access if you're on the core team).
2. Create a branch from `main` (e.g. `feature/caller-settings` or `fix/push-channel`).
3. Make your changes and run tests locally where applicable.
4. Open a **Pull Request** against `main` with a short description of what changed and why.
5. Wait for CI (`test` workflow) to pass before merge.

### Web / backend (`/`)

```bash
npm install
cp .env.example .env
# DATABASE_URL, SESSION_SECRET, VAPID keys
npm run db:deploy
npm run dev
```

See the root [README.md](README.md) for env vars, roles, and Render deploy notes.

### Mobile / Expo (`mobile/`)

```bash
cd mobile
npm install
cp .env.example .env
# EXPO_PUBLIC_API_URL → production or local backend
npx expo start --dev-client   # iOS and Android
```

Development runs against a **development client**, not Expo Go. Build it once
per platform before the first run — see
[mobile/README.md → Development client](mobile/README.md#development-client-first-time-setup).

See [mobile/README.md](mobile/README.md) for EAS builds, FCM, push testing, and device support.

## Access you'll need (by role)

| Goal | GitHub | Expo / EAS | Secrets |
|------|--------|------------|---------|
| Edit code, open PRs | Fork or collaborator | Optional | Your own `.env` only |
| Run Android cloud builds | Read repo | Invite to EAS project | FCM key on EAS (owner uploads) |
| Run iOS TestFlight builds | Read repo | Invite to EAS project | Apple Developer login / ASC API key (EAS can manage) |
| Deploy backend | Merge to `main` | — | Render dashboard / GitHub Actions secrets |

**Do not commit:** Firebase service-account private keys, production JWTs, `SESSION_SECRET`, database URLs, or Render API keys.

`google-services.json` (Firebase client config) is committed for package `com.whiteoutrally.caller` so EAS Android builds work.

## Keeping docs up to date

When you change behavior, **update the docs in the same PR**. This keeps the repo usable for new contributors.

| If you change… | Update… |
|----------------|---------|
| Env vars (web) | `.env.example`, root `README.md` |
| Env vars (mobile) | `mobile/.env.example`, `mobile/README.md`, `mobile/eas.json` / `app.json` if baked into builds |
| API routes or auth | Root `README.md`, `mobile/README.md` (backend contracts table) |
| Push / notifications | Root `README.md`, `mobile/README.md`, inline comments in `src/lib/expo-push.ts` / `mobile/lib/push.ts` |
| EAS profiles, SDK, icons | `mobile/README.md`, `mobile/app.json`, `mobile/eas.json` |
| Roles / caller vs admin UX | Root `README.md` |
| Deploy / Render | `render.yaml`, root `README.md`, `.github/workflows/` comments |
| New top-level feature area | Add or extend the relevant README; link from root `README.md` |

**Checklist before opening a PR:**

- [ ] README(s) still match the code you changed
- [ ] `.env.example` files list any new variables
- [ ] Setup steps still work (paths, commands, SDK version)
- [ ] Known limitations documented (e.g. device support)

## Device support (mobile push)

| Platform | Remote push |
|----------|-------------|
| iPhone / iPad (development client, TestFlight, or EAS build) | Yes (APNs via EAS) |
| Android with Google Play Services (development or preview build) | Yes (FCM via EAS) |
| **Amazon Fire / Kindle** | **No** — Fire OS lacks Play Services; Expo/FCM push will not show banners. Use a Play Store Android or iPhone for push testing. |
| Expo Go | Not used — no Android remote push since SDK 53 |

## Questions

Open a GitHub **Issue** for bugs or feature ideas. For alliance-specific deployment (Render URL, caller accounts), coordinate with the repo owner.
