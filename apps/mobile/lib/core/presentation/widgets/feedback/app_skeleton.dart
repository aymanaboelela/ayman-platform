import 'dart:async';

import 'package:flutter/material.dart';

import '../../../theme/app_colors.dart';
import '../../../theme/app_motion.dart';
import '../../../theme/app_radius.dart';

/// How wide a bar is, as a fraction of the space it is given.
///
/// *"Varying bar widths is the single biggest difference between a skeleton
/// that reads as designed and one that reads as cheap."* Real text does not
/// have a flush edge, and the eye reads a stack of identical bars as a loading
/// GIF rather than as the shape of the page that is coming.
enum AppSkeletonWidth {
  full(1),
  wide(0.85),
  narrow(0.60);

  const AppSkeletonWidth(this.factor);

  final double factor;
}

/// One shimmering placeholder bar.
///
/// ## The 180ms delay is the whole point
///
/// [AppMotion.skeletonDelay] passes before ANYTHING is painted. A dashboard
/// that answers in 90ms — the normal case on Wi-Fi against a warm cache —
/// must never flash a grey shape on its way to the real content; that flash is
/// what makes a fast app feel unstable. Until the delay elapses the bar
/// reserves its height and paints nothing, so the list does not jump when it
/// does appear.
///
/// Hand-rolled rather than `shimmer`/`skeletonizer`, both of which are in the
/// pubspec: neither has a paint delay, and bolting one on around a package
/// that owns its own controller costs more code than the twenty lines below.
///
/// ## Reduced motion
///
/// Under `MediaQuery.disableAnimationsOf` the sweep does not run at all. The
/// base fill still paints, so the page still shows its shape — a student who
/// has asked the OS to stop animations gets a still placeholder, not an empty
/// screen.
///
/// ## The sweep is not mirrored
///
/// It travels left-to-right in Arabic too. The design calls it decorative
/// rather than directional; a sweep that changes direction with the locale
/// reads as a scroll hint pointing the wrong way. [FractionalTranslation]
/// works in physical pixels, so this is what happens by default — do not
/// "fix" it with a `Directionality` check.
class AppSkeleton extends StatefulWidget {
  const AppSkeleton({
    this.width = AppSkeletonWidth.full,
    this.height = 16,
    this.borderRadius = AppRadius.smAll,
    super.key,
  });

  /// A fraction of the space the parent offers, so the parent must offer a
  /// bounded width — inside a `Row`, wrap it in an `Expanded`.
  final AppSkeletonWidth width;

  /// 16 is a line of body text. The rail's course meter is 2; a card's title
  /// bar is 20.
  final double height;

  /// [AppRadius.fullAll] on a square box gives the circle an avatar
  /// placeholder needs.
  final BorderRadius borderRadius;

  @override
  State<AppSkeleton> createState() => _AppSkeletonState();
}

class _AppSkeletonState extends State<AppSkeleton> with SingleTickerProviderStateMixin {
  late final AnimationController _sweep = AnimationController(
    vsync: this,
    duration: AppMotion.shimmer,
  );

  Timer? _delay;
  bool _visible = false;

  @override
  void initState() {
    super.initState();
    _delay = Timer(AppMotion.skeletonDelay, () {
      // The timer outlives a widget disposed inside the delay window — which
      // is precisely the fast-response case this whole class exists for, so
      // it is the common path rather than an edge one.
      if (!mounted) return;
      setState(() => _visible = true);
      _syncSweep();
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _syncSweep();
  }

  /// Starts or stops the sweep for the state the widget is actually in.
  ///
  /// Two things can turn it off and both can change after mount, which is why
  /// this is one method called from two places rather than a line in
  /// [initState]: the accessibility setting flips while the app is open (iOS
  /// Control Centre, Android developer options), and nothing is painted at all
  /// until the delay elapses — running a ticker to animate an invisible bar is
  /// a frame of work per skeleton for nothing.
  void _syncSweep() {
    if (!_visible || MediaQuery.disableAnimationsOf(context)) {
      if (_sweep.isAnimating) _sweep.stop();
      // Parks the gradient one full width off the leading edge, so what
      // remains is the flat base fill rather than a frozen bright band.
      _sweep.value = 0;
    } else if (!_sweep.isAnimating) {
      _sweep.repeat();
    }
  }

  @override
  void dispose() {
    _delay?.cancel();
    _sweep.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_visible) return SizedBox(height: widget.height);

    final c = AppColors.of(context);

    // 5% and 8% of the highest-contrast foreground — the web's
    // `color-mix(in oklch, var(--n-12), transparent 95%)` and its 92% sibling.
    // Derived from `fg` rather than picked per theme so the bar is a wash over
    // whatever surface it lands on instead of a fixed grey that goes muddy on
    // `surface3`.
    final base = c.fg.withValues(alpha: 0.05);
    final crest = c.fg.withValues(alpha: 0.08);

    return FractionallySizedBox(
      alignment: AlignmentDirectional.centerStart,
      widthFactor: widget.width.factor,
      child: SizedBox(
        height: widget.height,
        child: ClipRRect(
          borderRadius: widget.borderRadius,
          child: ColoredBox(
            color: base,
            child: AnimatedBuilder(
              animation: _sweep,
              // The gradient is built once and handed in as `child`: the
              // rebuild each frame is a transform, not a new shader. The web
              // note is the same one — `translateX`, never
              // `background-position`, which repaints the whole element.
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                    colors: [Colors.transparent, crest, Colors.transparent],
                  ),
                ),
              ),
              builder: (context, child) => FractionalTranslation(
                // -1 → +1: fully off the leading edge to fully off the
                // trailing one, so the crest crosses the bar exactly once per
                // cycle with no visible snap back.
                translation: Offset(_sweep.value * 2 - 1, 0),
                child: child,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
