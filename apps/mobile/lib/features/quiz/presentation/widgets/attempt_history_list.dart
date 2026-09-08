import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/feedback/app_badge.dart';
import '../../../../core/presentation/widgets/layout/app_section_header.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/quiz_overview.dart';

/// Every past sitting, newest first.
class AttemptHistoryList extends StatelessWidget {
  const AttemptHistoryList({required this.attempts, super.key});

  final List<AttemptHistoryRow> attempts;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppSectionHeader(title: tr(CopyKeys.quizPreviousAttempts)),
        for (final attempt in attempts) ...[
          _AttemptRow(attempt: attempt),
          const SizedBox(height: AppSpacing.x8),
        ],
      ],
    );
  }
}

/// One sitting: which attempt, what it scored, and whether it is THE grade.
class _AttemptRow extends StatelessWidget {
  const _AttemptRow({required this.attempt});

  final AttemptHistoryRow attempt;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Container(
      padding: const EdgeInsets.all(AppSpacing.x12),
      decoration: BoxDecoration(
        color: c.surface2,
        borderRadius: AppRadius.mdAll,
        border: Border.all(color: c.line),
      ),
      child: Row(
        spacing: AppSpacing.x12,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: AppSpacing.x2,
              children: [
                Text(
                  tr(
                    CopyKeys.quizAttemptNo,
                    namedArgs: {'n': '${attempt.attemptNo}'},
                  ),
                  style: type.bodySm(color: c.fg),
                ),
                if (attempt.counts)
                  // ⚠️ The SERVER decides which sitting is the grade. An
                  // improvement attempt can legitimately score lower and still
                  // be the one that counts, so nothing here takes a max().
                  Text(
                    tr(CopyKeys.quizCounts),
                    style: type.bodyXs(color: c.accentText),
                  ),
              ],
            ),
          ),
          if (attempt.scaledScore != null)
            Text(
              '${attempt.scaledScore!.round()}٪',
              style: type.numeric(
                color: attempt.passed == true ? c.ok : c.fg,
                size: 15,
              ),
            )
          else
            AppBadge(
              // No score yet: either it is still being marked, or it was
              // abandoned. Both are facts, not failures.
              label: tr(
                attempt.state == 'pending_review'
                    ? CopyKeys.quizNeedsGrading
                    : CopyKeys.quizNotAnswered,
              ),
            ),
        ],
      ),
    );
  }
}
