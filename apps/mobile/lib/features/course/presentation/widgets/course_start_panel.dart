import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/buttons/app_button.dart';
import '../../../../core/presentation/widgets/surfaces/app_panel.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';

/// «نبدأ الكورس عشان المحاضرات تتفتح» — the panel a student who is not
/// enrolled sees.
///
/// One button, and it does not branch on RENDER. Whether a course opens on
/// press or asks for a subscription is decided by the server's answer to the
/// enrolment call, not by prices read on the client — the same discipline the
/// web's start button follows, and the reason a cached marketing page and this
/// screen can share one enrolment path.
///
/// What the prices DO decide here is the sentence: «الكورس ده مدفوع» versus
/// «الكورس مجاني بالكامل». That is a description, not a decision, and getting
/// it wrong costs a wrong sentence rather than a wrong door.
class CourseStartPanel extends StatelessWidget {
  const CourseStartPanel({
    required this.isPriced,
    required this.pending,
    required this.onStart,
    super.key,
  });

  final bool isPriced;

  /// An enrolment request is in flight — the button reads «ثانية واحدة…».
  final bool pending;

  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return AppPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppSpacing.x12,
        children: [
          Text(
            tr(CopyKeys.libraryNotEnrolledTitle),
            style: type.title4Style(color: c.fg),
          ),
          Text(
            tr(
              isPriced
                  ? CopyKeys.libraryNotEnrolledBodyPriced
                  : CopyKeys.libraryNotEnrolledBody,
            ),
            style: type.bodySm(color: c.fgMuted),
          ),
          AppButton(
            label: pending
                ? tr(CopyKeys.courseStartPending)
                : tr(CopyKeys.libraryStart),
            icon: Icons.play_arrow_rounded,
            loading: pending,
            onPressed: onStart,
          ),
        ],
      ),
    );
  }
}
