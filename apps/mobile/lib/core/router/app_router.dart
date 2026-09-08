import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/cubit/auth_cubit.dart';
import '../../features/auth/presentation/pages/login_page.dart';
import '../presentation/view/splash_screen.dart';
import 'routes.dart';

/// The app's navigation, and the one place a signed-out student is stopped.
///
/// ## The redirect mirrors `apps/web/proxy.ts`
///
/// The web enforces the same table on every request in its proxy, and the two
/// have to agree or a deep link that works in a browser dead-ends in the app:
///
///   anonymous,          protected route   → /login
///   anonymous,          /login /register  → stay
///   authed, !onboarded, any protected     → /onboarding
///   authed, !onboarded, /login /register  → /onboarding
///   authed,  onboarded, /onboarding       → /dashboard
///   authed,  onboarded, /login /register  → next ?? /dashboard
///   anything else                          → stay
///
/// ⚠️ Onboarding is NOT part of `/api/session`, so the app cannot decide the
/// middle four rows from [AuthCubit] alone — it needs `GET /api/profile/me`.
/// That read happens once, in the splash, and is cached on the cubit; the
/// redirect below reads the cached answer. Fetching it inside `redirect` would
/// make navigation asynchronous, which GoRouter's redirect cannot be.
class AppRouter {
  AppRouter(this._auth) {
    // GoRouter has no notion of "rebuild when a cubit changes", so the stream
    // is bridged into a Listenable it does understand.
    _refresh = _AuthRefreshListenable(_auth.stream);
    config = _build();
  }

  final AuthCubit _auth;
  late final _AuthRefreshListenable _refresh;
  late final GoRouter config;

  void dispose() => _refresh.dispose();

  GoRouter _build() {
    return GoRouter(
      initialLocation: AppRoutes.splash,
      refreshListenable: _refresh,
      debugLogDiagnostics: false,
      routes: [
        GoRoute(
          path: AppRoutes.splash,
          builder: (context, state) => const SplashScreen(),
        ),
        GoRoute(
          path: AppRoutes.login,
          builder: (context, state) => const LoginPage(),
        ),
      ],
      redirect: _redirect,
    );
  }

  /// Where the student actually ends up.
  ///
  /// Returning `null` means "stay". Every branch that returns a location must
  /// be one the student is NOT already on, or GoRouter loops.
  String? _redirect(BuildContext context, GoRouterState state) {
    final location = state.matchedLocation;
    final authState = _auth.state;

    // Hold on the splash until `/api/session` has answered. This is why
    // `AuthUnknown` is a real state rather than a loading flag: treating it as
    // signed-out would flash the login screen at every returning student on
    // every cold start.
    if (authState is AuthUnknown) {
      return location == AppRoutes.splash ? null : AppRoutes.splash;
    }

    final signedIn = authState is AuthSignedIn;
    final onAuthScreen = location == AppRoutes.login || location == AppRoutes.register;

    if (!signedIn) {
      if (onAuthScreen) return null;
      return AppRoutes.login;
    }

    // Signed in. Leaving the splash or an auth screen means going home; the
    // `next` a deep link carried is honoured here.
    if (location == AppRoutes.splash || onAuthScreen) {
      final next = state.uri.queryParameters['next'];
      return next != null && next.startsWith('/') ? next : AppRoutes.dashboard;
    }

    return null;
  }
}

/// Bridges a cubit's stream to GoRouter's `refreshListenable`.
///
/// Notifies once on construction so the router evaluates its redirect against
/// the CURRENT state rather than waiting for the next emission — without that,
/// an app launched with a session already restored sits on the splash forever.
class _AuthRefreshListenable extends ChangeNotifier {
  _AuthRefreshListenable(Stream<dynamic> stream) {
    notifyListeners();
    _subscription = stream.asBroadcastStream().listen((_) => notifyListeners());
  }

  late final StreamSubscription<dynamic> _subscription;

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }
}
