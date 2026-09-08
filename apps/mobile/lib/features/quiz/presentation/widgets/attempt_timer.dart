import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';

/// The countdown, in `MM:SS`.
///
/// ## The colour escalates, and so does the WORD
///
/// Above five minutes it is neutral; at five it warns; at one it is critical.
/// Colour alone would be useless to a student who cannot separate two tints,
/// so the grace state says it outright: «الوقت خلص — فاضل {n} ثانية للتسليم.»
///
/// ⚠️ NOT a live region. Putting one on ticking digits makes the whole warn
/// window unusable with a screen reader — every second gets announced.
class AttemptTimer extends StatelessWidget {
  const AttemptTimer({
    required this.remaining,
    required this.inGrace,
    super.key,
  });

  final Duration remaining;
  final bool inGrace;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final seconds = remaining.inSeconds;

    // Grace is ALWAYS critical: the time is already gone.
    final colour = inGrace || seconds <= 60
        ? c.err
        : seconds <= 300
            ? c.warn
            : c.fgMuted;

    final minutes = (seconds ~/ 60).toString().padLeft(2, '0');
    final rest = (seconds % 60).toString().padLeft(2, '0');

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.x12,
        vertical: AppSpacing.x4,
      ),
      decoration: BoxDecoration(
        color: colour.withValues(alpha: 0.14),
        borderRadius: AppRadius.fullAll,
      ),
      child: Semantics(
        label: tr(CopyKeys.quizTimeLeft),
        child: Text(
          inGrace
              ? tr(CopyKeys.quizGraceRemaining, namedArgs: {'seconds': '$seconds'})
              // Tabular digits, so the clock does not jitter as the numbers
              // change width.
              : '$minutes:$rest',
          style: type.numeric(color: colour, size: 15),
        ),
      ),
    );
  }
}
