import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../router/routes.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_text_style.dart';
import '../widgets/navigation/student_bottom_bar.dart';
import '../widgets/navigation/student_drawer.dart';
import '../widgets/navigation/student_top_bar.dart';

/// The chrome every signed-in screen sits inside.
///
/// Provided by a `StatefulShellRoute` so the four bottom-bar destinations keep
/// their own navigation stacks and their own scroll positions — a student who
/// opens a course from «الكورسات», switches to «حسابي» and comes back must
/// find the course still open.
///
/// ## `AppTypeScope`
///
/// Applied here, once, for the whole signed-in subtree. It is the mobile twin
/// of the web putting `.product-type` on the shell root: everything behind
/// login types one rung larger than the sign-in screen, asked for directly
/// («كبّر الخطوط في الداشبورد بتاع الطالب والأدمن»).
class StudentShell extends StatelessWidget {
  const StudentShell({required this.navigationShell, super.key});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final location = GoRouterState.of(context).uri.path;

    // The lesson player and the exam runner get the screen to themselves.
    //
    // The runner is the web's own rule (`isAttemptRoute` discards the entire
    // shell) and for the same reason: a student mid-exam must not be one tap
    // from navigating away, and the countdown needs the vertical space. The
    // player is a mobile-only addition — a 16:9 video under an app bar and
    // over a tab bar has about 40% of the screen left.
    final bare = AppRoutes.isAttemptRoute(location) || AppRoutes.isLessonRoute(location);

    return AppTypeScope(
      isProductSurface: true,
      child: Scaffold(
        backgroundColor: c.surface1,
        appBar: bare ? null : const StudentTopBar(),
        drawer: bare ? null : const StudentDrawer(),
        // `false` so the bottom bar does not ride up on top of the keyboard.
        // The screens themselves handle insets; a tab bar sitting above an
        // open keyboard is never what anyone wanted.
        resizeToAvoidBottomInset: false,
        body: navigationShell,
        bottomNavigationBar: bare
            ? null
            : StudentBottomBar(navigationShell: navigationShell),
      ),
    );
  }
}
