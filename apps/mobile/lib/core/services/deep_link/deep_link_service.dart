import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart';

import '../../router/routes.dart';

/// Turns an incoming link into an in-app route.
///
/// ## Why the raw URI cannot go to the router
///
/// A link arrives as a whole URI — `aymanapp://quizzes/<id>` or
/// `https://aymanaboelela.com/library/algebra` — and go_router matches PATHS.
/// Handing it the URI unchanged produces «no routes for location:
/// aymanapp://quizzes/…» and go_router's own English "Page Not Found", which
/// is not a screen this product has. Measured on the emulator: every deep link
/// landed there.
///
/// ## What it refuses
///
/// A path the app deliberately does not implement — the marketing home, the
/// catalogue, the legal pages — resolves to NULL rather than to a 404 screen.
/// Those belong in a browser, which is where the caller sends them.
class DeepLinkService {
  DeepLinkService({AppLinks? links}) : _links = links ?? AppLinks();

  final AppLinks _links;
  StreamSubscription<Uri>? _subscription;

  /// The link the app was cold-started with, already normalised. Null when it
  /// was launched from its icon — which is almost always.
  Future<String?> initialRoute() async {
    try {
      final uri = await _links.getInitialLink();
      return uri == null ? null : routeFor(uri);
    } catch (error) {
      // A malformed link must not stop the app from starting.
      if (kDebugMode) debugPrint('initial deep link failed: $error');
      return null;
    }
  }

  /// Links that arrive while the app is running.
  void listen(void Function(String route) onRoute) {
    _subscription?.cancel();
    _subscription = _links.uriLinkStream.listen((uri) {
      final route = routeFor(uri);
      if (route != null) onRoute(route);
    });
  }

  /// The in-app path for [uri], or null when the app does not serve it.
  ///
  /// ⚠️ Path AND query, no scheme and no host. Both link shapes collapse to
  /// the same thing here:
  ///
  ///   `aymanapp://quizzes/<id>`        → `/quizzes/<id>`
  ///   `https://aymanaboelela.com/x`    → `/x`
  ///
  /// A custom scheme puts the FIRST segment in `host`, not in `path` — which
  /// is the detail that makes `uri.path` alone wrong for exactly one of the
  /// two, and silently drops «quizzes» from the route.
  static String? routeFor(Uri uri) {
    final segments = [
      if (uri.scheme == 'aymanapp' && uri.host.isNotEmpty) uri.host,
      ...uri.pathSegments,
    ];
    if (segments.isEmpty) return null;

    final path = '/${segments.join('/')}';
    if (isNotInTheApp(path)) return null;

    return uri.hasQuery ? '$path?${uri.query}' : path;
  }

  /// Whether the web serves this and the app deliberately does not.
  static bool isNotInTheApp(String path) {
    for (final route in AppRoutes.notInTheApp) {
      if (route.endsWith('/*')) {
        if (path.startsWith(route.substring(0, route.length - 1))) return true;
        continue;
      }
      // A parameterised entry (`/years/:year`) matches on its literal prefix.
      final literal = route.split('/:').first;
      if (path == route) return true;
      if (literal != route && path.startsWith('$literal/')) return true;
    }
    return false;
  }

  void dispose() {
    _subscription?.cancel();
    _subscription = null;
  }
}
