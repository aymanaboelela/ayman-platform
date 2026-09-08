import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/chat_thread.dart';

/// A line at the top of the thread when its state needs saying.
///
/// Only two of the three statuses say anything: `open` means «waiting on
/// أيمن», and `closed` means the thread cannot be replied to at all. `answered`
/// is the ordinary state and shows nothing — a banner that is always there
/// stops being read.
class ChatStatusBanner extends StatelessWidget {
  const ChatStatusBanner({required this.status, super.key});

  final ChatStatus status;

  @override
  Widget build(BuildContext context) {
    if (status == ChatStatus.answered) return const SizedBox.shrink();

    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final closed = status == ChatStatus.closed;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.screenInset,
        vertical: AppSpacing.x8,
      ),
      color: closed ? c.surface3 : c.studyTint,
      child: Row(
        spacing: AppSpacing.x8,
        children: [
          Icon(
            closed ? Icons.lock_outline_rounded : Icons.schedule_rounded,
            size: 16,
            color: closed ? c.fgMuted : c.study,
          ),
          Expanded(
            child: Text(
              closed
                  ? tr(CopyKeys.assistantThreadClosed)
                  : tr(CopyKeys.assistantThreadWaiting),
              style: type.bodyXs(color: closed ? c.fgMuted : c.study),
            ),
          ),
        ],
      ),
    );
  }
}
