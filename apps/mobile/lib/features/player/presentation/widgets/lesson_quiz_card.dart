import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/buttons/app_button.dart';
import '../../../../core/presentation/widgets/surfaces/app_panel.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/lesson_progress.dart';

/// The quiz on this lesson — either the lesson IS the quiz, or one hangs off
/// it.
///
/// Reads the progress off the player payload; there is no second request.
class LessonQuizCard extends StatelessWidget {
  const LessonQuizCard({
    required this.progress,
    required this.isExamLesson,
    required this.onOpen,
    super.key,
  });

  final LessonProgress progress;

  /// True when the LESSON is a quiz; false for a quiz attached to a lecture.
  /// The two say different things — one is the step, the other is a check on
  /// the step.
  final bool isExamLesson;

  final VoidCallback onOpen;

  /// Sat means it has been answered, pass or fail.
  bool get _sat => progress.state == 'passed' || progress.state == 'failed';

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final percent = (progress.completion * 100).round();

    return AppPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppSpacing.x12,
        children: [
          if (!_sat)
            Text(
              tr(
                isExamLesson
                    ? CopyKeys.playerQuizIntro
                    : CopyKeys.playerQuizAttachedIntro,
              ),
              style: type.body(color: c.fg),
            )
          else ...[
            Text(
              tr(CopyKeys.playerQuizYourScore),
              style: type.bodySm(color: c.fgMuted),
            ),
            Text('$percent٪', style: type.title2Style(color: c.fg)),
            // ⚠️ Only the PASS verdict is rendered. «محتاج تحاول تاني» in red
            // is a label on the student rather than information for them — the
            // score is already on the line above.
            if (progress.state == 'passed')
              Text(
                tr(
                  isExamLesson
                      ? CopyKeys.playerQuizPassedNote
                      : CopyKeys.playerQuizAttachedPassedNote,
                ),
                style: type.bodySm(color: c.ok),
              )
            else
              Text(
                tr(CopyKeys.playerQuizFailedNote),
                style: type.bodySm(color: c.fgMuted),
              ),
          ],

          AppButton(
            label: tr(_ctaKey),
            icon: Icons.fact_check_outlined,
            variant: _sat ? AppButtonVariant.secondary : AppButtonVariant.primary,
            onPressed: onOpen,
          ),
        ],
      ),
    );
  }

  String get _ctaKey {
    if (_sat) {
      return isExamLesson
          ? CopyKeys.playerQuizOpenCta
          : CopyKeys.playerQuizAttachedOpenCta;
    }
    return isExamLesson
        ? CopyKeys.playerQuizCta
        : CopyKeys.playerQuizAttachedCta;
  }
}
