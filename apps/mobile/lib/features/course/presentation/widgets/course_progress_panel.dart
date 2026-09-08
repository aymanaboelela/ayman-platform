import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/buttons/course_resume_button.dart';
import '../../../../core/presentation/widgets/feedback/app_progress_meter.dart';
import '../../../../core/presentation/widgets/surfaces/app_panel.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/course_outline.dart';

/// Where the student stands in a course they are already in.
class CourseProgressPanel extends StatelessWidget {
  const CourseProgressPanel({
    required this.outline,
    required this.contentComplete,
    required this.onResume,
    super.key,
  });

  final CourseOutline outline;

  /// Gates «خلصت الكورس» against «خلّصت اللي نزل» — see [CourseDetail].
  final bool contentComplete;

  /// Null when there is nothing to resume: a finished course with no next
  /// lesson. A button that navigates nowhere is worse than no button.
  final VoidCallback? onResume;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return AppPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppSpacing.x12,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Text(
                  outline.isDone
                      ? tr(
                          contentComplete
                              ? CopyKeys.libraryCourseDone
                              : CopyKeys.libraryCourseUpToDate,
                        )
                      : tr(
                          CopyKeys.libraryPercentDone,
                          namedArgs: {
                            'percent': '${outline.progressPercent.round()}',
                          },
                        ),
                  style: outline.isDone
                      ? type.title4Style(color: c.ok)
                      : type.title4Style(color: c.fg),
                ),
              ),
              const SizedBox(width: AppSpacing.x8),
              Text(
                '${outline.clearedLessons} / ${outline.totalLessons}',
                style: type.numeric(color: c.accentText, size: 13),
              ),
            ],
          ),
          AppProgressMeter(value: outline.progressPercent / 100),
          if (onResume != null)
            CourseResumeButton(
              label: tr(
                outline.isDone ? CopyKeys.libraryReview : CopyKeys.libraryResume,
              ),
              icon: outline.isDone
                  ? Icons.replay_rounded
                  : Icons.play_arrow_rounded,
              onPressed: onResume!,
            ),
        ],
      ),
    );
  }
}
