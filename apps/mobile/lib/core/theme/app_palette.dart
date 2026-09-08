import 'package:flutter/material.dart';

/// The RAW colour ramps, transcribed from `packages/ui/src/tokens/color.css`.
///
/// Nothing in the app reads this file directly — it exists so that the two
/// surfaces (web and mobile) can be diffed step for step. Widgets read
/// [AppColors] instead, which names the same values by JOB.
///
/// The web declares these in OKLCH. Flutter has no OKLCH, so every ramp below
/// is the sRGB conversion of the exact same declaration, computed rather than
/// eyeballed (OKLab → linear sRGB → gamma). Where the web already wrote a hex
/// (the neutrals), the hex is copied verbatim.
///
/// ⚠️ When `color.css` changes, change this file in the same commit. See the
/// parity rule in CLAUDE.md.
abstract final class AppPalette {
  // ── neutral — warm-leaning, hue ≈ 70 at very low chroma ──────────────────
  // 1 app bg · 2 subtle bg · 3 UI bg · 4 hover · 5 active · 6 subtle border
  // 7 border+focus · 8 hover border · 9 solid · 10 solid hover
  // 11 low-contrast text · 12 high-contrast text
  static const nLight = <int, Color>{
    1: Color(0xFFFDFCFB),
    2: Color(0xFFF9F8F6),
    3: Color(0xFFF4F2EF),
    4: Color(0xFFECEAE6),
    5: Color(0xFFE5E2DD),
    6: Color(0xFFE0DCD7),
    7: Color(0xFFDAD6D0),
    8: Color(0xFFBEB9B1),
    9: Color(0xFF918C84),
    10: Color(0xFF807B73),
    11: Color(0xFF666158),
    12: Color(0xFF1A1714),
  };

  /// `--n-1` stays a true near-black stage; the warmth starts at step 2 and
  /// climbs. Warming step 1 is what turns a dark UI sepia.
  static const nDark = <int, Color>{
    1: Color(0xFF08090A),
    2: Color(0xFF100F0E),
    3: Color(0xFF171512),
    4: Color(0xFF1F1C18),
    5: Color(0xFF26221D),
    6: Color(0xFF29251F),
    7: Color(0xFF332E27),
    8: Color(0xFF423C33),
    9: Color(0xFF78716A),
    10: Color(0xFF8A837B),
    11: Color(0xFFB4ACA3),
    12: Color(0xFFF1EEEB),
  };

  // ── accent — terminal amber. THE brand colour, and the only "press me" ────
  // Green/red are reserved for quiz correctness so neither can be the brand;
  // indigo is the AI default and is disqualified.
  static const aLight = <int, Color>{
    9: Color(0xFFEFA22C),
    10: Color(0xFFE59114),
    11: Color(0xFF995600),
    12: Color(0xFF43260A),
  };

  static const aDark = <int, Color>{
    9: Color(0xFFF0A732),
    10: Color(0xFFFBB541),
    11: Color(0xFFFBC162),
    12: Color(0xFFFFDFA0),
  };

  // ── ember (--e-*) — STRUCTURE, hue 35. Never an action, never a status ────
  // The course stage, unit headers, chapter chrome. Same eleven steps in both
  // themes; only which step each JOB reads changes. See [AppColors.stage].
  static const e = <int, Color>{
    50: Color(0xFFFDF5F3),
    100: Color(0xFFFEE7E2),
    200: Color(0xFFFDD4CA),
    300: Color(0xFFF0B7A8),
    400: Color(0xFFEE9078),
    500: Color(0xFFE76444),
    600: Color(0xFFC1401F),
    700: Color(0xFF99351B),
    800: Color(0xFF762915),
    900: Color(0xFF591F11),
    950: Color(0xFF301008),
  };

  // ── the marketing ramp (--p-*) — one brand orange, shared with the site ───
  // `--p-400` is the accent restated as a ramp step; chroma peaks in the
  // middle and falls off at both ends so a tint never stains and a shade
  // never muddies.
  static const p = <int, Color>{
    50: Color(0xFFFFF9F0),
    100: Color(0xFFFFEFDB),
    200: Color(0xFFFEDFB5),
    300: Color(0xFFFBC785),
    400: Color(0xFFF8A84F),
    500: Color(0xFFF28318),
    600: Color(0xFFE35D00),
    700: Color(0xFFBA4500),
    800: Color(0xFF8B3509),
    900: Color(0xFF642908),
    950: Color(0xFF341302),
  };

  // ── panels that stay dark in BOTH themes ─────────────────────────────────
  // The hero stage, code windows, player chrome. Near-neutral rather than
  // warm on purpose: a brown-black stage under an orange key light mixes into
  // mud, and the accent has to be the only warm thing in frame.
  static const ink = Color(0xFF0F0C09);
  static const ink2 = Color(0xFF1B1612);
  static const inkFg = Color(0xFFF6F3EE);
  static const inkFg2 = Color(0xFFC0B5AA);
  static const inkLine = Color(0x1AFFFFFF);

  // ── semantic — never brand, never decorative ─────────────────────────────
  // Two sets, not one: the OKLCH numbers that read well on #08090A measure
  // about 2:1 on #FDFCFB, which is why a single shared declaration was wrong.
  static const okLight = Color(0xFF037031);
  static const errLight = Color(0xFFC01323);
  static const warnLight = Color(0xFF7B5B02);
  static const infoLight = Color(0xFF0265A0);

  static const okDark = Color(0xFF3BB360);
  static const errDark = Color(0xFFE64343);
  static const warnDark = Color(0xFFD6A62E);
  static const infoDark = Color(0xFF288DD4);

  // ── borders are ALPHA, never solid ───────────────────────────────────────
  // A solid #EAEAEA looks wrong the moment it crosses a tinted background.
  static const borderSubtleLight = Color(0x14000000);
  static const borderLight = Color(0x1F000000);
  static const borderStrongLight = Color(0x33000000);

  static const borderSubtleDark = Color(0x12FFFFFF);
  static const borderDark = Color(0x1FFFFFFF);
  static const borderStrongDark = Color(0x33FFFFFF);
}
