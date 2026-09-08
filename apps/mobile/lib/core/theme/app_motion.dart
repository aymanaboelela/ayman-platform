import 'package:flutter/animation.dart';

/// Durations and curves, transcribed from `packages/ui/src/tokens/motion.css`.
///
/// Three durations and four curves is the whole vocabulary. An animation that
/// needs a fifth number is usually an animation that should not exist.
abstract final class AppMotion {
  /// Anything that responds to a touch: a row highlighting, a chip filling,
  /// an icon changing state.
  static const Duration hover = Duration(milliseconds: 160);

  /// Popovers, menus, tooltips, toasts.
  static const Duration popover = Duration(milliseconds: 200);

  /// Sheets, dialogs, route transitions.
  static const Duration modal = Duration(milliseconds: 300);

  /// DEFAULT — anything entering or exiting the screen.
  static const Curve out = Cubic(0.3, 0.8, 0.6, 1);

  /// Anything moving or morphing in place, where both ends are visible.
  static const Curve inOut = Cubic(0.6, 0, 0.2, 1);

  /// Popovers only. The 1.1 is a deliberate slight overshoot — it is what
  /// makes a menu feel attached to the button that opened it.
  static const Curve pop = Cubic(0.175, 0.885, 0.32, 1.1);

  /// Progress bars and loaders ONLY. Anything else linear reads as broken.
  static const Curve linear = Cubic(0, 0, 1, 1);

  /// How long a skeleton waits before it is allowed to appear.
  ///
  /// A response that lands in 90ms should never flash a grey shape at the
  /// student; the web applies the same 180ms delay inside its `Skeleton`
  /// component for exactly this reason.
  static const Duration skeletonDelay = Duration(milliseconds: 180);

  /// One sweep of the skeleton shimmer.
  static const Duration shimmer = Duration(milliseconds: 1400);
}
