import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../router/routes.dart';

/// One way to navigate, so no screen has to remember which routes live outside
/// the tab shell.
///
/// ## Why this exists at all
///
/// `go` and `push` are not interchangeable here. `go` replaces the stack; for
/// a route on the ROOT navigator — the player, the exam runner, the chat —
/// that destroys the shell underneath, and the next back press closes the app
/// instead of returning to the list the student came from. `push` stacks, and
/// for an in-shell destination it would stack a second copy of a tab the
/// student can already reach from the bar.
///
/// Both mistakes ship silently: each one looks right on the screen it opens
/// and only misbehaves one gesture later. So the choice is made ONCE, from
/// [AppRoutes.isOutsideShell], and every call site asks for the destination
/// rather than for the mechanism.
extension AppNavigation on BuildContext {
  /// Go to [location], stacking or replacing as that route requires.
  void open(String location) {
    if (AppRoutes.isOutsideShell(location)) {
      push(location);
    } else {
      go(location);
    }
  }
}
