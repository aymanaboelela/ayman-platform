import 'package:flutter/material.dart';

import '../localization/copy_keys.dart';
import 'routes.dart';

/// One destination in the student's navigation.
@immutable
class StudentNavItem {
  const StudentNavItem({
    required this.route,
    required this.labelKey,
    required this.icon,
    required this.activeIcon,
    this.inBottomBar = false,
  });

  final String route;

  /// A [CopyKeys] constant, resolved at render time so a language change
  /// re-labels the drawer without rebuilding this table.
  final String labelKey;

  final IconData icon;

  /// The filled variant, for the current destination. Two glyphs rather than a
  /// colour change alone: colour is not available to every student, and a
  /// filled icon reads as "you are here" without it.
  final IconData activeIcon;

  /// Whether this is one of the four in the bottom bar.
  final bool inBottomBar;
}

/// The student's destinations, in render order.
///
/// Transcribed from `apps/web/components/app/student-nav-items.ts`, with the
/// same order and the same Arabic labels. The lucide icons the web uses are
/// mapped to their closest Material equivalents — noted per row where the
/// match is not obvious.
abstract final class StudentNav {
  static const items = <StudentNavItem>[
    StudentNavItem(
      route: AppRoutes.dashboard,
      labelKey: CopyKeys.navDashboard, // «حسابي»
      icon: Icons.grid_view_outlined, // lucide LayoutDashboard
      activeIcon: Icons.grid_view_rounded,
      inBottomBar: true,
    ),
    StudentNavItem(
      route: AppRoutes.path,
      labelKey: CopyKeys.navPath, // «مساري»
      icon: Icons.route_outlined, // lucide Route
      activeIcon: Icons.route_rounded,
      inBottomBar: true,
    ),
    StudentNavItem(
      route: AppRoutes.library,
      labelKey: CopyKeys.navCourses, // «الكورسات»
      icon: Icons.collections_bookmark_outlined, // lucide BookMarked
      activeIcon: Icons.collections_bookmark_rounded,
      inBottomBar: true,
    ),
    StudentNavItem(
      route: AppRoutes.results,
      labelKey: CopyKeys.navResults, // «نتائجي»
      icon: Icons.bar_chart_outlined, // lucide BarChart3
      activeIcon: Icons.bar_chart_rounded,
      inBottomBar: true,
    ),
    StudentNavItem(
      route: AppRoutes.foundations,
      labelKey: CopyKeys.navEssentials, // «التأسيس»
      icon: Icons.eco_outlined, // lucide Sprout
      activeIcon: Icons.eco_rounded,
    ),
    StudentNavItem(
      route: AppRoutes.store,
      labelKey: CopyKeys.navBooks, // «الكتب»
      icon: Icons.menu_book_outlined, // lucide BookOpen
      activeIcon: Icons.menu_book_rounded,
    ),
    StudentNavItem(
      route: AppRoutes.playground,
      labelKey: CopyKeys.navPlayground, // «تجربة الكود»
      icon: Icons.terminal_outlined, // lucide Terminal
      activeIcon: Icons.terminal_rounded,
    ),
    StudentNavItem(
      route: AppRoutes.profile,
      labelKey: CopyKeys.navProfile, // «بروفايلي»
      icon: Icons.person_outline_rounded, // lucide UserRound
      activeIcon: Icons.person_rounded,
    ),
    StudentNavItem(
      route: AppRoutes.devices,
      labelKey: CopyKeys.navDevices, // «أجهزتي»
      icon: Icons.devices_outlined, // lucide MonitorSmartphone
      activeIcon: Icons.devices_rounded,
    ),
  ];

  /// The four in the bottom bar.
  ///
  /// ## Why there is a bottom bar at all, when the web has none
  ///
  /// The web's signed-in shell is a 296px side rail above 768px and a drawer
  /// below it — it has no tab bar anywhere, and the spec says in as many words
  /// not to invent one. This does anyway, and the reason is that the web's
  /// "below 768px" case is a browser tab someone opened on a phone, whereas
  /// this is the app they installed. Burying the four screens a student visits
  /// every day behind a hamburger costs a tap each time and reads as a wrapped
  /// website.
  ///
  /// The drawer still exists and still holds EVERY destination including these
  /// four, so nothing is reachable only one way.
  static List<StudentNavItem> get bottomBar =>
      items.where((i) => i.inBottomBar).toList(growable: false);

  /// Which item is current, by the web's own rule (`activeStudentNav`):
  ///
  ///  1. anything under `/courses/` resolves to `/library` — a lesson belongs
  ///     to the course list even though its URL does not say so;
  ///  2. `/dashboard` matches EXACTLY, everything else by prefix;
  ///  3. the longest matching route wins, so `/settings/devices` beats
  ///     `/settings`.
  static StudentNavItem? activeFor(String location) {
    final resolved = location.startsWith('/courses/') ? AppRoutes.library : location;

    StudentNavItem? best;
    for (final item in items) {
      final matches = item.route == AppRoutes.dashboard
          ? resolved == AppRoutes.dashboard
          : resolved.startsWith(item.route);
      if (!matches) continue;
      if (best == null || item.route.length > best.route.length) best = item;
    }
    return best;
  }
}
