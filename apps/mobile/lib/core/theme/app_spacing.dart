import 'package:flutter/widgets.dart';

/// The spacing scale, transcribed from `packages/ui/src/tokens/space.css`.
///
/// The web scale is `2 4 8 12 16 20 24 32 48 64 80`. It is not a strict
/// multiple-of-4 ramp on purpose — 2 exists for hairline nudges and 20 exists
/// because 16 is too tight and 24 too loose for a card's inner padding.
///
/// These are LOGICAL pixels, deliberately NOT scaled by `flutter_screenutil`.
/// Scaling padding by device width makes a phone at 320dp and one at 430dp
/// render two different designs; the web app does not do that, and matching it
/// is the whole point. `ScreenUtil` is still used for the few places that
/// genuinely need proportion (hero heights, the player's aspect box).
abstract final class AppSpacing {
  static const double x2 = 2;
  static const double x4 = 4;
  static const double x8 = 8;
  static const double x12 = 12;
  static const double x16 = 16;
  static const double x20 = 20;
  static const double x24 = 24;
  static const double x32 = 32;
  static const double x48 = 48;
  static const double x64 = 64;
  static const double x80 = 80;

  /// The horizontal inset every full-width screen uses.
  ///
  /// 16, not 20 or 24: at 360dp — still the commonest Android width in Egypt —
  /// a 20pt gutter each side leaves 320dp of content, and the lesson row's
  /// title + duration + button stops fitting on one line.
  static const double screenInset = x16;

  /// The inner padding of a card or panel.
  static const double cardInset = x16;

  /// The gap between two stacked cards in a list.
  static const double stackGap = x12;

  /// The gap between a section header and its first child.
  static const double sectionGap = x24;

  /// Minimum hit target. iOS HIG says 44, Material says 48; the web token says
  /// 44 and every interactive element here must clear it, including the ones
  /// that only LOOK small (a 16pt icon in a row's trailing slot).
  static const double minTap = 44;

  static const EdgeInsets screenH = EdgeInsets.symmetric(
    horizontal: screenInset,
  );
  static const EdgeInsets card = EdgeInsets.all(cardInset);

  /// A list that runs to the bottom of the screen needs room under its last
  /// row for the tab bar, or the final item sits under it and looks clipped.
  static const EdgeInsets listBottom = EdgeInsets.only(bottom: x80);
}
