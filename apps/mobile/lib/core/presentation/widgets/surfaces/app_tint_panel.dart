import 'package:flutter/material.dart';

import '../../../theme/app_colors.dart';
import '../../../theme/app_radius.dart';
import '../../../theme/app_spacing.dart';

/// Which ember wash the panel carries — and the two are NOT interchangeable.
///
/// They resolve to the same `--e-50` in light and to two different steps in
/// dark, which is exactly why picking the wrong one passes review on a light
/// phone and is reported the same evening as «اللون وحش».
enum AppTintSurface {
  /// `--e-tint` — `--e-50` light / `--e-950` dark. A panel BODY: an open unit
  /// header, a «تم» chip's ground, a callout with a sentence in it.
  ///
  /// The dark value sits ~1% in lightness off the `#08090A` page, which is the
  /// point — a body wash must not compete with the text it is carrying.
  body,

  /// `--e-art` — `--e-50` light / `--e-900` dark. A decorative BANNER, with
  /// nothing to read on it: the drawn strip at the top of an `.aside-card`,
  /// a subject-art block.
  ///
  /// Deliberately five steps brighter than [body] in dark. `--e-tint` was used
  /// here first and the banner simply vanished into the page.
  art,
}

/// A panel carrying the ember TINT wash — the web's `--e-tint` / `--e-art`
/// surfaces.
///
/// The quiet end of the ember ramp. Where `AppStageBand` is the loud
/// structural band that opens a page, this is the same STRUCTURE colour used
/// at a whisper: the unit you have open, the lesson you have finished, the
/// note attached to a course. Still never an action — ember is structure,
/// amber is what you press.
///
/// Text on it is [AppColors.study] (`--e-ink`), installed here so a plain
/// [Text] inside comes out right: `--e-600` on the light page measures 5.04:1
/// and `--e-300` on the dark page 11.37:1, whereas [AppColors.fg] on this wash
/// reads as an ordinary panel that someone tinted by mistake.
///
/// Pick the surface by whether anything on it must be READ — see
/// [AppTintSurface]. When in doubt it is [AppTintSurface.body]: a body wash
/// under decoration is merely subtle, an art wash under text is unreadable in
/// one of the two themes.
class AppTintPanel extends StatelessWidget {
  const AppTintPanel({
    required this.child,
    this.surface = AppTintSurface.body,
    this.padding = const EdgeInsets.all(AppSpacing.cardInset),
    this.margin,
    this.borderRadius = AppRadius.lgAll,
    this.bordered = true,
    this.clip = false,
    this.semanticLabel,
    super.key,
  });

  final Widget child;
  final AppTintSurface surface;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final BorderRadius borderRadius;

  /// `--e-tint-line` — `--e-200` light / `--e-800` dark.
  ///
  /// On by default. It is the border colour `.unit[open]` switches to, and it
  /// is what says "the one you are in" at a glance from the top of a long
  /// outline; without it an open unit and a closed one differ only by a wash
  /// that is nearly invisible in dark.
  final bool bordered;

  /// See `AppInkPanel.clip` — same save-layer trade, same default. Turn it on
  /// for a banner with a drawn shape running to the corners.
  final bool clip;

  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);

    // §7.4 — one physical device pixel. This border is a low-contrast tint on
    // a low-contrast tint, so a half-painted hairline erases it outright.
    final hairline = MediaQuery.devicePixelRatioOf(context) >= 2 ? 0.5 : 1.0;

    Widget content = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: switch (surface) {
          AppTintSurface.body => c.studyTint,
          AppTintSurface.art => c.studyArt,
        },
        borderRadius: borderRadius,
        border: bordered
            ? Border.all(color: c.studyLine, width: hairline)
            : null,
      ),
      child: DefaultTextStyle.merge(
        style: TextStyle(color: c.study),
        child: IconTheme.merge(
          data: IconThemeData(color: c.study),
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
