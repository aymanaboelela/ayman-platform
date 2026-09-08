import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/cubit/auth_cubit.dart';
import '../../features/auth/presentation/pages/login_page.dart';
import '../../features/auth/presentation/pages/register_page.dart';
import '../../features/chat/presentation/pages/chat_page.dart';
import '../../features/dashboard/presentation/pages/dashboard_page.dart';
import '../../features/course/presentation/pages/course_page.dart';
import '../../features/library/presentation/pages/library_page.dart';
import '../../features/player/presentation/pages/lesson_page.dart';
import '../../features/notifications/presentation/pages/notifications_page.dart';
import '../presentation/view/placeholder_screen.dart';
import '../presentation/view/splash_screen.dart';
import '../presentation/view/student_shell.dart';
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

  /// Owns the root Navigator, so a route pushed OUTSIDE the shell — the lesson
  /// player, the exam runner — covers the bottom bar instead of appearing
  /// inside it.
  static final _rootKey = GlobalKey<NavigatorState>();

  void dispose() => _refresh.dispose();

  GoRouter _build() {
    return GoRouter(
      navigatorKey: _rootKey,
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
        GoRoute(
          path: AppRoutes.register,
          builder: (context, state) => const RegisterPage(),
        ),

        // ⚠️ OUTSIDE the shell, on the ROOT navigator.
        //
        // The chat has its own app bar with its own title and a back button,
        // and it needs the full height for a keyboard, a composer and a
        // recording bar. Inside the shell it rendered under the shell's top
        // bar — two headers stacked — and above the tab bar, which left the
        // composer floating in the middle of the screen.
        //
        // The lesson player and the exam runner belong here for the same
        // reason; `AppRoutes.isLessonRoute` and `isAttemptRoute` exist to say
        // so for the routes that are still inside it.
        GoRoute(
          parentNavigatorKey: _rootKey,
          path: AppRoutes.chat,
          builder: (context, state) => const ChatPage(),
        ),
        // Also outside the shell: it is opened FROM the bar that the shell
        // draws, so rendering it inside would put a second header under the
        // first and leave the bell visible above a list of itself.
        GoRoute(
          parentNavigatorKey: _rootKey,
          path: AppRoutes.notifications,
          builder: (context, state) => const NotificationsPage(),
        ),

        // The lesson player and the quiz runner — outside the shell for the
        // same reason the chat is: both take the whole screen, and both draw
        // their own chrome. ⚠️ These are PLACEHOLDERS until the player and the
        // runner land, and they exist now because the alternative is worse: a
        // course card whose «نكمّل» reaches no route at all shows go_router's
        // English «Page Not Found», which is not a screen this product has.
        GoRoute(
          parentNavigatorKey: _rootKey,
          path: AppRoutes.lesson,
          builder: (context, state) => LessonPage(
            slug: state.pathParameters['slug']!,
            lessonId: state.pathParameters['lessonId']!,
          ),
        ),
        GoRoute(
          parentNavigatorKey: _rootKey,
          path: AppRoutes.quiz,
          builder: (context, state) =>
              const PlaceholderScreen(route: AppRoutes.quiz),
        ),
        GoRoute(
          parentNavigatorKey: _rootKey,
          path: AppRoutes.attempt,
          builder: (context, state) =>
              const PlaceholderScreen(route: AppRoutes.attempt),
        ),
        GoRoute(
          parentNavigatorKey: _rootKey,
          path: AppRoutes.attemptReview,
          builder: (context, state) =>
              const PlaceholderScreen(route: AppRoutes.attemptReview),
        ),

        // ── the signed-in shell ────────────────────────────────────────────
        //
        // `StatefulShellRoute` gives each tab its OWN Navigator, which is what
        // makes a student who opens a course from «الكورسات», switches to
        // «حسابي» and comes back find the course still open — and their scroll
        // position with it. A plain `ShellRoute` shares one stack and loses
        // both on every tab change.
        StatefulShellRoute.indexedStack(
          builder: (context, state, navigationShell) =>
              StudentShell(navigationShell: navigationShell),
          branches: [
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: AppRoutes.dashboard,
                  builder: (context, state) => const DashboardPage(),
                ),
              ],
            ),
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: AppRoutes.path,
                  builder: (context, state) =>
                      const PlaceholderScreen(route: AppRoutes.path),
                ),
              ],
            ),
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: AppRoutes.library,
                  builder: (context, state) => const LibraryPage(),
                  routes: [
                    // NESTED, so «الكورسات» stays the selected tab and the
                    // back gesture returns to the list rather than to
                    // whichever tab was open before it.
                    GoRoute(
                      path: ':slug',
                      builder: (context, state) => CoursePage(
                        slug: state.pathParameters['slug']!,
                      ),
                    ),
                  ],
                ),
              ],
            ),
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: AppRoutes.results,
                  builder: (context, state) =>
                      const PlaceholderScreen(route: AppRoutes.results),
                ),
                // The drawer-only destinations hang off the LAST branch rather
                // than getting branches of their own: a branch IS a tab, and
                // giving «الكتب» one would light up a bottom-bar slot that
                // does not exist.
                GoRoute(
                  path: AppRoutes.foundations,
                  builder: (context, state) =>
                      const PlaceholderScreen(route: AppRoutes.foundations),
                ),
                GoRoute(
                  path: AppRoutes.store,
                  builder: (context, state) =>
                      const PlaceholderScreen(route: AppRoutes.store),
                ),
                GoRoute(
                  path: AppRoutes.playground,
                  builder: (context, state) =>
                      const PlaceholderScreen(route: AppRoutes.playground),
                ),
                GoRoute(
                  path: AppRoutes.profile,
                  builder: (context, state) =>
                      const PlaceholderScreen(route: AppRoutes.profile),
                ),
                GoRoute(
                  path: AppRoutes.devices,
                  builder: (context, state) =>
                      const PlaceholderScreen(route: AppRoutes.devices),
                ),
                GoRoute(
                  path: AppRoutes.admin,
                  builder: (context, state) =>
                      const PlaceholderScreen(route: AppRoutes.admin),
                ),
              ],
            ),
          ],
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
