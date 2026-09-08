import 'package:easy_localization/easy_localization.dart' hide TextDirection;
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/chat_message.dart';
import 'chat_attachment_view.dart';
import 'chat_reaction_chip.dart';

/// One message.
///
/// The student's own messages sit on the inline-END side in the accent tint;
/// أيمن's sit on the inline-START side on a neutral panel. Under RTL that puts
/// the student on the LEFT, which is what every messaging app an Egyptian
/// student has ever used does — WhatsApp included — and is the opposite of
/// what a naive `Alignment.centerRight` produces.
class ChatBubble extends StatelessWidget {
  const ChatBubble({required this.message, super.key});

  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final mine = message.isMine;

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.x12),
      child: Row(
        mainAxisAlignment: mine ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          Flexible(
            child: Column(
              crossAxisAlignment:
                  mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
              children: [
                Container(
                  constraints: const BoxConstraints(maxWidth: 300),
                  padding: EdgeInsets.all(
                    // A bare image gets a tight frame; words get real padding.
                    message.attachment != null && !message.hasBody
                        ? AppSpacing.x4
                        : AppSpacing.x12,
                  ),
                  decoration: BoxDecoration(
                    color: mine ? c.accent.withValues(alpha: 0.14) : c.surface2,
                    // The corner nearest the speaker is square — the classic
                    // "tail" without drawing one, which at this design's 8px
                    // ceiling looks better than a triangle would.
                    borderRadius: BorderRadiusDirectional.only(
                      topStart: const Radius.circular(AppRadius.lg),
                      topEnd: const Radius.circular(AppRadius.lg),
                      bottomStart: Radius.circular(mine ? AppRadius.lg : AppRadius.xs),
                      bottomEnd: Radius.circular(mine ? AppRadius.xs : AppRadius.lg),
                    ),
                    border: Border.all(
                      color: mine ? c.accent.withValues(alpha: 0.30) : c.line,
                      width: 0.5,
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (message.attachment != null)
                        ChatAttachmentView(attachment: message.attachment!),
                      if (message.attachment != null && message.hasBody)
                        const SizedBox(height: AppSpacing.x8),
                      if (message.hasBody)
                        // ⚠️ A plain Text, and it must stay one. There is no
                        // HTML or markdown sink on this path anywhere in the
                        // product, and adding one here would be the
                        // regression.
                        Text(message.body, style: type.body(color: c.fg)),
                    ],
                  ),
                ),

                const SizedBox(height: AppSpacing.x4),
                ChatBubbleMeta(message: message),

                if (message.adminReaction != null)
                  ChatReactionChip(emoji: message.adminReaction!),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// The time under a bubble, plus «معدّلة» and the sending state.
class ChatBubbleMeta extends StatelessWidget {
  const ChatBubbleMeta({required this.message, super.key});

  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Row(
      mainAxisSize: MainAxisSize.min,
      spacing: AppSpacing.x4,
      children: [
        if (message.pending)
          Icon(Icons.schedule_rounded, size: 12, color: c.fgFaint)
        else if (message.failed)
          Icon(Icons.error_outline_rounded, size: 12, color: c.err),
        Text(
          // `HH:mm` under the app's locale. Not a relative time («من ٥ دقايق»)
          // — a thread is read top to bottom and relative stamps make two
          // messages a minute apart look like they arrived together.
          DateFormat.Hm().format(message.createdAt),
          style: type.bodyXs(color: c.fgFaint),
        ),
        if (message.isEdited)
          Text('· معدّلة', style: type.bodyXs(color: c.fgFaint)),
      ],
    );
  }
}
