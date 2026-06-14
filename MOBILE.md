# dotit — Mobile apps (Capacitor)

dotit ships to the Play Store and App Store as native shells (Capacitor) around the
live web app. The web app stays on Vercel; the native apps load it with a native
splash, status bar, and the dotit icon. App id: **`in.surgesoftware.dotit`**.

## Local commands (Windows — Android only)

| Command | What |
|---|---|
| `npm run icons` | Regenerate app icons + splash from `scripts/gen-icons.mjs` |
| `npm run cap:sync` | Copy config/assets into the native projects |
| `npm run apk:debug` | Build a debug APK to sideload (`android/app/build/outputs/apk/debug/app-debug.apk`) |
| `npm run aab:release` | Build a signed release AAB for the Play Store (needs keystore, below) |
| `npm run cap:android` | Open the project in Android Studio |

Sideload the debug APK: `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`
(or copy the .apk to the phone and tap it; enable "install unknown apps").

## Publish to Google Play (you have the account)

1. **Create an upload keystore** (one time, keep it forever — losing it locks you out of updates):
   `keytool -genkey -v -keystore dotit-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias dotit`
2. Add `android/key.properties` (gitignored) pointing at it, and wire `signingConfigs` in
   `android/app/build.gradle` (or use Play App Signing + an upload key — recommended).
3. `npm run aab:release` → upload the `.aab` in Play Console → Internal testing → fill the
   store listing (icon, screenshots, description, privacy policy URL, Data safety form,
   content rating) → roll out to Internal → Closed → Production.

## Publish to the App Store (needs an Apple Developer account — $99/yr, not yet created)

iOS can't be built on Windows. Two options:
- **Codemagic (set up here, `codemagic.yaml`)** — cloud Mac build, no Mac needed. Connect the
  repo, add the App Store Connect API key + `dotit_asc` integration, and it builds + uploads
  the IPA to TestFlight. It runs `npx cap add ios` on the Mac, so no iOS folder is committed.
- A physical Mac with Xcode: `npm run cap:ios`, then Archive + Distribute in Xcode.

Prerequisite either way: **Apple Developer Program membership** (identity verification takes
1–2 days) and an App Store Connect record for `in.surgesoftware.dotit`.

## Store-review must-haves (both stores)

- **Privacy policy URL** (we have DPDP groundwork in `COMPLIANCE.md` — host it as a page).
- **In-app account deletion** (Apple requires it for any app with sign-in) — add a "Delete
  account" action in Profile that wipes the Supabase user + data.
- **Data safety / privacy nutrition labels** — declare what's collected (birth details, email).
- **Apple "minimum functionality" (4.2):** the app must feel native, not just a website. v1
  uses native splash/status-bar/keyboard; if Apple pushes back, the hardening step is to
  bundle a static export instead of loading the remote URL, and add push notifications.

## Architecture note (v1 → hardening)

v1 = `server.url` loads `innerzenith.vercel.app` in the native WebView (fast, always current,
low risk; great for Play, acceptable for review with native touches). Hardening before App
Store submission: switch `webDir` to a bundled static export of the frontend (API stays on
Vercel, called by absolute URL) so the app works offline and passes Apple cleanly.
