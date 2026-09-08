import 'package:flutter/foundation.dart';

/// Which backend this build talks to, and everything that follows from it.
///
/// Selected at COMPILE time via `--dart-define=APP_ENV=…`, never at runtime.
/// A production build that can be pointed at a developer's laptop by anything
/// a user can reach is a data-exfiltration primitive, and a debug menu that
/// switches origins is exactly that.
///
/// ```sh
/// flutter run --dart-define=APP_ENV=dev
/// flutter build apk --release --dart-define=APP_ENV=prod
/// ```
enum AppFlavor {
  /// The API on this machine. `10.0.2.2` is the Android emulator's alias for
  /// the host loopback; a physical device needs `--dart-define=API_ORIGIN=…`
  /// with the machine's LAN address instead.
  dev,

  /// aymanaboelela.com.
  prod,
}

/// The one place a URL, a client id or a timeout is written down.
abstract final class AppEnvironment {
  static const _rawFlavor = String.fromEnvironment('APP_ENV', defaultValue: 'prod');

  static final AppFlavor flavor = switch (_rawFlavor) {
    'dev' => AppFlavor.dev,
    _ => AppFlavor.prod,
  };

  static bool get isDev => flavor == AppFlavor.dev;
  static bool get isProd => flavor == AppFlavor.prod;

  /// The ORIGIN, with no trailing slash and no `/api`.
  ///
  /// Production is the web app's own origin rather than the API's, because
  /// `apps/web/next.config.ts` rewrites `/api/:path*` server-side to the Nest
  /// process. There is no public hostname for the API itself, and
  /// `BETTER_AUTH_URL` is set to `APP_URL` in production for the same reason —
  /// so the session cookie's domain and the callback URLs all agree.
  ///
  /// ⚠️ In DEV they are two different ports: 3200 is Next, 3300 is Nest, and
  /// `BETTER_AUTH_URL` points at 3300 directly. Talking to 3200 in dev works
  /// for `/api/*` (the rewrite is there too) but the OAuth callback would be
  /// registered against the wrong origin, so the app targets Nest directly.
  static String get apiOrigin {
    const override = String.fromEnvironment('API_ORIGIN');
    if (override.isNotEmpty) return _stripTrailingSlash(override);
    return switch (flavor) {
      AppFlavor.dev => 'http://10.0.2.2:3300',
      AppFlavor.prod => 'https://aymanaboelela.com',
    };
  }

  /// Everything in the HTTP layer is namespaced under this, with exactly one
  /// exception: `GET /media/:prefix/:name` is deliberately NOT under `/api`,
  /// so that attacker-uploaded bytes never come back on the app origin.
  static String get apiBaseUrl => '$apiOrigin/api';

  /// Where uploaded media is served from — a DIFFERENT origin to the app on
  /// purpose. The API asserts at boot that the two are not the same.
  static String get mediaOrigin {
    const override = String.fromEnvironment('MEDIA_ORIGIN');
    if (override.isNotEmpty) return _stripTrailingSlash(override);
    return switch (flavor) {
      AppFlavor.dev => 'http://10.0.2.2:3300',
      AppFlavor.prod => 'https://media.aymanaboelela.com',
    };
  }

  /// The public URL of an uploaded file, from its storage key.
  ///
  /// The mobile twin of `mediaUrl()` in `packages/ui/src/lib/branding.ts`, and
  /// it must stay the same shape: `${mediaOrigin}/media/${key}`.
  ///
  /// ⚠️ NOT under `/api`, and NOT on the app origin. Attacker-uploaded bytes
  /// come back on a different host on purpose, and the API asserts at boot
  /// that the two origins differ.
  ///
  /// Public — no bearer token. A private attachment goes through the API and
  /// `AuthenticatedImage` instead.
  static String mediaUrl(String storageKey) => '$mediaOrigin/media/$storageKey';

  /// The public site, for the handful of surfaces the app links out to rather
  /// than reimplements (terms, privacy, a news article's canonical URL).
  static String get siteUrl => switch (flavor) {
    AppFlavor.dev => 'http://10.0.2.2:3200',
    AppFlavor.prod => 'https://aymanaboelela.com',
  };

  /// The Google **Web** OAuth client id, passed to `google_sign_in` as
  /// `serverClientId`.
  ///
  /// ⚠️ Deliberately the WEB client id, not the Android or iOS one. better-auth
  /// verifies the `id_token`'s `aud` claim against the `GOOGLE_CLIENT_ID` the
  /// server is configured with, and that is the web client. Asking the native
  /// SDK for a token minted for the platform client would produce an `aud` the
  /// server rejects with `INVALID_TOKEN`, which surfaces as a generic sign-in
  /// failure and is almost impossible to diagnose from the app side.
  ///
  /// Empty until the OAuth client exists (`docs/runbooks/google-sign-in.md`
  /// records that it does not yet). The sign-in button hides itself rather
  /// than 404ing when this is blank — see `SocialAuthAvailability`.
  static const googleServerClientId = String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID');

  /// The Apple **Services ID**, which is what the server's `APPLE_CLIENT_ID`
  /// holds — not the app's bundle id.
  ///
  /// On a native Sign in with Apple the `aud` of the returned identity token is
  /// the BUNDLE ID, so the server must accept both. Until that is configured,
  /// `sign_in_with_apple` is wired but the button stays hidden.
  static const appleServiceId = String.fromEnvironment('APPLE_SERVICE_ID');

  /// Whether the pretty request/response logger is installed.
  ///
  /// Never in a release build regardless of flavour: the logger prints
  /// `Authorization` headers and full response bodies, and a release build's
  /// logs are readable by any app on a rooted device.
  static bool get verboseNetworkLogs => kDebugMode;

  static const Duration connectTimeout = Duration(seconds: 20);

  /// Generous on purpose. Egyptian mobile data drops to EDGE in stretches of
  /// Upper Egypt, and a lesson outline with fifty rows on a 40 kbps link takes
  /// longer than the 10s a Flutter developer would reach for first. The UI
  /// shows progress rather than failing early.
  static const Duration receiveTimeout = Duration(seconds: 45);

  /// Uploads get their own, much longer, budget: a homework photo or a
  /// two-minute voice note on a slow uplink genuinely takes minutes.
  static const Duration uploadTimeout = Duration(minutes: 5);

  static String _stripTrailingSlash(String value) =>
      value.endsWith('/') ? value.substring(0, value.length - 1) : value;
}
