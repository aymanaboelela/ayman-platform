import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_motion.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';

/// Four segments and the name of the step you are on.
///
/// ## Why segments and not a bar
///
/// A continuous bar answers «how far» with a fraction. Four segments answer it
/// with a COUNT — «تلاتة من أربعة» — which is the shape of the question a
/// student actually asks on a form, and it makes the end visible from the
/// first screen.
class OnboardingStepProgress extends StatelessWidget {
  const OnboardingStepProgress({
    required this.step,
    required this.total,
    required this.titleKey,
    super.key,
  });

  final int step;
  final int total;
  final String titleKey;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Semantics(
      label: tr(CopyKeys.onboardingProgressLabel),
      value: '${step + 1} / $total',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppSpacing.x12,
        children: [
          Row(
            spacing: AppSpacing.x4,
            children: [
              for (var i = 0; i < total; i++)
                Expanded(
                  child: AnimatedContainer(
                    duration: AppMotion.hover,
                    height: 4,
                    decoration: BoxDecoration(
                      // Filled up to AND INCLUDING the current step: a
                      // student on step three has finished two and is inside
                      // the third, and showing it empty reads as no progress.
                      color: i <= step ? c.accent : c.surface4,
                      borderRadius: AppRadius.fullAll,
                    ),
                  ),
                ),
            ],
          ),
          Row(
            children: [
              Expanded(
                child: Text(
                  tr(titleKey),
                  style: type.title3Style(color: c.fg),
                ),
              ),
              Text(
                '${step + 1} / $total',
                style: type.numeric(color: c.fgMuted, size: 13),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
