import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../localization/copy_keys.dart';
import '../../../theme/app_colors.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_text_style.dart';
import '../surfaces/app_panel.dart';

/// The blocking spinner: everything stops until the write finishes.
///
/// It exists for the handful of actions where a second attempt is worse than a
/// slow first one — submitting an exam paper above all. That POST is not
/// idempotent from the student's side: a double submit races the 409 the
/// server answers with, and the screen the student ends on depends on which
/// request lands first.
///
/// ## Use it as a widget, not a route
///
/// ```dart
/// Stack(
///   children: [
///     QuizRunnerView(...),
///     if (state.submitting) const AppLoadingOverlay(),
///   ],
/// )
/// ```
///
/// There is deliberately no `AppLoadingOverlay.show()` / `.hide()` pair. An
/// overlay pushed as a route has to be popped by whoever pushed it, from every
/// path out of the action including the ones that throw — and the failure mode
/// is a spinner the student cannot dismiss, over a screen that has already
/// finished, with no way back except force-quitting the app. Bound to the
/// state that made it, it cannot outlive that state.
///
/// ## Dismiss-proof
///
/// Three separate things, because on a phone there are three ways out:
///
/// * [ModalBarrier] with `dismissible: false` swallows every tap, so nothing
///   behind it can be pressed twice.
/// * [PopScope] with `canPop: false` blocks the Android back button and the
///   iOS back-swipe. This is the one that matters most: back during a submit
///   leaves the paper without leaving the request, and the result lands on a
///   dead route.
/// * [BlockSemantics] hides the screen behind it from TalkBack and VoiceOver.
///   Without it a screen-reader user swipes straight past the barrier to the
///   button they just pressed and presses it again — the barrier stops
///   pointers, not focus.
class AppLoadingOverlay extends StatelessWidget {
  const AppLoadingOverlay({this.message, super.key});

  /// Already-translated Arabic. Defaults to «ثانية واحدة…»; the exam runner
  /// passes `tr(CopyKeys.quizSubmitting)` instead, because "we are sending
  /// your paper" is the one thing the student wants to know at that moment.
  final String? message;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final label = message ?? tr(CopyKeys.commonLoading);

    return PopScope(
      canPop: false,
      child: BlockSemantics(
        child: Semantics(
          container: true,
          // Announced when it appears, so the student is told the app is busy
          // rather than left wondering why the screen stopped answering.
          liveRegion: true,
          label: label,
          child: Stack(
            alignment: Alignment.center,
            children: [
              ModalBarrier(
                // Black at 70% in BOTH themes — the design's dialog overlay,
                // which is a fixed black rather than a themed colour because
                // what it darkens is the app, not a surface. Not
                // `colorScheme.scrim` (60%): this sits over a quiz paper, and
                // at 60% the questions stay legible enough that the screen
                // reads as merely slow rather than as held.
                color: Colors.black.withValues(alpha: 0.70),
                dismissible: false,
              ),
              AppPanel(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.x24,
                  vertical: AppSpacing.x20,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  spacing: AppSpacing.x12,
                  children: [
                    SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        valueColor: AlwaysStoppedAnimation(c.accent),
                      ),
                    ),
                    Text(label, style: type.bodySm(color: c.fgMuted)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
