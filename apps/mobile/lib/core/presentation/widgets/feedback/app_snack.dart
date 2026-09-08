import 'package:flutter/material.dart';

import '../../../theme/app_colors.dart';
import '../../../theme/app_spacing.dart';

/// What a toast is REPORTING. Never decorative — the same rule `AppBadgeTone`
/// carries, and it matters more here, because a toast is gone before the
/// student can re-read it.
enum AppSnackTone {
  /// A statement of fact: «اتسلّم خلاص», «بنعلّم…».
  neutral,

  /// Something the student did worked.
  ok,

  /// Something failed and they need to know — «ماقدرناش نحفظ».
  err,
}

/// The toast.
///
/// The web mounts one `sonner` `<Toaster dir="rtl" position="bottom-center">`
/// in the root layout with no custom styling; the mobile equivalent is
/// [ScaffoldMessenger], whose geometry and colours are already set on
/// `snackBarTheme` in `app_theme.dart`. Nothing here re-styles the bar — it
/// composes the content and picks the tone colour.
///
/// ## One at a time
///
/// [ScaffoldMessenger] QUEUES: three toasts fired by three failing requests
/// play one after another for twelve seconds, long after the student has moved
/// on, and the last one they read is the oldest news. So the current bar is
/// hidden before the new one is shown and only the latest message survives.
///
/// ## The colours come from the OTHER theme
///
/// A snack bar is an INVERSE surface — `snackBarTheme` paints it `fg` with
/// `surface1` text, so in dark mode it is a near-white card and in light mode
/// a near-black one. `c.err` is tuned to be legible on the PAGE, which is the
/// opposite ground; dark mode's `#E64343` on dark mode's near-white bar is the
/// worst pairing in the palette. Reading the tone from the opposite [AppColors]
/// is not a hack — it is what "inverse surface" means, and it is why the
/// action label overrides the theme's `actionTextColor` too.
abstract final class AppSnack {
  /// Neutral 4s, error 6s. An error carries information the student may need
  /// to act on; a confirmation does not, and a confirmation that sits over the
  /// bottom of the screen for six seconds is in the way of the next tap.
  static const Duration _neutralDuration = Duration(seconds: 4);
  static const Duration _errorDuration = Duration(seconds: 6);

  /// [message] is already-translated Arabic — `tr(CopyKeys.…)` at the call
  /// site, or a [Failure]'s own message, which the data layer resolved.
  static void show(
    BuildContext context,
    String message, {
    AppSnackTone tone = AppSnackTone.neutral,
    String? actionLabel,
    VoidCallback? onAction,
    Duration? duration,
  }) {
    assert(
      (actionLabel == null) == (onAction == null),
      'A toast action needs both a label and a callback. A label alone is a '
      'button that eats the tap and does nothing, on a bar that disappears '
      'before anyone can report it.',
    );

    final messenger = ScaffoldMessenger.maybeOf(context);
    // A toast is never worth crashing a screen over — the usual cause is a
    // context from above the Navigator, or one whose route has already been
    // popped by the time an async result comes back. The assert makes it loud
    // in debug and the early return makes it harmless in the student's hands.
    assert(
      messenger != null,
      'AppSnack.show was given a context with no ScaffoldMessenger above it. '
      'Use the context of a widget inside the Scaffold, not the one that built '
      'the MaterialApp.',
    );
    if (messenger == null) return;

    final c = AppColors.of(context);
    final inverse = c.isDark ? AppColors.light : AppColors.dark;

    final (IconData? icon, Color iconColor) = switch (tone) {
      // No glyph. A plain statement does not need a symbol, and a neutral icon
      // on every toast trains the student to stop looking at the two that do
      // mean something.
      AppSnackTone.neutral => (null, inverse.fg),
      AppSnackTone.ok => (Icons.check_circle_outline, inverse.ok),
      AppSnackTone.err => (Icons.error_outline, inverse.err),
    };

    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          // No `backgroundColor`, no `contentTextStyle`: the theme owns both,
          // and the DefaultTextStyle the SnackBar wraps this content in is
          // already `bodySm` on `surface1`.
          content: Row(
            spacing: AppSpacing.x8,
            children: [
              if (icon != null) Icon(icon, size: 18, color: iconColor),
              Expanded(
                child: Text(
                  message,
                  // Three lines, then ellipsis. An Arabic sentence at 14px in
                  // a 328pt bar runs to two lines often and three rarely; a
                  // toast that grows past that is a panel wearing a toast's
                  // clothes and belongs on the screen instead.
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          duration: duration ?? (tone == AppSnackTone.err ? _errorDuration : _neutralDuration),
          behavior: SnackBarBehavior.floating,
          margin: const EdgeInsets.all(AppSpacing.x16),
          action: actionLabel == null
              ? null
              : SnackBarAction(
                  label: actionLabel,
                  // `--a-11`, from the inverse theme. The theme's own
                  // `actionTextColor` is the solid accent, which is amber on a
                  // near-white bar in dark mode.
                  textColor: inverse.accentText,
                  onPressed: onAction ?? () {},
                ),
        ),
      );
  }
}
