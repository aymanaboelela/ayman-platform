import 'package:flutter/widgets.dart';

/// Corner radii, transcribed from `packages/ui/src/tokens/space.css`.
///
/// ⚠️ These are SMALL and that is the design, not an oversight. 8px is the
/// ceiling for any rectangle — cards, sheets, dialogs, video frames. The
/// Flutter default instinct (12–20px, Material 3's own `large` is 16) reads as
/// a different product beside the web app, so nothing here should be rounded
/// "a bit more because it's a phone".
///
/// [full] is for PILLS ONLY: status chips, avatars, the segmented control's
/// thumb. A pill-shaped card is not a thing this design has.
abstract final class AppRadius {
  /// Badges, `kbd`, the tiny numeric counters.
  static const double xs = 3;

  /// Inputs, buttons, chips.
  static const double sm = 4;

  /// The default for anything that does not name one.
  static const double md = 6;

  /// Cards, sheets, dialogs, code blocks, media frames — the ceiling.
  static const double lg = 8;

  /// Pills only.
  static const double full = 999;

  static const BorderRadius xsAll = BorderRadius.all(Radius.circular(xs));
  static const BorderRadius smAll = BorderRadius.all(Radius.circular(sm));
  static const BorderRadius mdAll = BorderRadius.all(Radius.circular(md));
  static const BorderRadius lgAll = BorderRadius.all(Radius.circular(lg));
  static const BorderRadius fullAll = BorderRadius.all(Radius.circular(full));

  /// A bottom sheet: rounded at the top, square where it meets the screen
  /// edge. Rounding all four corners of a sheet that is flush with the bottom
  /// of the display leaves two slivers of page showing under it.
  static const BorderRadius sheetTop = BorderRadius.vertical(
    top: Radius.circular(lg),
  );
}
