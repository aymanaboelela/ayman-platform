import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../router/student_nav_items.dart';
import '../../../theme/app_colors.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_text_style.dart';

/// The four destinations a student opens every day.
///
/// Hand-built rather than `NavigationBar`, for two reasons that both show up
/// on a real phone: Material 3's bar is 80 logical pixels tall before the
/// system gesture inset, which is a lot of a 640dp screen; and its selected
/// indicator is a stadium pill whose radius cannot be brought down to this
/// design's 8px ceiling.
class StudentBottomBar extends StatelessWidget {
  const StudentBottomBar({required this.navigationShell, super.key});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final items = StudentNav.bottomBar;

    return Container(
      decoration: BoxDecoration(
        color: c.surface1,
        border: Border(top: BorderSide(color: c.line, width: 0.5)),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 60,
          child: Row(
            children: [
              for (var index = 0; index < items.length; index++)
                Expanded(
                  child: StudentBottomBarItem(
                    item: items[index],
                    selected: navigationShell.currentIndex == index,
                    onTap: () => _go(index),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  /// Tapping the CURRENT tab pops it back to its root.
  ///
  /// `initialLocation: true` on a re-tap is the platform convention on both
  /// iOS and Android, and without it a student three screens deep in
  /// «الكورسات» taps the courses tab, nothing happens, and they conclude the
  /// button is broken.
  void _go(int index) {
    navigationShell.goBranch(
      index,
      initialLocation: index == navigationShell.currentIndex,
    );
  }
}

/// One tab.
class StudentBottomBarItem extends StatelessWidget {
  const StudentBottomBarItem({
    required this.item,
    required this.selected,
    required this.onTap,
    super.key,
  });

  final StudentNavItem item;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final colour = selected ? c.accentText : c.fgMuted;

    return Semantics(
      button: true,
      selected: selected,
      child: InkWell(
        onTap: onTap,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(selected ? item.activeIcon : item.icon, size: 22, color: colour),
            const SizedBox(height: AppSpacing.x2),
            Text(
              tr(item.labelKey),
              // The mono label face the rest of the product uses for eyebrows
              // and counters. Arabic renders in the Plex fallback inside it,
              // which is the same family — the tracking is what distinguishes
              // a label from prose here.
              style: type.bodyXs(
                color: colour,
                weight: selected ? AppTextStyle.semibold : AppTextStyle.regular,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}
