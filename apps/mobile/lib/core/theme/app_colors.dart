import 'package:flutter/material.dart';

import 'app_palette.dart';

/// Every colour the app is allowed to paint, named by JOB rather than by step.
///
/// This is the mobile twin of the `@theme inline` block in
/// `apps/web/app/globals.css`: the raw ramps live in [AppPalette], and this
/// layer says which step does which job in which theme. A widget that reaches
/// past this into [AppPalette] has hard-coded a theme and will be wrong in the
/// other one.
///
/// Read it from context, never as a global:
/// ```dart
/// final c = AppColors.of(context);
/// Container(color: c.surface2);
/// ```
@immutable
class AppColors extends ThemeExtension<AppColors> {
  const AppColors({
    required this.brightness,
    required this.surface1,
    required this.surface2,
    required this.surface3,
    required this.surface4,
    required this.surfaceActive,
    required this.lineSubtle,
    required this.line,
    required this.lineStrong,
    required this.fg,
    required this.fgMuted,
    required this.fgFaint,
    required this.accent,
    required this.accentHover,
    required this.accentText,
    required this.accentContrast,
    required this.stage,
    required this.stageDeep,
    required this.study,
    required this.studyTint,
    required this.studyLine,
    required this.studyArt,
    required this.ok,
    required this.err,
    required this.warn,
    required this.info,
    required this.ink,
    required this.ink2,
    required this.inkFg,
    required this.inkFg2,
    required this.inkLine,
  });

  /// Which theme this instance describes. Lets a widget branch on the theme
  /// without reaching for `Theme.of(context).brightness` and getting them out
  /// of step during a cross-fade.
  final Brightness brightness;

  /// 1 app background · 2 subtle panel · 3 UI chip/field · 4 hover.
  final Color surface1;
  final Color surface2;
  final Color surface3;
  final Color surface4;

  /// Step 5 — the pressed/selected state of a [surface4] hover.
  final Color surfaceActive;

  final Color lineSubtle;
  final Color line;
  final Color lineStrong;

  /// 12 high-contrast text · 11 low-contrast text · 10 the faintest legible.
  final Color fg;
  final Color fgMuted;
  final Color fgFaint;

  /// The one "press me" colour. Solid fills only.
  final Color accent;
  final Color accentHover;

  /// The accent as TEXT on a page background — a different step, because the
  /// solid fill does not clear 4.5:1 as a foreground in light mode.
  final Color accentText;

  /// What sits ON [accent]. Fixed near-black in both themes: amber is a light
  /// colour and white on it never clears contrast.
  final Color accentContrast;

  /// Ember — STRUCTURE. A band that carries white text.
  final Color stage;
  final Color stageDeep;

  /// Ember as ink on the page background.
  final Color study;

  /// A wash a card BODY can carry behind text.
  final Color studyTint;
  final Color studyLine;

  /// A tinted BANNER — a card's picture area, with nothing to read on it.
  /// Deliberately brighter than [studyTint] in dark, where a body wash sits
  /// one percent off the page and a banner at that value simply disappears.
  final Color studyArt;

  final Color ok;
  final Color err;
  final Color warn;
  final Color info;

  /// Panels that stay dark in BOTH themes — the video stage, code windows.
  final Color ink;
  final Color ink2;
  final Color inkFg;
  final Color inkFg2;
  final Color inkLine;

  static const light = AppColors(
    brightness: Brightness.light,
    surface1: Color(0xFFFDFCFB),
    surface2: Color(0xFFF9F8F6),
    surface3: Color(0xFFF4F2EF),
    surface4: Color(0xFFECEAE6),
    surfaceActive: Color(0xFFE5E2DD),
    lineSubtle: AppPalette.borderSubtleLight,
    line: AppPalette.borderLight,
    lineStrong: AppPalette.borderStrongLight,
    fg: Color(0xFF1A1714),
    fgMuted: Color(0xFF666158),
    fgFaint: Color(0xFF807B73),
    accent: Color(0xFFEFA22C),
    accentHover: Color(0xFFE59114),
    accentText: Color(0xFF995600),
    accentContrast: Color(0xFF1A1714),
    stage: Color(0xFF99351B), // --e-700
    stageDeep: Color(0xFF762915), // --e-800
    study: Color(0xFFC1401F), // --e-600
    studyTint: Color(0xFFFDF5F3), // --e-50
    studyLine: Color(0xFFFDD4CA), // --e-200
    studyArt: Color(0xFFFDF5F3), // --e-50
    ok: AppPalette.okLight,
    err: AppPalette.errLight,
    warn: AppPalette.warnLight,
    info: AppPalette.infoLight,
    ink: AppPalette.ink,
    ink2: AppPalette.ink2,
    inkFg: AppPalette.inkFg,
    inkFg2: AppPalette.inkFg2,
    inkLine: AppPalette.inkLine,
  );

  static const dark = AppColors(
    brightness: Brightness.dark,
    surface1: Color(0xFF08090A),
    surface2: Color(0xFF100F0E),
    surface3: Color(0xFF171512),
    surface4: Color(0xFF1F1C18),
    surfaceActive: Color(0xFF26221D),
    lineSubtle: AppPalette.borderSubtleDark,
    line: AppPalette.borderDark,
    lineStrong: AppPalette.borderStrongDark,
    fg: Color(0xFFF1EEEB),
    fgMuted: Color(0xFFB4ACA3),
    fgFaint: Color(0xFF8A837B),
    accent: Color(0xFFF0A732),
    accentHover: Color(0xFFFBB541),
    accentText: Color(0xFFFBC162),
    accentContrast: Color(0xFF1A1714),
    stage: Color(0xFF762915), // --e-800
    stageDeep: Color(0xFF591F11), // --e-900
    study: Color(0xFFF0B7A8), // --e-300
    studyTint: Color(0xFF301008), // --e-950
    studyLine: Color(0xFF762915), // --e-800
    studyArt: Color(0xFF591F11), // --e-900
    ok: AppPalette.okDark,
    err: AppPalette.errDark,
    warn: AppPalette.warnDark,
    info: AppPalette.infoDark,
    ink: AppPalette.ink,
    ink2: AppPalette.ink2,
    inkFg: AppPalette.inkFg,
    inkFg2: AppPalette.inkFg2,
    inkLine: AppPalette.inkLine,
  );

  /// The colours for the theme currently in force.
  ///
  /// Falls back to [light] rather than throwing: a widget rendered outside a
  /// themed subtree (a golden test, a bare `MaterialApp` in a spec) should
  /// paint something sane instead of crashing the tree.
  static AppColors of(BuildContext context) =>
      Theme.of(context).extension<AppColors>() ?? light;

  bool get isDark => brightness == Brightness.dark;

  @override
  AppColors copyWith({
    Brightness? brightness,
    Color? surface1,
    Color? surface2,
    Color? surface3,
    Color? surface4,
    Color? surfaceActive,
    Color? lineSubtle,
    Color? line,
    Color? lineStrong,
    Color? fg,
    Color? fgMuted,
    Color? fgFaint,
    Color? accent,
    Color? accentHover,
    Color? accentText,
    Color? accentContrast,
    Color? stage,
    Color? stageDeep,
    Color? study,
    Color? studyTint,
    Color? studyLine,
    Color? studyArt,
    Color? ok,
    Color? err,
    Color? warn,
    Color? info,
    Color? ink,
    Color? ink2,
    Color? inkFg,
    Color? inkFg2,
    Color? inkLine,
  }) {
    return AppColors(
      brightness: brightness ?? this.brightness,
      surface1: surface1 ?? this.surface1,
      surface2: surface2 ?? this.surface2,
      surface3: surface3 ?? this.surface3,
      surface4: surface4 ?? this.surface4,
      surfaceActive: surfaceActive ?? this.surfaceActive,
      lineSubtle: lineSubtle ?? this.lineSubtle,
      line: line ?? this.line,
      lineStrong: lineStrong ?? this.lineStrong,
      fg: fg ?? this.fg,
      fgMuted: fgMuted ?? this.fgMuted,
      fgFaint: fgFaint ?? this.fgFaint,
      accent: accent ?? this.accent,
      accentHover: accentHover ?? this.accentHover,
      accentText: accentText ?? this.accentText,
      accentContrast: accentContrast ?? this.accentContrast,
      stage: stage ?? this.stage,
      stageDeep: stageDeep ?? this.stageDeep,
      study: study ?? this.study,
      studyTint: studyTint ?? this.studyTint,
      studyLine: studyLine ?? this.studyLine,
      studyArt: studyArt ?? this.studyArt,
      ok: ok ?? this.ok,
      err: err ?? this.err,
      warn: warn ?? this.warn,
      info: info ?? this.info,
      ink: ink ?? this.ink,
      ink2: ink2 ?? this.ink2,
      inkFg: inkFg ?? this.inkFg,
      inkFg2: inkFg2 ?? this.inkFg2,
      inkLine: inkLine ?? this.inkLine,
    );
  }

  @override
  AppColors lerp(covariant AppColors? other, double t) {
    if (other == null) return this;
    Color c(Color a, Color b) => Color.lerp(a, b, t)!;
    return AppColors(
      brightness: t < 0.5 ? brightness : other.brightness,
      surface1: c(surface1, other.surface1),
      surface2: c(surface2, other.surface2),
      surface3: c(surface3, other.surface3),
      surface4: c(surface4, other.surface4),
      surfaceActive: c(surfaceActive, other.surfaceActive),
      lineSubtle: c(lineSubtle, other.lineSubtle),
      line: c(line, other.line),
      lineStrong: c(lineStrong, other.lineStrong),
      fg: c(fg, other.fg),
      fgMuted: c(fgMuted, other.fgMuted),
      fgFaint: c(fgFaint, other.fgFaint),
      accent: c(accent, other.accent),
      accentHover: c(accentHover, other.accentHover),
      accentText: c(accentText, other.accentText),
      accentContrast: c(accentContrast, other.accentContrast),
      stage: c(stage, other.stage),
      stageDeep: c(stageDeep, other.stageDeep),
      study: c(study, other.study),
      studyTint: c(studyTint, other.studyTint),
      studyLine: c(studyLine, other.studyLine),
      studyArt: c(studyArt, other.studyArt),
      ok: c(ok, other.ok),
      err: c(err, other.err),
      warn: c(warn, other.warn),
      info: c(info, other.info),
      ink: c(ink, other.ink),
      ink2: c(ink2, other.ink2),
      inkFg: c(inkFg, other.inkFg),
      inkFg2: c(inkFg2, other.inkFg2),
      inkLine: c(inkLine, other.inkLine),
    );
  }
}
