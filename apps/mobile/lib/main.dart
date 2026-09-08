import 'dart:async';

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'core/di/injection_container.dart';
import 'core/localization/localization_manager.dart';
import 'core/presentation/view/ayman_app.dart';

/// ## Startup order, and why it is this order
///
/// 1. `ensureInitialized` — nothing below may touch a platform channel first.
/// 2. `EasyLocalization.ensureInitialized` — loads the translation bundle from
///    disk. Before this, `tr()` returns the KEY, so any widget built earlier
///    would render `auth.login.title` as literal Latin text on an Arabic
///    screen.
/// 3. `initInjection` — warms SharedPreferences so `ThemeCubit` can read the
///    stored theme SYNCHRONOUSLY in its constructor. Doing it after the first
///    frame means one white frame on a dark-mode phone at every cold start.
/// 4. Orientation lock.
/// 5. `runApp`.
///
/// Everything here is awaited on purpose: the native splash stays up until the
/// first Flutter frame, so this work is invisible rather than a blank screen.
Future<void> main() async {
  // `runZonedGuarded` wraps the whole app so an async error that escapes a
  // Future — the kind `FlutterError.onError` never sees — still reaches the
  // reporter instead of vanishing into the console.
  runZonedGuarded(
    () async {
      WidgetsFlutterBinding.ensureInitialized();

      FlutterError.onError = (details) {
        FlutterError.presentError(details);
        _report(details.exception, details.stack);
      };

      // Errors from the engine itself — a platform channel that threw, a
      // plugin that failed to register. Not covered by `FlutterError.onError`.
      PlatformDispatcher.instance.onError = (error, stack) {
        _report(error, stack);
        return true;
      };

      await EasyLocalization.ensureInitialized();
      await initInjection();

      // Portrait only, matching the iOS Info.plist. The one exception is the
      // video player, which requests landscape while a lecture is full-screen
      // and restores this on exit.
      //
      // ⚠️ Not applied on a tablet. `SystemChrome` has no idea what device it
      // is on, so the check lives here rather than in the manifest — and a
      // tablet keeps every orientation, because a tablet on a desk is usually
      // landscape and the Ministry tablets these lectures are watched on are
      // used that way.
      final view = WidgetsBinding.instance.platformDispatcher.views.first;
      final shortestSide = view.physicalSize.shortestSide / view.devicePixelRatio;
      if (shortestSide < 600) {
        await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
      }

      runApp(
        EasyLocalization(
          supportedLocales: AppLocales.supported,
          path: AppLocales.path,
          fallbackLocale: AppLocales.fallback,
          // Forced, not derived from the device. Egyptian students very often
          // run their phone in English, and the CONTENT here is Arabic —
          // English chrome around Arabic lessons is worse than either.
          startLocale: AppLocales.start,
          // One flat JSON per locale, already sorted, ~3600 keys. Loading it
          // at startup costs a few milliseconds and removes every per-screen
          // async lookup.
          useOnlyLangCode: true,
          child: const AymanApp(),
        ),
      );
    },
    _report,
  );
}

/// Where an unhandled error goes.
///
/// In debug it is printed and nothing else — a dialog in front of a developer
/// is noise. In release this is where the diagnostics reporter will post to
/// `/api/diagnostics`, the same endpoint the web's error boundary uses, so a
/// crash on a phone lands in the same admin screen as one in a browser.
void _report(Object error, StackTrace? stack) {
  if (kDebugMode) {
    debugPrint('UNCAUGHT: $error\n$stack');
    return;
  }
  // TODO(diagnostics): POST to /api/diagnostics/report once the reporter
  // service lands. Deliberately a named no-op rather than a silent swallow —
  // see docs/mobile-spec/site-and-misc.md §H for the endpoint's shape.
}
