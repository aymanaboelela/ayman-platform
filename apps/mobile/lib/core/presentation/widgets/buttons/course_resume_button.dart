import 'package:flutter/material.dart';

import '../../../theme/app_colors.dart';
import '../../../theme/app_radius.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_text_style.dart';

/// The «نكمّل» button — the one solid amber control on a course surface.
///
/// Its own widget so the card's tap target and the button's are unambiguous:
/// the whole card navigates, and this is the visible affordance that says so.
///
/// Shared out of `features/` because THREE surfaces draw it — the dashboard's
/// course card, the course page's progress panel, and «رحلتي». A student who
/// has learned what the amber pill does on one screen must not have to
/// relearn it on the next, which is only guaranteed while there is one of
/// them.
class CourseResumeButton extends StatelessWidget {
  const CourseResumeButton({
    required this.label,
    required this.onPressed,
    this.icon = Icons.play_arrow_rounded,
    super.key,
  });

  final String label;
  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Semantics(
      button: true,
      child: InkWell(
        onTap: onPressed,
        borderRadius: AppRadius.smAll,
        child: Container(
          height: AppSpacing.minTap,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: c.accent,
            borderRadius: AppRadius.smAll,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            spacing: AppSpacing.x8,
            children: [
              Icon(icon, size: 18, color: c.accentContrast),
              Text(
                label,
                style: type.body(
                  color: c.accentContrast,
                  weight: AppTextStyle.semibold,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
