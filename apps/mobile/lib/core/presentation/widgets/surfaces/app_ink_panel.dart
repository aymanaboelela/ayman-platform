import 'package:flutter/material.dart';

import '../../../theme/app_colors.dart';
import '../../../theme/app_radius.dart';
import '../../../theme/app_spacing.dart';

/// Which of the two ink surfaces the panel sits on.
enum AppInkLayer {
  /// `--ink` (#0F0C09) — the stage itself. The video frame, a code block, the
  /// hero.
  base,

  /// `--ink-2` (#1B1612) — something sitting ON the stage: a control bar under
  /// a player, a filename strip over a code block, a nested well.
  ///
  /// Only two steps exist, and that is the ceiling. A third near-black is
  /// indistinguishable on the phone screens this runs on and just costs
  /// someone an afternoon proving it.
  raised,
}

/// A panel that stays DARK IN BOTH THEMES — the web's `--ink` surface.
///
/// Used by the video stage, code windows, `.tile--ink` and the linkhub route.
/// Everything else on a light screen is light; these are the exceptions, and
/// they are exceptions on purpose: a video letterboxed against a near-white
/// card looks broken, and a syntax-highlighted block needs a dark ground for
/// its palette to mean anything.
///
/// ## It is near-NEUTRAL, not warm
///
/// `--ink` is `oklch(0.155 0.008 65)` — chroma 0.008, essentially none. The
/// token file says why: *"a brown-black stage under an orange key light mixes
/// into mud."* Do not "warm it up" to match the accent; the accent is what
/// gets to be warm, against this.
///
/// ## Foregrounds
///
/// Text is [AppColors.inkFg] and this panel installs it, so a plain [Text]
/// inside is legible without every call site remembering. Secondary text is
/// [AppColors.inkFg2] — which is tuned for THIS surface and fails on the ember
/// band, where `AppStageBand.secondaryForeground` is the right value instead.
///
/// ## No shadow, in either theme
///
/// In dark, nothing in this product casts one. In light, a near-black block on
/// a near-white page is already the most separated object on the screen; a
/// drop shadow under it only muddies the edge the border is drawing.
class AppInkPanel extends StatelessWidget {
  const AppInkPanel({
    required this.child,
    this.layer = AppInkLayer.base,
    this.padding = const EdgeInsets.all(AppSpacing.cardInset),
    this.margin,
    this.borderRadius = AppRadius.lgAll,
    this.bordered = true,
    this.clip = false,
    this.semanticLabel,
    super.key,
  });

  final Widget child;
  final AppInkLayer layer;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final BorderRadius borderRadius;

  /// `--ink-line`, white at 10%.
  ///
  /// Worth keeping on even in dark, where it is the only thing separating the
  /// panel from the `#08090A` page behind it. Turn it off only when the panel
  /// is butted against another ink surface and the two hairlines would double
  /// up into a visible 2px seam.
  final bool bordered;

  /// Clips the child to the corner radius.
  ///
  /// Off by default — a clip forces a save layer on every paint — but a video
  /// surface or a full-bleed thumbnail needs it, and those are half of this
  /// widget's callers. Turning it on for a code block that only holds text
  /// buys nothing and costs a layer per frame while it scrolls.
  final bool clip;

  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);

    // §7.4 — one physical device pixel, not 0.5 logical.
    final hairline = MediaQuery.devicePixelRatioOf(context) >= 2 ? 0.5 : 1.0;

    Widget content = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: switch (layer) {
          AppInkLayer.base => c.ink,
          AppInkLayer.raised => c.ink2,
        },
        borderRadius: borderRadius,
        border: bordered
            ? Border.all(color: c.inkLine, width: hairline)
            : null,
      ),
      child: DefaultTextStyle.merge(
        style: TextStyle(color: c.inkFg),
        child: IconTheme.merge(
          data: IconThemeData(color: c.inkFg),
          child: child,
        ),
      ),
    );

    if (clip) {
      content = ClipRRect(borderRadius: borderRadius, child: content);
    }

    if (margin != null) {
      content = Padding(padding: margin!, child: content);
    }

    return Semantics(
      label: semanticLabel,
      container: semanticLabel != null,
      child: content,
    );
  }
}
