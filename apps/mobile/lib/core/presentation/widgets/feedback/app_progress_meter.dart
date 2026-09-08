import 'package:flutter/material.dart';

import '../../../theme/app_colors.dart';
import '../../../theme/app_motion.dart';
import '../../../theme/app_radius.dart';

/// The progress bar under a course row.
///
/// Amber, never green. Green and red are load-bearing for quiz correctness in
/// this product — using green for "progress" here would train students to read
/// it as "correct" three screens before the quiz runner does. The accent means
/// «إنت هنا», and this is the same amber as the buttons on purpose.
///
/// ## It carries no semantics
///
/// [ExcludeSemantics], deliberately. The percentage is ALWAYS written in text
/// beside the bar — «خلصت ٦٠٪», or the mono `12 / 20` on a course card — so a
/// `progressbar` node here makes TalkBack read the same number twice, once as
/// a value and once as the sentence that already said it. The web marks the
/// rail's meter `aria-hidden` for exactly this reason. If a caller ever paints
/// this bar with no number next to it, the fix is to add the number, not to
/// turn the semantics back on.
///
/// ## The fill grows from the inline start
///
/// [AlignmentDirectional.centerStart] — the right edge in Arabic. A bar that
/// fills leftwards in an RTL layout reads as draining.
class AppProgressMeter extends StatelessWidget {
  const AppProgressMeter({required this.value, this.thickness = 4, super.key});

  /// The 2px hairline under a course title in the rail's list, where the bar
  /// is a texture rather than a control and anything thicker turns a list of
  /// five courses into a chart.
  const AppProgressMeter.rail({required this.value, super.key}) : thickness = 2;

  /// 0..1, not 0..100. The API sends `progressPercent` — divide at the call
  /// site so the unit is visible there.
  final double value;

  final double thickness;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);

    // `isFinite` first, and it is not defensive noise: a course with zero
    // published lessons gives `0 / 0`, and `double.nan.clamp(0, 1)` returns
    // 1.0 — NaN compares as greater than everything, so it takes the upper
    // limit. A brand-new empty course would render as FINISHED.
    final fraction = value.isFinite ? value.clamp(0.0, 1.0) : 0.0;

    return ExcludeSemantics(
      child: ClipRRect(
        borderRadius: AppRadius.fullAll,
        child: SizedBox(
          height: thickness,
          // Load-bearing. Without it the track sizes to the fill — a
          // `FractionallySizedBox` reports the fraction as its own width — and
          // a 20%-complete course would show a 20%-wide bar with no track
          // behind it, which reads as a course with almost nothing in it.
          width: double.infinity,
          child: ColoredBox(
            color: c.surface4,
            child: AnimatedFractionallySizedBox(
              alignment: AlignmentDirectional.centerStart,
              widthFactor: fraction,
              heightFactor: 1,
              // 300ms/ease-out — the web's `transition-[inline-size]`. The
              // animation exists because the bar moves WHILE the student
              // watches: finishing a lecture updates it in place, and a jump
              // cut loses the one moment the product has to show progress
              // being made.
              duration: MediaQuery.disableAnimationsOf(context)
                  ? Duration.zero
                  : AppMotion.modal,
              curve: AppMotion.out,
              child: ColoredBox(color: c.accent),
            ),
          ),
        ),
      ),
    );
  }
}
