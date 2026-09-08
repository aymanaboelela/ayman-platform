import 'package:flutter/material.dart';

import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';

/// What the student looks at while `/api/session` answers.
///
/// It is DELIBERATELY the same composition as the native launch screen —
/// portrait, amber ring, page-coloured ground — so the handover from the OS
/// splash to the first Flutter frame is invisible. A different splash after the
/// native one reads as the app starting twice.
///
/// There is no spinner. The session read is usually under 300ms on any
/// connection, and a spinner that flashes for a fifth of a second is noise; the
/// progress bar below only appears once the wait is long enough to be worth
/// acknowledging.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);

    return Scaffold(
      backgroundColor: c.surface1,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 96,
              height: 96,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: c.accent, width: 2),
              ),
              child: ClipOval(
                child: Image.asset(
                  'assets/images/brand_mark.png',
                  fit: BoxFit.cover,
                  // Decorative: the app name is stated right below it, and a
                  // screen reader announcing the portrait as well would say
                  // the brand twice.
                  excludeFromSemantics: true,
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.x24),
            SizedBox(
              width: 96,
              child: _DelayedProgress(color: c.accent, track: c.surface4),
            ),
          ],
        ),
      ),
    );
  }
}

/// A progress bar that only appears once the wait is worth acknowledging.
///
/// 600ms, not the 180ms a skeleton uses: a skeleton replaces content the
/// student is looking at, while this is the very first frame, and showing a
/// loading bar immediately makes a fast launch feel slower than it is.
class _DelayedProgress extends StatefulWidget {
  const _DelayedProgress({required this.color, required this.track});

  final Color color;
  final Color track;

  @override
  State<_DelayedProgress> createState() => _DelayedProgressState();
}

class _DelayedProgressState extends State<_DelayedProgress> {
  bool _visible = false;

  @override
  void initState() {
    super.initState();
    Future<void>.delayed(const Duration(milliseconds: 600), () {
      if (mounted) setState(() => _visible = true);
    });
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedOpacity(
      opacity: _visible ? 1 : 0,
      duration: const Duration(milliseconds: 200),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(999),
        child: LinearProgressIndicator(
          minHeight: 3,
          color: widget.color,
          backgroundColor: widget.track,
        ),
      ),
    );
  }
}
