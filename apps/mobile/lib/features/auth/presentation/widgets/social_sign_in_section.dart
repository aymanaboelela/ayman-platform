import 'dart:io';

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/services/social_auth/social_auth_service.dart';
import '../../../../core/theme/app_spacing.dart';
import '../cubit/login_cubit.dart';
import 'auth_divider.dart';
import 'social_sign_in_button.dart';

/// The «أو» divider plus whichever provider buttons are actually usable.
///
/// ⚠️ It renders NOTHING when neither provider is configured, and that is the
/// point. Google has no OAuth client on this deployment yet
/// (`docs/runbooks/google-sign-in.md`: "Status: NOT YET DONE") and the four
/// `APPLE_*` vars are unset, so `/api/auth/sign-in/social` answers 404
/// `PROVIDER_NOT_FOUND` for both. A button that always fails is worse than no
/// button: the student concludes the app is broken rather than that the option
/// does not exist.
///
/// Both appear the moment the ids are compiled in — see [AppEnvironment].
class SocialSignInSection extends StatelessWidget {
  const SocialSignInSection({
    required this.service,
    required this.pending,
    required this.busy,
    required this.onGoogle,
    required this.onApple,
    super.key,
  });

  final SocialAuthService service;
  final LoginPending pending;

  /// Any sign-in is in flight — the buttons grey out so a student cannot start
  /// a second one on top of the first.
  final bool busy;

  final VoidCallback onGoogle;
  final VoidCallback onApple;

  @override
  Widget build(BuildContext context) {
    final showGoogle = service.googleAvailable;
    final showApple = service.appleAvailable;

    if (!showGoogle && !showApple) return const SizedBox.shrink();

    return Column(
      children: [
        const SizedBox(height: AppSpacing.x24),
        const AuthDivider(),
        const SizedBox(height: AppSpacing.x16),
        if (showApple) ...[
          // Apple FIRST on iOS. App Store guideline 4.8 requires Sign in with
          // Apple to be offered "equivalently prominent" wherever another
          // third-party sign-in is, and reviewers read order as prominence.
          SocialSignInButton(
            label: tr(CopyKeys.authProvidersApple),
            icon: Icons.apple,
            loading: pending == LoginPending.apple,
            onPressed: busy ? null : onApple,
          ),
          if (showGoogle) const SizedBox(height: AppSpacing.x12),
        ],
        if (showGoogle)
          SocialSignInButton(
            // The one place the app draws a third-party mark. Google's brand
            // guidelines require their own G, not a generic glyph — the asset
            // is the same `google.webp` the web serves.
            label: tr(CopyKeys.authProvidersGoogle),
            assetPath: 'assets/images/google.webp',
            loading: pending == LoginPending.google,
            onPressed: busy ? null : onGoogle,
          ),
      ],
    );
  }
}

/// Whether this build can even offer Apple, ignoring configuration.
///
/// Kept as a separate predicate from [SocialAuthService.appleAvailable] so a
/// widget test can exercise the iOS branch on a macOS test host.
bool get isApplePlatform => Platform.isIOS || Platform.isMacOS;
