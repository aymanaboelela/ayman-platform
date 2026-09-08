import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/buttons/app_button.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/lesson_player.dart';

/// The foot of the lesson: previous, next, and «خلاص · التالي».
class LessonNav extends StatelessWidget {
  const LessonNav({
    required this.player,
    required this.isComplete,
    required this.completing,
    required this.completeFailed,
    required this.onComplete,
    required this.onOpenNeighbour,
    super.key,
  });

  final LessonPlayer player;
  final bool isComplete;
  final bool completing;

  /// The write did not land. ⚠️ The caller must NOT have navigated.
  final bool completeFailed;

  final VoidCallback onComplete;
  final void Function(LessonNeighbour neighbour) onOpenNeighbour;

  /// ⚠️ HIDDEN entirely on a quiz lesson, and the server refuses it too — a
  /// quiz is completed by passing it. A button that always 400s is worse than
  /// no button.
  bool get _showFinish => !player.lesson.isQuiz;

  String get _finishLabel {
    if (isComplete) return CopyKeys.playerCompleted;
    if (completing) return CopyKeys.playerMarking;
    // «خلاص · التالي» is ONE gesture: finishing and moving on are the same
    // intent, and splitting them into two taps is how a lesson stays unticked.
    return player.next != null
        ? CopyKeys.playerMarkComplete
        : CopyKeys.playerMarkCompleteFinal;
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.x12,
      children: [
        if (_showFinish) ...[
          AppButton(
            label: tr(_finishLabel),
            icon: isComplete ? Icons.check_rounded : Icons.done_all_rounded,
            loading: completing,
            // Disabled once complete rather than hidden: the tick is the
            // student's receipt, and removing it looks like the state was lost.
            onPressed: isComplete ? null : onComplete,
          ),
          if (completeFailed)
            Semantics(
              liveRegion: true,
              child: Text(
                tr(CopyKeys.playerMarkFailed),
                style: type.bodySm(color: c.err),
              ),
            ),
        ],

        Row(
          spacing: AppSpacing.x12,
          children: [
            if (player.previous != null)
              Expanded(
                child: _NeighbourButton(
                  labelKey: CopyKeys.playerPrevious,
                  neighbour: player.previous!,
                  onTap: onOpenNeighbour,
                ),
              ),
            if (player.next != null)
              Expanded(
                child: _NeighbourButton(
                  labelKey: CopyKeys.playerNext,
                  neighbour: player.next!,
                  onTap: onOpenNeighbour,
                ),
              ),
          ],
        ),
      ],
    );
  }
}

/// «الدرس السابق» / «الدرس التالي», with the lesson's own name under it.
class _NeighbourButton extends StatelessWidget {
  const _NeighbourButton({
    required this.labelKey,
    required this.neighbour,
    required this.onTap,
  });

  final String labelKey;
  final LessonNeighbour neighbour;
  final void Function(LessonNeighbour neighbour) onTap;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return OutlinedButton(
      onPressed: () => onTap(neighbour),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: AppSpacing.x2,
        children: [
          Text(tr(labelKey), style: type.label(color: c.fgMuted)),
          Text(
            neighbour.title,
            style: type.bodySm(color: c.fg),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}
