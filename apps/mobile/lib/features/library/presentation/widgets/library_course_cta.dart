import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/library_course.dart';

/// The one button on a course card, in its four labels and two weights.
///
/// ## Why an empty course does not say «نبدأ الكورس»
///
/// The card promised what every other card promises, and the promise broke one
/// screen later: press «نبدأ الكورس», arrive at the course, read «٠ محاضرة» and
/// find nothing to press. A CTA that cannot do what it says is worse than an
/// honest label, and the honest label is two words — «لسه فاضي».
///
/// It still LINKS: the course page explains the state and offers the rest of
/// the catalogue. It just stops claiming to start anything.
///
/// ## Solid only while there is something to resume
///
/// Amber is the ONE thing you press on a screen. An unenrolled course and a
/// finished one both point somewhere useful, but neither is the thing to press
/// right now, so they take the quiet ember outline — structure's weight, not
/// action's. A grid where every card is amber has no call to action at all.
class LibraryCourseCta extends StatelessWidget {
  const LibraryCourseCta({
    required this.course,
    required this.onPressed,
    super.key,
  });

  final LibraryCourse course;
  final VoidCallback onPressed;

  /// Solid amber for «نكمّل» and nothing else.
  bool get _isSolid => course.isEnrolled && !course.isDone && !course.isEmpty;

  String get _labelKey {
    if (course.isEmpty) return CopyKeys.libraryEmptyCardCta;
    if (!course.isEnrolled) return CopyKeys.libraryStart;
    if (course.isDone) return CopyKeys.libraryOpen;
    return CopyKeys.libraryResume;
  }

  IconData get _icon {
    if (course.isEmpty) return Icons.hourglass_empty_rounded;
    if (!course.isEnrolled) return Icons.play_arrow_rounded;
    if (course.isDone) return Icons.replay_rounded;
    return Icons.play_arrow_rounded;
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final foreground = _isSolid ? c.accentContrast : c.fg;

    return Semantics(
      button: true,
      child: InkWell(
        onTap: onPressed,
        borderRadius: AppRadius.smAll,
        child: Container(
          height: AppSpacing.minTap,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: _isSolid ? c.accent : Colors.transparent,
            borderRadius: AppRadius.smAll,
            // The quiet weight is an EMBER outline, not a grey one: ember is
            // this surface's word for structure, and it is what keeps the
            // quiet chip a member of the same family as the solid one.
            border: _isSolid ? null : Border.all(color: c.studyLine),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            spacing: AppSpacing.x8,
            children: [
              Icon(_icon, size: 18, color: foreground),
              Text(
                tr(_labelKey),
                style: type.body(
                  color: foreground,
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
