import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';

/// «أو» with a rule either side, between the password form and the provider
/// buttons.
class AuthDivider extends StatelessWidget {
  const AuthDivider({super.key});

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Row(
      children: [
        Expanded(child: Divider(color: c.line, height: 0.5, thickness: 0.5)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.x12),
          child: Text(
            tr(CopyKeys.authProvidersDivider),
            // Decorative: it separates two groups a screen reader already
            // reaches in order, and announcing "or" between them adds nothing.
            semanticsLabel: '',
            style: type.bodyXs(color: c.fgFaint),
          ),
        ),
        Expanded(child: Divider(color: c.line, height: 0.5, thickness: 0.5)),
      ],
    );
  }
}
