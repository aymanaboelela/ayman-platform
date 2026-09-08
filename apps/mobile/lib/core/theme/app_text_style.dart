import 'package:flutter/widgets.dart';

/// The type scale, transcribed from `packages/ui/src/tokens/typography.css`.
///
/// The web declares sizes in `rem` against a 16px root and never overrides the
/// root font-size, so every value below is `rem × 16` — the same pixel size the
/// browser paints. Flutter's logical pixels and CSS px are the same unit, so
/// nothing needs converting beyond that.
///
/// Line heights differ BY LANGUAGE in the web tokens: Arabic needs more
/// leading than Latin at the same size because its ascenders and descenders
/// reach further. [arabic] and [latin] carry the two sets; [of] picks by the
/// active locale so a screen never has to think about it.
abstract final class AppTextStyle {
  static const String sans = 'PlexArabic';
  static const String mono = 'PlexMono';

  // ── weights ──────────────────────────────────────────────────────────────
  static const FontWeight regular = FontWeight.w400;
  static const FontWeight medium = FontWeight.w500;
  static const FontWeight semibold = FontWeight.w600;
  static const FontWeight bold = FontWeight.w700;

  // ── tracking ─────────────────────────────────────────────────────────────
  // The web writes these in `em`; Flutter's `letterSpacing` is in logical
  // pixels, so each call site multiplies by its own font size.
  static const double trackingTightEm = -0.022;
  static const double trackingLabelEm = 0.06;

  /// Arabic leading. This is the default — Arabic is the primary language.
  static const AppTypeScale arabic = AppTypeScale(
    display1: (56, 1.15),
    display2: (40, 1.2),
    title1: (32, 1.3),
    title2: (24, 1.4),
    title3: (20, 1.45),
    title4: (17, 1.5),
    textLg: (17, 1.75),
    textBase: (15, 1.75),
    textSm: (14, 1.65),
    textXs: (13, 1.55),
    monoLabel: (12, 1.4),
  );

  /// Latin leading — tighter at every step, per `:lang(en)` in the web tokens.
  static const AppTypeScale latin = AppTypeScale(
    display1: (56, 1),
    display2: (40, 1.05),
    title1: (32, 1.15),
    title2: (24, 1.25),
    title3: (20, 1.3),
    title4: (17, 1.35),
    textLg: (17, 1.6),
    textBase: (15, 1.6),
    textSm: (14, 1.5),
    textXs: (13, 1.4),
    monoLabel: (12, 1.4),
  );

  /// The scale for the locale currently in force.
  static AppTypeScale of(BuildContext context) =>
      Localizations.localeOf(context).languageCode == 'en' ? latin : arabic;
}

/// One (size, lineHeight) pair per named step, plus the builders that turn a
/// step into a [TextStyle].
///
/// Kept as a class rather than a map so a typo is a compile error.
@immutable
class AppTypeScale {
  const AppTypeScale({
    required this.display1,
    required this.display2,
    required this.title1,
    required this.title2,
    required this.title3,
    required this.title4,
    required this.textLg,
    required this.textBase,
    required this.textSm,
    required this.textXs,
    required this.monoLabel,
  });

  /// `(fontSize, lineHeightMultiple)` — Flutter's `height` is already a
  /// multiple of font size, which is what the web's unitless `line-height` is
  /// too, so the number transfers unchanged.
  final (double, double) display1;
  final (double, double) display2;
  final (double, double) title1;
  final (double, double) title2;
  final (double, double) title3;
  final (double, double) title4;
  final (double, double) textLg;
  final (double, double) textBase;
  final (double, double) textSm;
  final (double, double) textXs;
  final (double, double) monoLabel;

  TextStyle _sans(
    (double, double) step, {
    required FontWeight weight,
    double trackingEm = 0,
    Color? color,
  }) {
    final (size, height) = step;
    return TextStyle(
      fontFamily: AppTextStyle.sans,
      fontSize: size,
      height: height,
      fontWeight: weight,
      letterSpacing: trackingEm == 0 ? null : trackingEm * size,
      color: color,
      // The Arabic faces carry their own metrics; letting Flutter synthesise a
      // bold or an oblique produces a smeared glyph the web explicitly blocks
      // with `font-synthesis-weight: none`.
      fontFamilyFallback: const ['Arial'],
    );
  }

  // Display and titles carry tight tracking; body text does not. Tightening
  // 15px body copy costs legibility and buys nothing.
  TextStyle display1Style({Color? color}) => _sans(
    display1,
    weight: AppTextStyle.bold,
    trackingEm: AppTextStyle.trackingTightEm,
    color: color,
  );

  TextStyle display2Style({Color? color}) => _sans(
    display2,
    weight: AppTextStyle.bold,
    trackingEm: AppTextStyle.trackingTightEm,
    color: color,
  );

  TextStyle title1Style({Color? color}) => _sans(
    title1,
    weight: AppTextStyle.bold,
    trackingEm: AppTextStyle.trackingTightEm,
    color: color,
  );

  TextStyle title2Style({Color? color}) => _sans(
    title2,
    weight: AppTextStyle.bold,
    trackingEm: AppTextStyle.trackingTightEm,
    color: color,
  );

  TextStyle title3Style({Color? color}) =>
      _sans(title3, weight: AppTextStyle.semibold, color: color);

  TextStyle title4Style({Color? color}) =>
      _sans(title4, weight: AppTextStyle.semibold, color: color);

  TextStyle bodyLg({Color? color, FontWeight? weight}) =>
      _sans(textLg, weight: weight ?? AppTextStyle.regular, color: color);

  TextStyle body({Color? color, FontWeight? weight}) =>
      _sans(textBase, weight: weight ?? AppTextStyle.regular, color: color);

  TextStyle bodySm({Color? color, FontWeight? weight}) =>
      _sans(textSm, weight: weight ?? AppTextStyle.regular, color: color);

  TextStyle bodyXs({Color? color, FontWeight? weight}) =>
      _sans(textXs, weight: weight ?? AppTextStyle.regular, color: color);

  /// The uppercase mono label: section eyebrows, the counter in the rail, a
  /// course's term marker. Latin-only by nature — it is where the mono face is
  /// allowed and the only place tracking opens up.
  TextStyle label({Color? color, FontWeight? weight}) {
    final (size, height) = monoLabel;
    return TextStyle(
      fontFamily: AppTextStyle.mono,
      fontSize: size,
      height: height,
      fontWeight: weight ?? AppTextStyle.semibold,
      letterSpacing: AppTextStyle.trackingLabelEm * size,
      color: color,
    );
  }

  /// Numbers that must line up in a column — prices, marks, durations,
  /// countdowns. Tabular figures stop a ticking clock from jittering.
  TextStyle numeric({Color? color, FontWeight? weight, double? size}) {
    final (base, height) = textBase;
    return TextStyle(
      fontFamily: AppTextStyle.mono,
      fontSize: size ?? base,
      height: height,
      fontWeight: weight ?? AppTextStyle.medium,
      color: color,
      fontFeatures: const [FontFeature.tabularFigures()],
    );
  }
}
