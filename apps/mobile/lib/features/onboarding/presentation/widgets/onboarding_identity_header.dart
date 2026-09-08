// `hide TextDirection`: easy_localization re-exports package:intl, whose
// TextDirection is a class with no `ltr`, not dart:ui's enum.
import 'package:easy_localization/easy_localization.dart' hide TextDirection;
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/media/app_avatar.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';

/// «أهلاً يا مريم» — the account this wizard is filling in.
///
/// It exists because a student who has just signed up and been redirected has
/// no other confirmation that the account was made. «حسابك اتعمل تمام» is the
/// reassurance; the identity line under it is the proof.
class OnboardingIdentityHeader extends StatelessWidget {
  const OnboardingIdentityHeader({
    required this.name,
    this.identity,
    this.avatarUrl,
    super.key,
  });

  final String name;

  /// The email or the phone — whichever the account was made with.
  final String? identity;

  final String? avatarUrl;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Container(
      padding: const EdgeInsets.all(AppSpacing.cardInset),
      decoration: BoxDecoration(
        color: c.surface2,
        borderRadius: AppRadius.mdAll,
        border: Border.all(color: c.line),
      ),
      child: Row(
        spacing: AppSpacing.x12,
        children: [
          AppAvatar(
            name: name,
            imageUrl: avatarUrl,
            size: AppAvatarSize.profile,
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: AppSpacing.x2,
              children: [
                Text(
                  '${tr(CopyKeys.onboardingIdentityGreeting)} $name',
                  style: type.title4Style(color: c.fg),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                if (identity != null)
                  // LTR: an email or an E.164 number is a Latin run, and in an
                  // RTL paragraph its beginning is what disappears off the
                  // left edge when it truncates.
                  Text(
                    identity!,
                    textDirection: TextDirection.ltr,
                    textAlign: TextAlign.left,
                    style: type.bodyXs(color: c.fgMuted),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
