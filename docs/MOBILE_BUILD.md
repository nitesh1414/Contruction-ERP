# Mobile App — Build & Release Guide

The mobile app lives in [`mobile/`](../mobile) — React Native (0.81) on **Expo SDK 54**, TypeScript, React Navigation 7.

Capabilities used: `expo-camera` (site photos), `expo-location` (GPS geo-tags), `expo-notifications` (push alerts), `expo-image-picker`, AsyncStorage offline queue, NetInfo auto-sync.

---

## 1. Run in development (fastest)

```bash
cd mobile
npm install
cp .env.example .env      # EXPO_PUBLIC_API_URL → reachable backend URL
npx expo start
```

- **Expo Go** (Android/iOS): scan the QR code. Phone and computer must share the network; use your LAN IP in `EXPO_PUBLIC_API_URL`.
- **Android emulator**: `npx expo start --android` (backend URL `http://10.0.2.2:4000`).
- **iOS simulator** (macOS): `npx expo start --ios`.

> Push notifications only register on physical devices (Expo limitation); camera/GPS work in Expo Go out of the box.

## 2. Configure for a specific backend

Resolution order (see `src/config.ts`):

1. `EXPO_PUBLIC_API_URL` env var (`.env` or shell)
2. `app.json → expo.extra.apiUrl`
3. Auto-derived from the Expo dev-server host, port 4000

For **production builds** always set `expo.extra.apiUrl` (or the env var at build time — EAS builds read `EXPO_PUBLIC_*` env vars from `eas.json` → `env`) to your public API, e.g. `https://api.your-domain.com`.

## 3. Native builds with EAS Build (recommended)

One-time setup:

```bash
npm install -g eas-cli
cd mobile
eas login                      # free Expo account
eas build:configure            # eas.json is already included — confirm
```

Register the real EAS project id in `app.json → expo.extra.eas.projectId` (needed for push tokens).

### Android APK (sideload / internal distribution)

```bash
eas build --platform android --profile preview     # → downloadable .apk
```

The `preview` profile (`eas.json`) produces an APK you can install directly on site engineers' phones.

### Android AAB (Play Store)

```bash
eas build --platform android --profile production  # → .aab for Play Console
eas submit --platform android                      # optional: uploads to Play
```

### iOS IPA (App Store / TestFlight)

Requires an Apple Developer account ($99/yr):

```bash
eas build --platform ios --profile production      # → .ipa
eas submit --platform ios                          # uploads to App Store Connect
```

For a simulator build set `"ios": { "simulator": true }` on a custom profile.

### iOS without a Mac

EAS Build compiles iOS apps on Expo's macOS runners — no local Mac or Xcode needed. You still export/distribute via App Store Connect.

## 4. Local builds (no EAS)

```bash
cd mobile
npx expo prebuild                 # generates android/ and ios/ native projects

# Android — debug APK
cd android && ./gradlew assembleDebug
#   output: android/app/build/outputs/apk/debug/app-debug.apk
# Android — release (needs a signing keystore)
./gradlew assembleRelease

# iOS (macOS only) — open ios/*.xcworkspace in Xcode, select team, Archive
```

Keystore for Android release signing:

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore construction-erp.keystore \
  -alias construction-erp -keyalg RSA -keysize 2048 -validity 10000
```

Keep the keystore + passwords safe; add them to `android/gradle.properties` as `MYAPP_UPLOAD_STORE_FILE` etc.

## 5. Over-the-air updates

JS-only fixes can ship instantly to installed apps:

```bash
eas update --channel production --message "Fix progress photo meta"
```

(`eas.json` defines `development` / `preview` / `production` channels.)

## 6. Push notifications in production

1. Build via EAS (push needs a `google-services.json` FCM credential for Android and an APNs key for iOS — `eas credentials` manages both).
2. Set `expo.extra.eas.projectId` to your real project id.
3. The app registers its token at login (`POST /api/notifications/push-token`); the backend stores it in `user_push_tokens` and publishes through Expo's push service.

## 7. Offline behaviour (how it works)

- Every progress report / issue raised without connectivity gets a **`client_ref`** and is persisted to an AsyncStorage queue with its photos.
- A badge on the **More → Offline sync queue** screen shows pending count; **Sync now** retries immediately.
- When NetInfo reports connectivity restored, the queue **auto-syncs** in the background.
- The server dedupes on `client_ref`, so retries after a mid-upload failure never double-post.

## 8. Release checklist

- [ ] `expo.extra.apiUrl` points at the production API (HTTPS)
- [ ] Real `eas.projectId` set; `eas credentials` configured (FCM + APNs)
- [ ] `version` bumped in `app.json`; `runtimeVersion`/channels correct
- [ ] Icons/splash replaced with final brand artwork (`mobile/assets/`)
- [ ] App tested on a low-end Android device on 3G (offline → online sync)
- [ ] Privacy strings (camera/location) reviewed in `app.json` — already provided
