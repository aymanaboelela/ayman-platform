import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/config/app_environment.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';

/// «بياناتك محفوظة عند أيمن أبو العلا وبس.»
///
/// Under EVERY step, not once at the end. A student is asked for a phone
/// number on the first screen and their guardian's on the last; the promise
/// has to be on the screen where the asking happens.
class OnboardingPrivacyNote extends StatelessWidget {
  const OnboardingPrivacyNote({super.key});

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Container(
      padding: const EdgeInsets.all(AppSpacing.x12),
      decoration: BoxDecoration(
        color: c.studyTint,
        borderRadius: AppRadius.mdAll,
        border: Border.all(color: c.studyLine),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: AppSpacing.x8,
        children: [
          Icon(Icons.lock_outline_rounded, size: 16, color: c.study),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: AppSpacing.x4,
              children: [
                Text(
                  tr(CopyKeys.onboardingPrivacyNote),
                  style: type.bodyXs(color: c.fgMuted),
                ),
                GestureDetector(
                  // The legal page changes without an app release, so it opens
                  // on the web rather than being reimplemented here — see
                  // `AppRoutes.notInTheApp`.
                  onTap: () => launchUrl(
                    Uri.parse('${AppEnvironment.siteUrl}/privacy?from=onboarding'),
                    mode: LaunchMode.externalApplication,
                  ),
                  child: Text(
                    tr(CopyKeys.onboardingPrivacyLink),
                    style: type.bodyXs(
                      color: c.accentText,
                      weight: AppTextStyle.medium,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
