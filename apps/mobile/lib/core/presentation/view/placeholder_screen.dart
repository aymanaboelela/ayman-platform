import 'package:flutter/material.dart';

import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import '../../theme/app_text_style.dart';

/// A destination that is routed but not built yet.
///
/// Deliberately NOT a blank Scaffold and deliberately NOT hidden from the
/// navigation. Removing the row would make the app look finished and smaller
/// than it is; a screen that names itself makes the gap legible to whoever
/// opens it next, including the person who has to build it.
///
/// Every one of these is a route in `AppRoutes` with a spec section in
/// `docs/mobile-spec/student-app.md` waiting for it.
class PlaceholderScreen extends StatelessWidget {
  const PlaceholderScreen({required this.route, super.key});

  final String route;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.x32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: c.surface3,
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.construction_rounded,
                size: 28,
                color: c.fgFaint,
              ),
            ),
            const SizedBox(height: AppSpacing.x16),
            Text(
              'قيد الإنشاء',
              style: type.title3Style(color: c.fg),
            ),
            const SizedBox(height: AppSpacing.x8),
            Text(
              route,
              // The path, LTR inside the RTL page — it is an identifier, and
              // an identifier laid out right-to-left is a different string.
              textDirection: TextDirection.ltr,
              style: type.numeric(color: c.fgFaint, size: 13),
            ),
          ],
        ),
      ),
    );
  }
}
