import 'package:flutter/material.dart';

import '../../../theme/app_colors.dart';

/// Pull-to-refresh, in the app's colours, around any scrollable.
///
/// ## The short-list trap
///
/// A [RefreshIndicator] only fires when its scrollable actually reports an
/// overscroll, and a list of three rows on a tall phone does not scroll at
/// all — so on exactly the screens a student is most likely to pull (an empty
/// «كتبي», a dashboard that failed half its reads) the gesture does nothing
/// and the app looks frozen. The fix is `AlwaysScrollableScrollPhysics`, and
/// it is installed here through [ScrollConfiguration] rather than being left
/// to every call site to remember.
///
/// That inheritance has one seam worth knowing: a child that passes its own
/// `physics:` wins over the configuration. If a screen sets
/// `physics: ClampingScrollPhysics()` on its list, it must write
/// `AlwaysScrollableScrollPhysics(parent: ClampingScrollPhysics())` itself or
/// pull-to-refresh quietly stops working there.
///
/// ## Colours
///
/// The disc is `surface2` and the arc is the accent, which is the same pairing
/// a panel and its progress bar use. It is deliberately NOT an amber disc:
/// amber is reserved for things you press, and a spinner is a report, not a
/// control.
///
/// The elevation drops to zero in dark. Every shadow token in this design is
/// transparent there — panels separate by surface value and a 4.5%-white top
/// edge — so a floating Material disc with a real drop shadow is the one
/// object on a dark screen casting one.
class AppRefreshWrapper extends StatelessWidget {
  const AppRefreshWrapper({
    required this.onRefresh,
    required this.child,
    this.edgeOffset = 0,
    super.key,
  });

  /// Resolve only when the new data is in hand. The indicator stays up for the
  /// life of this future, so returning early makes a slow network look
  /// instantaneous and then repaint under the student's thumb.
  final Future<void> Function() onRefresh;

  /// The scrollable being wrapped.
  final Widget child;

  /// Where the indicator starts from, for a scrollable that sits under a
  /// pinned header — otherwise it appears behind it.
  final double edgeOffset;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);

    return ScrollConfiguration(
      behavior: ScrollConfiguration.of(context)
          .copyWith(physics: const AlwaysScrollableScrollPhysics()),
      child: RefreshIndicator(
        onRefresh: onRefresh,
        edgeOffset: edgeOffset,
        color: c.accent,
        backgroundColor: c.surface2,
        // 2pt, the same stroke AppButton's inline spinner uses. Material's
        // default 2.5 reads noticeably heavier beside it.
        strokeWidth: 2,
        elevation: c.isDark ? 0 : 2,
        child: child,
      ),
    );
  }
}
