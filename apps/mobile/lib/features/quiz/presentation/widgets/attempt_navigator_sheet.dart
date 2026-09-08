import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/layout/app_bottom_sheet.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/attempt.dart';

/// «خريطة الأسئلة» — every question, its state, and a way to jump to it.
///
/// A sheet rather than a permanent strip: on a phone the question itself needs
/// the whole screen, and a twenty-square grid pinned across the top costs more
/// than it gives on a paper the student walks in order anyway.
class AttemptNavigatorSheet extends StatelessWidget {
  const AttemptNavigatorSheet({
    required this.questions,
    required this.currentIndex,
    required this.onSelect,
    super.key,
  });

  final List<LearnerQuestion> questions;
  final int currentIndex;
  final void Function(int index) onSelect;

  static Future<void> show(
    BuildContext context, {
    required List<LearnerQuestion> questions,
    required int currentIndex,
    required void Function(int index) onSelect,
  }) {
    return AppBottomSheet.show<void>(
      context,
      title: tr(CopyKeys.quizNavigator),
      builder: (_) => AttemptNavigatorSheet(
        questions: questions,
        currentIndex: currentIndex,
        onSelect: onSelect,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final flagged = questions.where((q) => q.flagged).length;
    final answered = questions.where((q) => q.answered).length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.x16,
      children: [
        Text(
          tr(
            CopyKeys.quizAnsweredCount,
            namedArgs: {'answered': '$answered', 'total': '${questions.length}'},
          ),
          style: type.bodySm(color: c.fgMuted),
        ),
        if (flagged > 0)
          Text(
            tr(CopyKeys.quizFlaggedCount, namedArgs: {'n': '$flagged'}),
            style: type.bodySm(color: c.accentText),
          ),

        Wrap(
          spacing: AppSpacing.x8,
          runSpacing: AppSpacing.x8,
          children: [
            for (var i = 0; i < questions.length; i++)
              _NavigatorSquare(
                index: i,
                question: questions[i],
                current: i == currentIndex,
                onTap: () {
                  Navigator.of(context).pop();
                  onSelect(i);
                },
              ),
          ],
        ),
      ],
    );
  }
}

/// One square carrying three facts on one 48pt target: answered, flagged,
/// current.
class _NavigatorSquare extends StatelessWidget {
  const _NavigatorSquare({
    required this.index,
    required this.question,
    required this.current,
    required this.onTap,
  });

  final int index;
  final LearnerQuestion question;
  final bool current;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Semantics(
      button: true,
      selected: current,
      label: tr(CopyKeys.quizUnansweredChipLabel, namedArgs: {'n': '${index + 1}'}),
      child: ExcludeSemantics(
        child: Material(
          color: question.answered ? c.accent.withValues(alpha: 0.16) : c.surface3,
          borderRadius: AppRadius.smAll,
          child: InkWell(
            onTap: onTap,
            borderRadius: AppRadius.smAll,
            child: Container(
              width: 48,
              height: 48,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                borderRadius: AppRadius.smAll,
                border: Border.all(
                  color: current ? c.accent : c.line,
                  width: current ? 2 : 1,
                ),
              ),
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Text(
                    '${index + 1}',
                    style: type.numeric(
                      color: question.answered ? c.accentText : c.fgMuted,
                      size: 14,
                    ),
                  ),
                  if (question.flagged)
                    PositionedDirectional(
                      top: 2,
                      end: 2,
                      child: Icon(
                        Icons.bookmark_rounded,
                        size: 10,
                        color: c.accent,
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
