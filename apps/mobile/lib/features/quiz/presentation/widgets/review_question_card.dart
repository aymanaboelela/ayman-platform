import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/media/app_rich_text.dart';
import '../../../../core/presentation/widgets/surfaces/app_panel.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/attempt.dart';
import '../../domain/entities/attempt_review.dart';

/// One question, after the fact.
///
/// ⚠️ Every gated field is drawn on PRESENCE, not on null. The instructor
/// controls what a student may see per question — marks, verdict, model answer
/// — and «a key whose value is null is itself information»: a visible null
/// mark means «لسه بتتصحّح», where an ABSENT mark means marks are not shown at
/// all. Branching on `!= null` collapses the two.
class ReviewQuestionCard extends StatelessWidget {
  const ReviewQuestionCard({required this.question, super.key});

  final ReviewQuestion question;

  Color _verdictColour(AppColors c) => switch (question.correctness) {
        'correct' => c.ok,
        'partial' => c.warn,
        'incorrect' => c.err,
        _ => c.fgMuted,
      };

  String _verdictKey() => switch (question.correctness) {
        'correct' => CopyKeys.quizCorrect,
        'partial' => CopyKeys.quizPartial,
        'incorrect' => CopyKeys.quizIncorrect,
        'needsGrading' => CopyKeys.quizNeedsGrading,
        _ => CopyKeys.quizNotAnswered,
      };

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final chosen = question.chosenIds.toSet();
    final right = question.rightAnswerOptionIds?.toSet() ?? const <String>{};

    return AppPanel(
      margin: const EdgeInsets.only(bottom: AppSpacing.stackGap),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppSpacing.x12,
        children: [
          Row(
            spacing: AppSpacing.x8,
            children: [
              Text(
                '${question.slotPosition + 1}',
                style: type.numeric(color: c.fgMuted, size: 13),
              ),
              const Spacer(),
              if (question.hasCorrectness)
                Text(
                  tr(_verdictKey()),
                  style: type.bodySm(
                    color: _verdictColour(c),
                    weight: AppTextStyle.medium,
                  ),
                ),
              if (question.hasMarks)
                Text(
                  question.mark == null
                      // A visible null mark is «محتاج تصحيح», not «صفر».
                      ? tr(CopyKeys.quizNeedsGrading)
                      : tr(
                          CopyKeys.quizMarksEarned,
                          namedArgs: {
                            'earned': '${question.mark!.round()}',
                            'max': '${(question.maxMark ?? 0).round()}',
                          },
                        ),
                  style: type.numeric(color: c.accentText, size: 12),
                ),
            ],
          ),

          AppRichText(html: question.stemHtml),

          if (question.options.isNotEmpty)
            for (final option in question.options)
              _ReviewOption(
                option: option,
                chosen: chosen.contains(option.id),
                // Only marked when the model answer was actually released.
                correct: right.contains(option.id),
                showCorrect: question.rightAnswerOptionIds != null,
              )
          else if (question.hasResponse && question.text.isNotEmpty) ...[
            Text(
              tr(CopyKeys.quizYourAnswer),
              style: type.bodySm(color: c.fgMuted),
            ),
            Text(question.text, style: type.body(color: c.fg)),
          ],

          if (question.rightAnswerText != null) ...[
            Text(
              tr(CopyKeys.quizRightAnswer),
              style: type.bodySm(color: c.ok, weight: AppTextStyle.medium),
            ),
            Text(question.rightAnswerText!, style: type.body(color: c.fg)),
          ],

          if (question.feedbackHtml != null ||
              question.generalFeedbackHtml != null) ...[
            Text(
              tr(CopyKeys.quizExplanation),
              style: type.bodySm(color: c.fg, weight: AppTextStyle.medium),
            ),
            AppRichText(
              html: question.feedbackHtml ?? question.generalFeedbackHtml!,
            ),
          ],
        ],
      ),
    );
  }
}

/// One option, with what the student picked and — when released — what was
/// right.
class _ReviewOption extends StatelessWidget {
  const _ReviewOption({
    required this.option,
    required this.chosen,
    required this.correct,
    required this.showCorrect,
  });

  final QuestionOption option;
  final bool chosen;
  final bool correct;
  final bool showCorrect;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);

    // Green marks the right answer, red marks a wrong pick. Both are
    // load-bearing here and nowhere else on this screen, which is why the
    // course progress bar next door is amber.
    final colour = showCorrect && correct
        ? c.ok
        : chosen
            ? (showCorrect ? c.err : c.accent)
            : c.line;

    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.x8),
      padding: const EdgeInsets.all(AppSpacing.x12),
      decoration: BoxDecoration(
        color: c.surface3,
        borderRadius: AppRadius.mdAll,
        border: Border.all(color: colour, width: chosen || correct ? 1.5 : 1),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: AppSpacing.x8,
        children: [
          Icon(
            chosen ? Icons.radio_button_checked_rounded : Icons.circle_outlined,
            size: 18,
            color: colour,
          ),
          Expanded(child: AppRichText(html: option.bodyHtml)),
          if (showCorrect && correct)
            Icon(Icons.check_rounded, size: 18, color: c.ok),
        ],
      ),
    );
  }
}
