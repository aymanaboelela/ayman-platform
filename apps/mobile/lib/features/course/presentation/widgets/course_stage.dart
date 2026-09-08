import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/functions/format_duration.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/media/course_art.dart';
import '../../../../core/presentation/widgets/surfaces/app_stage_band.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/course_detail.dart';

/// The ember band a course introduces itself on: identity, title, two facts.
///
/// It replaces a bare title over a grey meta line, which was the single
/// biggest reason the signed-in area read as black and white while the
/// marketing page did not.
///
/// ⚠️ Nothing in here is pressable. Ember is STRUCTURE; a band that responds
/// to a tap teaches the student that every unit header is a dead control.
class CourseStage extends StatelessWidget {
  const CourseStage({required this.course, required this.lessonCount, super.key});

  final CourseDetail course;

  /// From the OUTLINE, not from the catalogue: an enrolled student's total is
  /// the one the progress bar on the same screen is drawn from, and two
  /// different lesson counts on one screen is the bug this argument closes.
  final int lessonCount;

  @override
  Widget build(BuildContext context) {
    final type = AppTextStyle.of(context);
    const onBand = AppStageBand.secondaryForeground;

    return AppStageBand(
      spacing: AppSpacing.x8,
      children: [
        Text(course.eyebrow, style: type.label(color: onBand)),
        Text(course.title, style: type.title2Style(color: Colors.white)),
        if (course.subtitle != null)
          Text(course.subtitle!, style: type.bodySm(color: onBand)),
        const SizedBox(height: AppSpacing.x4),
        Row(
          spacing: AppSpacing.x16,
          children: [
            _StageFact(
              icon: Icons.layers_outlined,
              label: tr(
                CopyKeys.libraryLessonCount,
                namedArgs: {'n': '$lessonCount'},
              ),
            ),
            _StageFact(
              icon: Icons.schedule_outlined,
              label: formatDuration(course.totalSeconds),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.x8),
        // The art goes BELOW the facts on a phone rather than beside them —
        // the web puts it at the inline end from `md` and drops it under on
        // small screens for the same reason: squeezed into a column beside the
        // title it becomes a stripe.
        ClipRRect(
          borderRadius: AppRadius.mdAll,
          child: CourseArt(
            subjectNameAr: course.subjectNameAr,
            coverKey: course.coverKey,
            seed: course.slug,
            aspectRatio: 16 / 7,
            borderRadius: BorderRadius.zero,
          ),
        ),
      ],
    );
  }
}

/// One fact on the band — a glyph and a figure.
class _StageFact extends StatelessWidget {
  const _StageFact({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final type = AppTextStyle.of(context);
    const onBand = AppStageBand.secondaryForeground;

    return Row(
      mainAxisSize: MainAxisSize.min,
      spacing: AppSpacing.x4,
      children: [
        Icon(icon, size: 14, color: onBand),
        Text(label, style: type.numeric(color: onBand, size: 12)),
      ],
    );
  }
}
