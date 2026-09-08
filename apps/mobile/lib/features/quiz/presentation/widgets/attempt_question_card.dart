import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/media/app_rich_text.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/attempt.dart';
import 'question_choice_view.dart';
import 'question_ordering_view.dart';
import 'question_text_view.dart';

/// One question: the stem, the answer control, a flag and a clear.
class AttemptQuestionCard extends StatelessWidget {
  const AttemptQuestionCard({
    required this.question,
    required this.total,
    required this.onChanged,
    required this.onToggleFlag,
    super.key,
  });

  final LearnerQuestion question;
  final int total;
  final void Function(AnswerResponse? response) onChanged;
  final VoidCallback onToggleFlag;

  /// Marks are decimals on the wire but whole numbers in practice; «٢» reads
  /// better than «٢٫٠» on a question header.
  static String _mark(double value) =>
      value == value.roundToDouble() ? '${value.round()}' : '$value';

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.x16,
      children: [
        Row(
          spacing: AppSpacing.x8,
          children: [
            Text(
              '${question.slotPosition + 1} / $total',
              style: type.numeric(color: c.fgMuted, size: 13),
            ),
            const Spacer(),
            Text(
              tr(
                CopyKeys.quizTotalMarks,
                namedArgs: {'marks': _mark(question.maxMark)},
              ),
              style: type.numeric(color: c.study, size: 12),
            ),
            IconButton(
              onPressed: onToggleFlag,
              tooltip: tr(
                question.flagged ? CopyKeys.quizUnflag : CopyKeys.quizFlag,
              ),
              icon: Icon(
                question.flagged
                    ? Icons.bookmark_rounded
                    : Icons.bookmark_border_rounded,
                color: question.flagged ? c.accent : c.fgMuted,
              ),
            ),
          ],
        ),

        // HTML — the same 14-tag allowlist as everywhere else. The renderer
        // wraps anywhere: a bare URL or an exception name is a long
        // unbreakable Latin run, and in an RTL line box its BEGINNING is what
        // disappears off the left edge.
        AppRichText(html: question.stemHtml),

        if (question.isChoice)
          QuestionChoiceView(question: question, onChanged: onChanged)
        else if (question.isOrdering)
          QuestionOrderingView(question: question, onChanged: onChanged)
        else
          QuestionTextView(question: question, onChanged: onChanged),

        Align(
          alignment: AlignmentDirectional.centerStart,
          child: TextButton.icon(
            // Null CLEARS — the only way back to «لسه ما جاوبتش» from a radio,
            // which has no deselect of its own.
            onPressed: question.response == null ? null : () => onChanged(null),
            icon: Icon(Icons.backspace_outlined, size: 16, color: c.fgMuted),
            label: Text(
              tr(CopyKeys.quizClearAnswer),
              style: type.bodySm(color: c.fgMuted),
            ),
          ),
        ),
      ],
    );
  }
}
