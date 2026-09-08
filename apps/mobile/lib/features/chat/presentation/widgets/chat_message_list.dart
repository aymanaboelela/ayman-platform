import 'package:flutter/material.dart';

import '../../../../core/theme/app_spacing.dart';
import '../../domain/entities/chat_message.dart';
import 'chat_bubble.dart';
import 'chat_day_divider.dart';

/// The thread.
///
/// ⚠️ `reverse: true`, and the list is reversed to match.
///
/// A chat is read from the bottom. With a normal ListView the newest message
/// starts off-screen and every send has to be chased with a scroll animation
/// that fights the keyboard opening. Reversing means index 0 IS the newest,
/// the viewport is anchored there by construction, and a new message pushes
/// the old ones up for free — no controller, no jump, no fight.
class ChatMessageList extends StatelessWidget {
  const ChatMessageList({required this.messages, super.key});

  /// Oldest first, as the API sends it.
  final List<ChatMessage> messages;

  @override
  Widget build(BuildContext context) {
    // Newest first, for the reversed viewport.
    final ordered = messages.reversed.toList(growable: false);

    return ListView.builder(
      reverse: true,
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.screenInset,
        vertical: AppSpacing.x16,
      ),
      itemCount: ordered.length,
      itemBuilder: (context, index) {
        final message = ordered[index];

        // The divider belongs ABOVE the first message of a day, which in a
        // reversed list means comparing against the NEXT index — the one that
        // is chronologically earlier.
        final earlier = index + 1 < ordered.length ? ordered[index + 1] : null;
        final startsDay = earlier == null || !_sameDay(earlier.createdAt, message.createdAt);

        return Column(
          children: [
            if (startsDay) ChatDayDivider(date: message.createdAt),
            ChatBubble(message: message),
          ],
        );
      },
    );
  }

  static bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
}
