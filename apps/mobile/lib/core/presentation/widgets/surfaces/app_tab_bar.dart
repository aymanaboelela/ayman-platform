import 'package:flutter/material.dart';

import '../../../theme/app_spacing.dart';

/// The segmented tab strip that splits one screen into panes — «الكتالوج /
/// الطلبات», «الأسئلة / الإجابات», the admin section switchers.
///
/// A THIN wrapper over Material's [TabBar], on purpose. `app_theme.dart`
/// already declares the product's `TabBarThemeData` — label-width indicator,
/// the accent as the indicator colour, `line` at 0.5 for the divider, the
/// semibold/regular label pair — and the fastest way to diverge from it is to
/// hand-paint an indicator that quietly stops reading the theme. Everything
/// visual here comes from that theme; this class only fixes the three things
/// the Material defaults get wrong for this product.
///
/// ## 1. It is CONTROLLED by an index, not by a [TabController]
///
/// Screens in this app hold their state in a bloc, and a [TabController] is a
/// second source of truth for the same integer. This widget owns a controller
/// internally and keeps it in step with [selectedIndex]; the caller sees a
/// plain index and a callback, exactly like the rest of the surfaces. If the
/// caller ignores [onChanged], the strip snaps back — which is correct, because
/// the pane below it did not change either.
///
/// ## 2. Always scrollable
///
/// Arabic labels are long and there are usually three of them. A strip that
/// stretches when the labels fit and scrolls when they do not makes the
/// indicator's width mean two different things on two screens of the same app.
/// [TabAlignment.start] rather than the scrollable default `startOffset`: that
/// default indents the first tab by 52px, which under RTL is a gap at the right
/// edge that reads as a layout bug.
///
/// ## 3. No ripple
///
/// Nothing else in this product ripples — `AppButton` and `AppPanel` both use
/// a plain gesture detector, and the panel's own note explains the rule that
/// «a card that lifts under the cursor on a dense screen makes the whole page
/// feel loose». The indicator sliding to the tapped label IS the feedback.
class AppTabBar extends StatefulWidget {
  const AppTabBar({
    required this.labels,
    required this.selectedIndex,
    required this.onChanged,
    this.padding,
    super.key,
  });

  /// One label per pane, in display order. Callers resolve
  /// `tr(CopyKeys.…)` before passing them.
  final List<String> labels;

  final int selectedIndex;
  final ValueChanged<int> onChanged;

  /// Inset applied inside the strip's scroll viewport, so the first and last
  /// tab can scroll out under the screen gutter instead of stopping at it.
  final EdgeInsetsGeometry? padding;

  @override
  State<AppTabBar> createState() => _AppTabBarState();
}

class _AppTabBarState extends State<AppTabBar> with TickerProviderStateMixin {
  late TabController _controller;

  @override
  void initState() {
    super.initState();
    _controller = _createController();
  }

  @override
  void didUpdateWidget(AppTabBar oldWidget) {
    super.didUpdateWidget(oldWidget);

    // A tab set that grows or shrinks — an admin filter that gains a pane, a
    // course that gains an improvement paper — cannot be pushed into an
    // existing controller: `TabController.length` is final, and leaving the
    // old one in place throws the moment TabBar builds one more tab than the
    // controller knows about.
    if (widget.labels.length != oldWidget.labels.length) {
      _controller.dispose();
      _controller = _createController();
      return;
    }

    // The caller is the source of truth. `animateTo` rather than setting
    // `index` so a change that came from somewhere other than a tap — a deep
    // link, a bloc restoring state — slides the indicator instead of teleporting
    // it, which is the difference between "the app moved" and "the app blinked".
    final target = _clampedIndex;
    if (_controller.index != target) {
      _controller.animateTo(target);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  /// Guards against an index that outlives the tab it pointed at — a filter
  /// removed while pane 3 was open would otherwise assert inside
  /// [TabController] before the parent gets a chance to correct itself.
  int get _clampedIndex =>
      widget.labels.isEmpty ? 0 : widget.selectedIndex.clamp(0, widget.labels.length - 1);

  TabController _createController() => TabController(
        length: widget.labels.length,
        initialIndex: _clampedIndex,
        vsync: this,
      );

  @override
  Widget build(BuildContext context) {
    return TabBar(
      controller: _controller,
      isScrollable: true,
      tabAlignment: TabAlignment.start,
      padding: widget.padding,
      // 16 inline per tab. The web's tab labels sit on `px-4`, and anything
      // tighter puts two Arabic words close enough to read as one label.
      labelPadding: const EdgeInsets.symmetric(horizontal: AppSpacing.x16),
      splashFactory: NoSplash.splashFactory,
      overlayColor: const WidgetStatePropertyAll(Colors.transparent),
      // TabBar moves its own controller on tap, so the strip responds at once
      // and this only tells the caller. `didUpdateWidget` reconciles the two if
      // the caller decides otherwise.
      onTap: widget.onChanged,
      tabs: [
        for (final label in widget.labels)
          Tab(
            // 44, not the Material default of 46: the tap target is the whole
            // strip height and this is the one number the design spec fixes.
            height: AppSpacing.minTap,
            child: Text(
              label,
              // The strip's height is locked, so a wrapped label renders proud
              // of the divider under it.
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
      ],
    );
  }
}
