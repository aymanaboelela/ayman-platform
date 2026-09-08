import 'package:flutter/material.dart';

import '../../../theme/app_colors.dart';
import '../../../theme/app_radius.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_text_style.dart';
import '../surfaces/app_panel.dart';
import 'app_divider.dart';

/// Which way the [AppStatTile.delta] moved.
///
/// The direction is carried by an ARROW, not by a colour. Green and red mean
/// exactly one thing in this product — the quiz marked this right, or wrong —
/// and spending them on «+١٢٪ عن الشهر اللي فات» teaches a student to stop
/// reading them where they matter. A finance figure that fell is a
/// down-arrow in muted ink, and it is legible at a glance without borrowing a
/// meaning it does not own.
enum AppStatDelta { up, down, flat }

/// One statistic — the web's `.tile` and the admin's `.stat-tile`.
///
/// A big number, a label under it, an optional glyph in an ember well, and an
/// optional note under a hairline. Used on the student dashboard («٤ كورسات»,
/// «٨٧٪») and across the admin finance screens.
///
/// ## The number is mono and tabular
///
/// A grid of four tiles whose figures do not line up column to column looks
/// broken before it looks wrong, and a value that ticks — a countdown, a live
/// revenue figure — jitters its own label sideways with proportional digits.
/// Hence [AppTypeScale.numeric]. Its leading is overridden to 1.1, per
/// `.tile__value`: the numeric builder inherits BODY leading (1.75), which at
/// title-2 size parks a 40pt empty band under the number and pushes the label
/// out of the tile.
///
/// ## `accent: true` is for ONE tile per screen
///
/// The accent variant is the web's `.tile--accent` / `.stat-tile--waiting`:
/// the well and the value turn amber to say "this is the number that needs
/// you" — payments waiting for review, a course about to close. Two of them on
/// one screen and neither reads as urgent. Note it is `accentText` (`--a-11`)
/// on the figure, never the solid `--a-9`, which measures 2.00:1 as text on
/// the light page.
class AppStatTile extends StatelessWidget {
  const AppStatTile({
    required this.value,
    required this.label,
    this.suffix,
    this.icon,
    this.delta,
    this.deltaDirection = AppStatDelta.flat,
    this.accent = false,
    this.onTap,
    super.key,
  });

  /// Pre-formatted. Arabic-Indic digits, thousands separators and currency are
  /// the caller's business — this widget only decides how the figure is set.
  final String value;

  final String label;

  /// A unit beside the number — «جنيه», «دقيقة». Set at body-small on the
  /// figure's baseline so it reads as an annotation, not as part of the value.
  final String? suffix;

  final IconData? icon;

  /// The note under the hairline: «+١٢ عن امبارح».
  final String? delta;

  final AppStatDelta deltaDirection;

  final bool accent;

  /// Makes the tile a link (`.tile--link`). No underline, no chevron, no lift
  /// — the panel warms its border on press and nothing moves, because a card
  /// that jumps under a thumb on a dense screen makes the whole page feel
  /// loose.
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    final figureColor = accent ? c.accentText : c.fg;
    final wellBackground =
        accent ? c.accent.withValues(alpha: 0.14) : c.studyTint;
    final wellForeground = accent ? c.accentText : c.study;

    final deltaIcon = switch (deltaDirection) {
      AppStatDelta.up => Icons.arrow_upward,
      AppStatDelta.down => Icons.arrow_downward,
      AppStatDelta.flat => Icons.remove,
    };

    return AppPanel(
      onTap: onTap,
      // The waiting tile states its own edge; every other tile keeps the
      // panel's default border so it can still warm on press.
      borderColor: accent ? c.accent.withValues(alpha: 0.38) : null,
      background: accent ? c.accent.withValues(alpha: 0.08) : null,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: AppSpacing.x12,
        children: [
          if (icon != null)
            Container(
              width: 40,
              height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: wellBackground,
                borderRadius: AppRadius.mdAll,
              ),
              // 16pt inside a 40pt well — every call site on the web passes
              // `size-4` and the well is what carries the visual weight.
              child: Icon(icon, size: 16, color: wellForeground),
            ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: AppSpacing.x2,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  spacing: AppSpacing.x4,
                  children: [
                    Flexible(
                      child: Text(
                        value,
                        style: type
                            .numeric(
                              size: type.title2.$1,
                              weight: AppTextStyle.semibold,
                              color: figureColor,
                            )
                            .copyWith(height: 1.1),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (suffix != null)
                      Text(suffix!, style: type.bodySm(color: c.fgMuted)),
                  ],
                ),
                Text(label, style: type.bodySm(color: c.fgMuted)),
                if (delta != null) ...[
                  const SizedBox(height: AppSpacing.x8),
                  const AppDivider(),
                  const SizedBox(height: AppSpacing.x8),
                  Row(
                    spacing: AppSpacing.x4,
                    children: [
                      Icon(deltaIcon, size: 14, color: c.fgFaint),
                      Flexible(
                        child: Text(
                          delta!,
                          style: type.bodyXs(color: c.fgMuted),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
