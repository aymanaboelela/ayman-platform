import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/buttons/app_button.dart';
import '../../../../core/presentation/widgets/surfaces/app_tint_panel.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';

/// «لسه ماخترتش صفّك» — the strip when there is no identity to name.
///
/// ⚠️ Rare, and it must NOT be deleted as dead code.
///
/// The onboarding schema demands a year now, so no new profile can be saved
/// without one — but every student onboarded BEFORE that change may hold a
/// null year, and this prompt is the only route they have to fill one in.
/// It is also where a student lands when the TAXONOMY could not be read, which
/// is a network problem rather than a profile one; the copy works for both
/// because the button leads somewhere useful either way.
class LibraryIdentityPrompt extends StatelessWidget {
  const LibraryIdentityPrompt({required this.onboardingCompleted, super.key});

  final bool onboardingCompleted;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return AppTintPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppSpacing.x12,
        children: [
          Text(
            tr(CopyKeys.libraryIdentityMissing),
            style: type.title4Style(color: c.fg),
          ),
          Text(
            tr(CopyKeys.libraryIdentityMissingHint),
            style: type.bodySm(color: c.fgMuted),
          ),
          AppButton(
            label: tr(CopyKeys.libraryIdentityMissingCta),
            // ⚠️ Which destination depends on WHICH of two states this is.
            //
            // The wizard's year step is optional, so a student can be fully
            // onboarded and still have no year — and the wizard's own guard
            // bounces that student straight back out again. They get the
            // profile editor, which is the screen that can actually fix it.
            // Only someone who never finished the wizard is sent to it.
            onPressed: () => context.go(
              onboardingCompleted ? AppRoutes.section : AppRoutes.onboarding,
            ),
          ),
        ],
      ),
    );
  }
}
