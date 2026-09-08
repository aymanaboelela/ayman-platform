import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/buttons/app_button.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';

enum SubscribeNoticeTone { neutral, ok, warn }

/// The four one-sentence states: checking, no number, already pending, done.
///
/// One widget for all four because they are the same object — a glyph, a
/// sentence, and a way out — and four near-identical panels is how two of them
/// end up with different padding.
class SubscribeNoticeStep extends StatelessWidget {
  const SubscribeNoticeStep({
    required this.messageKey,
    this.tone = SubscribeNoticeTone.neutral,
    this.busy = false,
    super.key,
  });

  final String messageKey;
  final SubscribeNoticeTone tone;

  /// A spinner instead of a glyph, and no dismiss — the sheet is working.
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    final (icon, colour) = switch (tone) {
      SubscribeNoticeTone.ok => (Icons.check_circle_outline_rounded, c.ok),
      SubscribeNoticeTone.warn => (Icons.schedule_rounded, c.warn),
      SubscribeNoticeTone.neutral => (Icons.info_outline_rounded, c.fgMuted),
    };

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.x24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppSpacing.x16,
        children: [
          if (busy)
            const Center(
              child: SizedBox(
                width: 28,
                height: 28,
                child: CircularProgressIndicator(strokeWidth: 2.5),
              ),
            )
          else
            Icon(icon, size: 40, color: colour),
          Text(
            tr(messageKey),
            textAlign: TextAlign.center,
            style: type.body(color: c.fg),
          ),
          if (!busy)
            AppButton(
              label: tr(CopyKeys.libraryLockedClose),
              variant: AppButtonVariant.secondary,
              // Answers `true` so a caller that opened this over a course page
              // knows a submission may have landed and refreshes.
              onPressed: () => Navigator.of(context).pop(
                tone == SubscribeNoticeTone.ok,
              ),
            ),
        ],
      ),
    );
  }
}
