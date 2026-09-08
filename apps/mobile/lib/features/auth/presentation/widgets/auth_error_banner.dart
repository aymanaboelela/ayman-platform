import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/data/exception/failure.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_motion.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';

/// The message above the sign-in and sign-up forms when a submission failed.
///
/// One case gets an ACTION rather than just words: a phone number that already
/// has an account. «الرقم ده ليه حساب عندنا بالفعل» with no way forward leaves
/// the student stuck on the wrong screen, so the banner offers «ادخل بالرقم
/// ده» and hands them to sign-in. That pair — message plus link — is why this
/// is its own widget rather than a line of text.
class AuthErrorBanner extends StatelessWidget {
  const AuthErrorBanner({required this.failure, this.onAction, super.key});

  final Failure? failure;

  /// Invoked by the «ادخل بالرقم ده» link. Only rendered when the failure is
  /// `PHONE_ALREADY_REGISTERED` AND a handler is given.
  final VoidCallback? onAction;

  bool get _hasAction =>
      onAction != null && failure?.code == 'PHONE_ALREADY_REGISTERED';

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    // AnimatedSize + AnimatedSwitcher rather than a conditional child: the
    // form must not jump when the banner appears, and a banner that pops in
    // at full height pushes the button the student is about to press.
    return AnimatedSize(
      duration: AppMotion.hover,
      curve: AppMotion.out,
      alignment: AlignmentDirectional.topStart,
      child: failure == null
          ? const SizedBox(width: double.infinity)
          : Container(
              width: double.infinity,
              margin: const EdgeInsets.only(bottom: AppSpacing.x16),
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.x12,
                vertical: AppSpacing.x12,
              ),
              decoration: BoxDecoration(
                // 8% fill / 30% border — the same alphas every error surface in
                // this design uses, so a banner and a badge read as the same
                // family.
                color: c.err.withValues(alpha: 0.08),
                borderRadius: AppRadius.mdAll,
                border: Border.all(color: c.err.withValues(alpha: 0.30)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: AppSpacing.x8,
                children: [
                  Icon(Icons.error_outline_rounded, size: 18, color: c.err),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Semantics(
                          // Announced the moment it appears. Without this the
                          // student hears nothing and is left wondering why
                          // the button did not work.
                          liveRegion: true,
                          child: Text(
                            failure!.message,
                            style: type.bodySm(color: c.err),
                          ),
                        ),
                        if (_hasAction) ...[
                          const SizedBox(height: AppSpacing.x4),
                          GestureDetector(
                            onTap: onAction,
                            child: Padding(
                              // Pads the 14px label out to a 44pt row without
                              // moving the text.
                              padding: const EdgeInsets.symmetric(vertical: AppSpacing.x8),
                              child: Text(
                                tr(CopyKeys.authErrorsRegisterPhoneTakenAction),
                                style: type.bodySm(
                                  color: c.err,
                                  weight: AppTextStyle.semibold,
                                ).copyWith(decoration: TextDecoration.underline),
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}
