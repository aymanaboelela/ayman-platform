// `hide TextDirection`: easy_localization re-exports package:intl, which
// declares a TextDirection of its own. Without the hide, every
// `TextDirection.rtl` in this file silently resolves to intl's class — which
// has no `rtl` — instead of dart:ui's.
import 'package:easy_localization/easy_localization.dart' hide TextDirection;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../localization/copy_keys.dart';
import '../../../theme/app_colors.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_text_style.dart';
import '../../../theme/app_theme.dart';
import 'app_refresh_wrapper.dart';

/// The page shell every screen in the product is built on.
///
/// ## The screen name goes in the BODY, never in the app bar
///
/// This is the one rule the widget exists to enforce. The web app deliberately
/// drops the page title from its topbar below `md` — «the page title is
/// deliberately absent below md… the Flutter app must put the screen name in
/// the page body, not in the app bar» — because the title was measured at 8px
/// on a 360px phone once the menu button, the assistant launcher, the bell and
/// the avatar had taken their 44pt each. Every route renders its own `<h1>`
/// instead, and this widget is that `<h1>`.
///
/// So [title] is painted as `title-1` at the top of the scroll view and the
/// app bar exists ONLY when there is a back button or an action to put in it.
/// A screen with neither gets no app bar at all rather than an empty 56pt band
/// — on a 360×780 phone that band is a twentieth of the display spent on
/// nothing.
///
/// ## `product: true` is the default
///
/// Everything behind the login is one type rung larger (`.product-type` on the
/// web). That was asked for by name — «كبّر الخطوط في الداشبورد بتاع الطالب
/// والأدمن» — so the default is the signed-in scale and the public screens
/// (sign-in, sign-up, onboarding) pass `product: false`.
///
/// The scope is installed ABOVE a [Builder] rather than around the Scaffold
/// directly: `AppTextStyle.of` resolves through
/// `dependOnInheritedWidgetOfExactType`, so reading it with this build
/// method's own `context` would find the PARENT's scope and paint the page
/// title at the public size on every product screen.
///
/// ## Nothing ends under the assistant dock
///
/// A scrolling body always carries [AppSpacing.listBottom] (80pt) at its foot.
/// The web adds the same `padding-block-end: 5.5rem` to every `main` below
/// `md` so the floating assistant launcher does not sit on top of the last
/// row. (There is no bottom navigation bar in this product and none should be
/// invented — the 80pt is for the dock and the gesture bar.)
class AppScreen extends StatelessWidget {
  /// A screen whose content is one box widget, scrolled as a whole.
  const AppScreen({
    required this.title,
    required Widget this.body,
    this.eyebrow,
    this.lead,
    this.actions = const <Widget>[],
    this.onBack,
    this.onRefresh,
    this.controller,
    this.bottomBar,
    this.product = true,
    this.scrollable = true,
    this.padded = true,
    super.key,
  })  : assert(
          onRefresh == null || scrollable,
          'Pull-to-refresh needs something to overscroll. A screen that does '
          'not scroll has to offer its own retry control.',
        ),
        slivers = null;

  /// A screen that needs a [CustomScrollView] — a long lazy list, a pinned
  /// header, a grid that must not build its off-screen rows.
  ///
  /// Building the whole list eagerly inside a [Column] is the usual reason a
  /// course with 90 lessons drops frames on a mid-range Android, so a screen
  /// with an unbounded list should reach for this constructor rather than the
  /// default one.
  const AppScreen.slivers({
    required this.title,
    required List<Widget> this.slivers,
    this.eyebrow,
    this.lead,
    this.actions = const <Widget>[],
    this.onBack,
    this.onRefresh,
    this.controller,
    this.bottomBar,
    this.product = true,
    this.padded = true,
    super.key,
  })  : body = null,
        scrollable = true;

  /// The screen name, rendered as the page's `h1` at the top of the body.
  final String title;

  /// The mono eyebrow above the title — «المدفوعات», «كورساتي». Optional
  /// because most screens do not need to name their section twice.
  final String? eyebrow;

  /// One sentence under the title (`.study-head__lead`). Sentence case, muted.
  final String? lead;

  final Widget? body;
  final List<Widget>? slivers;

  /// App-bar actions. Each one must clear 44pt on its own — the theme's
  /// `IconButtonThemeData` already sets that minimum, so a plain [IconButton]
  /// is safe here and a bare [GestureDetector] is not.
  final List<Widget> actions;

  /// Shows a back button in the app bar. Null means this screen is a tab root
  /// and cannot be backed out of.
  final VoidCallback? onBack;

  /// Wires pull-to-refresh around the scrolling body. Only valid when
  /// something scrolls.
  final Future<void> Function()? onRefresh;

  final ScrollController? controller;

  /// A pinned footer — the quiz's «سلّم الامتحان» bar, a checkout total.
  ///
  /// NOT navigation: this product has no bottom navigation bar anywhere and
  /// one must not be introduced through this slot.
  final Widget? bottomBar;

  /// Whether this is a signed-in surface, which types one rung larger.
  final bool product;

  /// Set false for a screen that must fill the viewport exactly — a player, a
  /// full-bleed map. The body is then given the remaining height instead of a
  /// scroll view, and no bottom gap is added because nothing can scroll under
  /// the dock.
  final bool scrollable;

  /// Whether the horizontal screen gutter is applied.
  ///
  /// In the `.slivers` form this wraps EVERY sliver the caller passes, so a
  /// screen that mixes a full-bleed carousel with inset rows should pass
  /// `padded: false` and put [AppSpacing.screenH] on the slivers that want it.
  final bool padded;

  @override
  Widget build(BuildContext context) {
    return AppTypeScope(
      isProductSurface: product,
      child: Builder(
        builder: (context) {
          final c = AppColors.of(context);
          final type = AppTextStyle.of(context);
          final isRtl = Directionality.of(context) == TextDirection.rtl;

          final gutter = padded ? AppSpacing.screenInset : 0.0;
          final horizontal = EdgeInsets.symmetric(horizontal: gutter);
          const top = EdgeInsets.only(top: AppSpacing.x16);

          final head = Semantics(
            header: true,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (eyebrow != null) ...[
                  Text(eyebrow!, style: type.label(color: c.fgFaint)),
                  const SizedBox(height: AppSpacing.x4),
                ],
                Text(title, style: type.title1Style(color: c.fg)),
                if (lead != null) ...[
                  const SizedBox(height: AppSpacing.x8),
                  Text(lead!, style: type.body(color: c.fgMuted)),
                ],
                // `.study-head` closes with 24px before the first block.
                const SizedBox(height: AppSpacing.sectionGap),
              ],
            ),
          );

          Widget content;
          if (slivers != null) {
            content = CustomScrollView(
              controller: controller,
              slivers: [
                SliverPadding(
                  padding: horizontal + top,
                  sliver: SliverToBoxAdapter(child: head),
                ),
                if (padded)
                  for (final sliver in slivers!)
                    SliverPadding(padding: horizontal, sliver: sliver)
                else
                  ...slivers!,
                // A childless adapter has zero extent, so this is 80pt of
                // clearance and nothing else.
                const SliverPadding(
                  padding: AppSpacing.listBottom,
                  sliver: SliverToBoxAdapter(),
                ),
              ],
            );
          } else if (scrollable) {
            content = SingleChildScrollView(
              controller: controller,
              padding: horizontal + top + AppSpacing.listBottom,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [head, body!],
              ),
            );
          } else {
            content = Padding(
              padding: horizontal + top,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [head, Expanded(child: body!)],
              ),
            );
          }

          if (onRefresh != null) {
            content = AppRefreshWrapper(onRefresh: onRefresh!, child: content);
          }

          final hasChrome = onBack != null || actions.isNotEmpty;

          return AnnotatedRegion<SystemUiOverlayStyle>(
            value: AppTheme.overlayFor(c),
            child: Scaffold(
              backgroundColor: c.surface1,
              appBar: hasChrome
                  ? AppBar(
                      backgroundColor: c.surface1,
                      // The theme already carries this; restating it here
                      // keeps the bar right when a route is pushed with its
                      // own overlay annotation above it.
                      systemOverlayStyle: AppTheme.overlayFor(c),
                      automaticallyImplyLeading: false,
                      leading: onBack == null
                          ? null
                          : IconButton(
                              onPressed: onBack,
                              tooltip: tr(CopyKeys.courseBack),
                              // «رجوع» points the way the reader came from,
                              // which under RTL is the RIGHT. This is the
                              // `--dir-x` scale the web applies to every
                              // chevron and arrow; Material's `arrow_back`
                              // does not mirror itself.
                              icon: Transform.flip(
                                flipX: isRtl,
                                child: const Icon(Icons.arrow_back),
                              ),
                            ),
                      actions: actions,
                    )
                  : null,
              // With an app bar the top inset is already consumed; without one
              // the title would otherwise start under the status bar clock.
              body: SafeArea(
                top: !hasChrome,
                bottom: false,
                child: content,
              ),
              bottomNavigationBar: bottomBar,
            ),
          );
        },
      ),
    );
  }
}
