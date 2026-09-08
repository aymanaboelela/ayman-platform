import 'package:flutter/material.dart';

import '../../../theme/app_colors.dart';
import '../../../theme/app_spacing.dart';

/// The hairline rule — the web's `--hairline` on `--border`.
///
/// ## Why the thickness is measured, not a constant
///
/// The web's rule is 0.5px on a 2dppx display and 1px below that, and the same
/// arithmetic has to happen here: 0.5 logical pixels is half a device pixel on
/// a 1x screen, which Skia renders as a 50%-alpha grey — a rule that is
/// already at 12% alpha then paints at 6% and disappears. Every phone this
/// ships to is 2x or better, so the 1.0 branch is for the emulator and the
/// desktop debug target, but a divider nobody can see on the machine the
/// designer is checking on is exactly the kind of thing that gets "fixed" by
/// darkening the token for everyone.
///
/// ## The list inset
///
/// [AppDivider.list] starts the rule 60pt in — 12pt of row padding, a 36pt
/// leading well, and the 12pt gap after it — so the line begins under the
/// title rather than under the icon. A full-bleed rule between two rows that
/// both have wells reads as a table border; the inset one reads as a list.
class AppDivider extends StatelessWidget {
  const AppDivider({this.startInset = 0, this.endInset = 0, this.space = 0, super.key});

  /// A rule between two `AppListRow`s, aligned to the title rather than to the
  /// leading well.
  const AppDivider.list({this.space = 0, super.key})
      : startInset = AppSpacing.x12 + 36 + AppSpacing.x12,
        endInset = 0;

  /// Inset from the inline START — the RIGHT edge under RTL.
  final double startInset;

  /// Inset from the inline END.
  final double endInset;

  /// Total vertical box the rule occupies, centred. 0 means the rule is
  /// exactly as tall as itself and the caller owns the spacing around it,
  /// which is what a [Column] with its own `spacing` wants.
  final double space;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final thickness =
        MediaQuery.devicePixelRatioOf(context) >= 2 ? 0.5 : 1.0;

    return Container(
      height: thickness,
      margin: EdgeInsetsDirectional.only(
        start: startInset,
        end: endInset,
        top: space / 2,
        bottom: space / 2,
      ),
      color: c.line,
    );
  }
}
