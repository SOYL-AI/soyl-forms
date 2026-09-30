# Android app: release runbook

The Android app (`com.soylai.forms`) is a Capacitor 8 shell that loads the live
site. Web changes reach the app on deploy; you only ship a new app build when
native things change (plugins, icons, permissions, Capacitor upgrades).

The site address lives in **`capacitor.app.json`** (`appUrl`). Change it there
only; `capacitor.config.ts`, the offline screen and the Android App Links all
read it.

## One-time setup

### 1. Upload key (keep it forever)
```bash
keytool -genkeypair -v -keystore soyl-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```
Put `soyl-upload.jks` in `android/`, back it up somewhere safe (password manager
plus offline copy), then create `android/keystore.properties`:
```properties
storeFile=soyl-upload.jks
storePassword=…
keyAlias=upload
keyPassword=…
```
Both files are git-ignored. **Never commit them.**

### 2. Supabase: allow the app's Google sign-in return
Authentication → URL Configuration → Redirect URLs → add:
```
com.soylai.forms://auth/callback
```

### 3. App Links fingerprints (after the first upload to Play)
Play Console → Test and release → App integrity → App signing: copy the
**SHA-256** of the *App signing key* (and of the *Upload key* if you sideload
test builds). In Vercel set, comma-separated:
```
ANDROID_CERT_SHA256=AA:BB:…,CC:DD:…
```
Redeploy, then check
`https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://forms.soylai.com`.

## Every release
```bash
npm run cap:sync
cd android
./gradlew bundleRelease -PversionCode=2 -PversionName=1.0.1   # versionCode must go up every upload
```
Upload `android/app/build/outputs/bundle/release/app-release.aab` in Play Console.

Requires JDK 21 (Android Studio's bundled `jbr` works) and Android SDK platform 36.

## How the app differs from the website (lib/native.ts)
- **No purchases in the app** (Play payments policy). Purchase UI is tagged
  `native-hide`; `/`, `/pricing`, `/features` redirect to `/dashboard`,
  `/billing/credits` to `/billing` (middleware.ts).
- **Google sign-in** opens in the system browser and returns via
  `com.soylai.forms://auth/callback` (lib/native-auth.ts, components/NativeBridge.tsx).
- **Downloads** (CSV export, QR codes) go to the share sheet (lib/save-file.ts).
- **Offline**: `capacitor/www-template/error.html` is shown when the site can't load.

## Play Console answers (for reference)
- **Account deletion URL**: `https://forms.soylai.com/delete-account` (in-app: Account → Delete account).
- **Privacy policy**: `https://forms.soylai.com/privacy`.
- **Data safety**: collects name and email (account), user content (forms, responses, uploaded files, brand assets), app interactions (usage counts); encrypted in transit; users can request deletion; not sold or shared for ads. Payments happen on the website, not in the app.
- **App access**: provide a reviewer login (email + password) with a workspace that has at least one published form.
- **Target audience**: 18+. **Ads**: none.
