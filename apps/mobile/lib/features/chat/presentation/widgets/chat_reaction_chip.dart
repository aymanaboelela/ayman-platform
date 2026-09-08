import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';

/// The one emoji أيمن put on a message, WhatsApp style.
///
/// There is no visitor reaction column and no route to set one, so this is
/// display-only in the app — the student cannot react to anything, and a
/// tappable chip here would be a control that does nothing.
class ChatReactionChip extends StatelessWidget {
  const ChatReactionChip({required this.emoji, super.key});

  final String emoji;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);

    return Container(
      // Pulled up so it overlaps the bubble's bottom edge, the way a reaction
      // sits on a message everywhere else.
      transform: Matrix4.translationValues(0, -6, 0),
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.x8,
        vertical: AppSpacing.x2,
      ),
      decoration: BoxDecoration(
        color: c.surface3,
        borderRadius: AppRadius.fullAll,
        border: Border.all(color: c.line, width: 0.5),
      ),
      child: Text(emoji, style: const TextStyle(fontSize: 13)),
    );
  }
}
