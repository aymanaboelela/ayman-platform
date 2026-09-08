import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';

/// What a student sees before they have ever written.
///
/// أيمن's own face, because the whole point of this screen is that a person is
/// on the other end of it — not a support desk and not a bot. The web says the
/// same thing with the same portrait beside the thread.
class ChatEmptyState extends StatelessWidget {
  const ChatEmptyState({super.key});

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.x32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 88,
              height: 88,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: c.accent, width: 2),
              ),
              child: ClipOval(
                child: Image.asset(
                  'assets/images/brand_mark.png',
                  fit: BoxFit.cover,
                  excludeFromSemantics: true,
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.x16),
            Text(
              tr(CopyKeys.assistantThreadAyman),
              style: type.title3Style(color: c.fg),
            ),
            const SizedBox(height: AppSpacing.x4),
            Text(
              tr(CopyKeys.assistantThreadAymanRole),
              style: type.bodySm(color: c.fgMuted),
            ),
            const SizedBox(height: AppSpacing.x16),
            Text(
              tr(CopyKeys.assistantAiLead),
              style: type.bodySm(color: c.fgMuted),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
