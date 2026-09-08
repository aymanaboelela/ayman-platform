import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';

/// «لسه معملتش حساب؟ نعمل واحد دلوقتي» — the line between sign-in and sign-up.
///
/// The two halves are separate widgets in one row rather than a RichText with
/// a TapGestureRecognizer: a recognizer inside a span has no hit box of its
/// own, so the tappable words end up 14 logical pixels tall. Here the action
/// carries its own 44pt padding.
class AuthSwitchLink extends StatelessWidget {
  const AuthSwitchLink({
    required this.prompt,
    required this.actionLabel,
    required this.onTap,
    super.key,
  });

  final String prompt;
  final String actionLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text(prompt, style: type.bodySm(color: c.fgMuted)),
        const SizedBox(width: AppSpacing.x4),
        Semantics(
          button: true,
          child: GestureDetector(
            onTap: onTap,
            behavior: HitTestBehavior.opaque,
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.x8,
                vertical: AppSpacing.x12,
              ),
              child: Text(
                actionLabel,
                style: type.bodySm(
                  // `accentText`, not `accent`: the solid amber measures
                  // 2.00:1 as a foreground in light mode and is never text.
                  color: c.accentText,
                  weight: AppTextStyle.semibold,
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
