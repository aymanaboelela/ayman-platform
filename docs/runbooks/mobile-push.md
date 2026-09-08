# Push notifications for the mobile apps

Everything in the repo is wired. What is **not** done is the part that can only
happen in a browser against Google's own consoles: minting the server's FCM
credential and locking down the client API key.

**Status as of 2026-09-08: the Firebase project and both apps exist; the server
has no credential, so nothing sends yet.**

---

## What already exists

| Thing | Value |
|---|---|
| Firebase project | `aymanaboelela-b89c0` (project number `419591641559`) |
| Android app | `1:419591641559:android:ed2b96b9c187f30d801392`, package `com.aymanaboelela.app` |
| iOS app | `1:419591641559:ios:a0aca3c03bca00b2801392`, bundle `com.aymanaboelela.app` |
| Android config | `apps/mobile/android/app/google-services.json` — **committed** |
| iOS config | `apps/mobile/ios/Runner/GoogleService-Info.plist` — **committed** |

Both configs are in git on purpose. They carry an `AIza…` string that looks
like a secret and is not one: Google's documentation is explicit that a
Firebase `apiKey` identifies the project rather than authorising anything, and
both files are compiled into every APK and IPA that ships. Not committing them
means a fresh checkout cannot build, and the usual workaround — a template plus
a manual download — is how two configs end up drifted. `.gitleaks.toml`
allowlists them with the same reasoning written out.

---

## 1. Restrict the client API key — the one real hardening step

Console → **APIs & Services → Credentials → the auto-created Android/iOS keys.**

- **API restrictions:** allow only *Firebase Cloud Messaging API* and
  *Firebase Installations API*. Unrestricted, the same key can call any Google
  API enabled on the project, and it is printed inside every copy of the app.
- **Application restrictions:** Android key → the package name
  `com.aymanaboelela.app` plus the release signing SHA-1. iOS key → the bundle
  id.

Nothing in the app changes when you do this. It is the difference between a key
that identifies the project and a key that can be lifted out of an APK and used
against something else.

## 2. The server credential — this is what makes sends work

FCM's v1 API authenticates with a **service account**, not the client key.

1. Console → **Project settings → Service accounts → Generate new private key.**
   A JSON file downloads. It IS a secret; it never goes in the repo.
2. Put it in the Dokploy Compose app's **Environment** tab, the same place every
   other secret lives, as a single-line variable:

   ```
   FCM_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"aymanaboelela-b89c0",…}'
   ```

3. `docker-compose.yml` must also **forward** it into the container. A variable
   that exists in the environment file but is not listed under `environment:`
   never reaches the process — that exact omission silently broke the admin
   bootstrap once before (commit `c739644`), and the value was set the whole
   time.

## 3. Android SHA-1, for Google Sign-In

Not needed for push, needed for the Google button.

```sh
cd apps/mobile/android && ./gradlew signingReport
```

Take the SHA-1 of the variant you are building and add it in Firebase →
Project settings → Your apps → Android → *Add fingerprint*. Then re-download
`google-services.json` and commit the new one — registering a fingerprint is
what puts an `oauth_client` entry in it, and the file currently has an empty
array there.

⚠️ There are TWO fingerprints in the end: the debug keystore's (for local
builds) and the upload key's (for anything from Play). Adding only the first is
why Google Sign-In works on a developer's machine and fails for every real
user.

## 4. iOS APNs, for push on iPhone

Needs the **paid** Apple Developer membership, which this account does not have
yet.

1. Apple Developer → Certificates, Identifiers & Profiles → **Keys** → new key
   with *Apple Push Notifications service (APNs)* enabled. Download the `.p8`
   — it is downloadable **once**.
2. Firebase → Project settings → **Cloud Messaging** → iOS app → upload the
   `.p8` with its Key ID and your Team ID.
3. `ios/Runner/Runner.entitlements` already declares `aps-environment`, and the
   release variant already overrides it to `production`. Nothing to change.

⚠️ A build carrying `development` in `aps-environment` mints tokens against
Apple's sandbox gateway, and a production send to one comes back
`BadDeviceToken`. That is the classic "push works on my phone and nowhere else"
bug, and the two entitlement files exist to prevent it.

---

## What is left in the code

The app has `firebase_core` and `firebase_messaging` in `pubspec.yaml`, the
notification channel is declared in `AndroidManifest.xml` (with the icon and
accent colour it needs), the iOS `UIBackgroundModes` includes
`remote-notification`, and `POST_NOTIFICATIONS` is declared for Android 13+.

Still to build once the credential above exists:

- device-token registration on the server — `push_subscriptions` currently
  stores WEB-PUSH subscriptions only (endpoint + p256dh + auth), so an FCM
  token needs either a new table or a discriminated column;
- a second transport beside `web-push` in whatever fans notifications out;
- the Dart side: `FirebaseMessaging.instance.getToken()`, the `onTokenRefresh`
  listener, and the tap handler that routes a notification's deep link through
  `AppRoutes`.

`docs/mobile-spec/notifications.md` §4 has the full list with the file names.
