import 'package:flutter/material.dart';

import '../../../theme/app_colors.dart';
import '../../../theme/app_radius.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_text_style.dart';

/// What a badge is SAYING, which decides its colour.
///
/// Never decorative. A badge whose tone does not carry meaning should be
/// [neutral] — reaching for [ok] because green looks nice is how a student
/// learns to stop reading them.
enum AppBadgeTone { neutral, ok, err, warn, accent }

/// The status pill — «مقفول مؤقتاً», «تم الدفع», «قيد المراجعة», a mark, a count.
///
/// Transcribed from `packages/ui/src/components/badge.tsx`. It is a PILL, and
/// pills in this design are for status chips and avatars only — a pill-shaped
/// card is not a thing this product has.
///
/// The face is MONO, at `--fs-mono-label`, and that is deliberate even for
/// Arabic labels: a badge is a machine-readable marker rather than prose, and
/// the mono face plus its wider tracking is what separates it from the sentence
/// beside it at a glance.
class AppBadge extends StatelessWidget {
  const AppBadge({
    required this.label,
    this.tone = AppBadgeTone.neutral,
    this.icon,
    super.key,
  });

  final String label;
  final AppBadgeTone tone;

  /// A 12px leading glyph. Kept small on purpose — a badge that grows an icon
  /// bigger than its own text stops reading as a badge.
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final (foreground, border, background) = _colors(c);

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.x8,
        vertical: AppSpacing.x2,
      ),
      decoration: BoxDecoration(
        color: background,
        borderRadius: AppRadius.fullAll,
        border: Border.all(color: border, width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        spacing: AppSpacing.x4,
        children: [
          if (icon != null) Icon(icon, size: 12, color: foreground),
          Text(
            label,
            style: type.label(color: foreground, weight: AppTextStyle.medium),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  /// `(text, border, background)`.
  ///
  /// The alpha figures — 30% border, 8% fill — are the web's and are what keep
  /// a row of five badges from turning a table into a colour chart.
  (Color, Color, Color) _colors(AppColors c) {
    return switch (tone) {
      AppBadgeTone.neutral => (c.fgMuted, c.line, c.surface3),
      AppBadgeTone.ok => (
          c.ok,
          c.ok.withValues(alpha: 0.30),
          c.ok.withValues(alpha: 0.08),
        ),
      AppBadgeTone.err => (
          c.err,
          c.err.withValues(alpha: 0.30),
          c.err.withValues(alpha: 0.08),
        ),
      AppBadgeTone.warn => (
          c.warn,
          c.warn.withValues(alpha: 0.30),
          c.warn.withValues(alpha: 0.08),
        ),
      // Text from `--a-11`, not `--a-9`: the solid accent does not clear 4.5:1
      // as a foreground in light mode.
      AppBadgeTone.accent => (
          c.accentText,
          c.accent.withValues(alpha: 0.30),
          c.accent.withValues(alpha: 0.08),
        ),
    };
  }
}
