import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/media/app_rich_text.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/attempt.dart';

/// The three choice types — `mcq_single`, `true_false` and `mcq_multi`.
///
/// `true_false` is rendered IDENTICALLY to `mcq_single`: it is a radio group
/// over the two stored options, and the option bodies carry their own «صح» and
/// «خطأ» text. There is no separate widget and no hard-coded pair.
///
/// ⚠️ Options render in the SNAPSHOTTED order the API sent and are never
/// re-sorted — the shuffle is part of the paper the student was given.
class QuestionChoiceView extends StatelessWidget {
  const QuestionChoiceView({
    required this.question,
    required this.onChanged,
    super.key,
  });

  final LearnerQuestion question;
  final void Function(AnswerResponse? response) onChanged;

  void _toggle(String optionId) {
    final chosen = question.chosenIds;

    if (!question.isMulti) {
      // A radio REPLACES. There is no deselect — only «مسح إجابتي» clears it.
      onChanged(ChoiceAnswer([optionId]));
      return;
    }

    final next = chosen.contains(optionId)
        ? (chosen.where((id) => id != optionId).toList())
        : [...chosen, optionId];

    // ⚠️ Unticking the LAST box clears the answer to null, which is what makes
    // the question read as unanswered again. An empty list would leave it
    // marked as answered with nothing in it.
    onChanged(next.isEmpty ? null : ChoiceAnswer(next));
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final chosen = question.chosenIds;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.x8,
      children: [
        Text(
          tr(
            question.isMulti ? CopyKeys.quizChooseMany : CopyKeys.quizChooseOne,
          ),
          style: type.bodyXs(color: c.fgMuted),
        ),
        for (final option in question.options)
          _OptionRow(
            option: option,
            selected: chosen.contains(option.id),
            multi: question.isMulti,
            onTap: () => _toggle(option.id),
          ),
      ],
    );
  }
}

/// One option — a box or a disc, and the option's own HTML body.
class _OptionRow extends StatelessWidget {
  const _OptionRow({
    required this.option,
    required this.selected,
    required this.multi,
    required this.onTap,
  });

  final QuestionOption option;
  final bool selected;
  final bool multi;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);

    return Semantics(
      inMutuallyExclusiveGroup: !multi,
      checked: selected,
      child: ExcludeSemantics(
        child: Material(
          color: selected ? c.accent.withValues(alpha: 0.12) : c.surface2,
          borderRadius: AppRadius.mdAll,
          child: InkWell(
            onTap: onTap,
            borderRadius: AppRadius.mdAll,
            child: Container(
              padding: const EdgeInsets.all(AppSpacing.x12),
              decoration: BoxDecoration(
                borderRadius: AppRadius.mdAll,
                border: Border.all(
                  color: selected ? c.accent : c.line,
                  width: selected ? 1.5 : 1,
                ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: AppSpacing.x12,
                children: [
                  Icon(
                    multi
                        ? (selected
                            ? Icons.check_box_rounded
                            : Icons.check_box_outline_blank_rounded)
                        : (selected
                            ? Icons.radio_button_checked_rounded
                            : Icons.radio_button_unchecked_rounded),
                    size: 22,
                    color: selected ? c.accent : c.fgMuted,
                  ),
                  // The body is HTML — the same 14-tag allowlist as everywhere
                  // else. An instructor's literal `*` is ordinary content on a
                  // CS platform, so a Markdown renderer would be wrong here.
                  Expanded(child: AppRichText(html: option.bodyHtml)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
