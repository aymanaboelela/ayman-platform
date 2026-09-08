import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';

/// «النهاردة» / «امبارح» / a date, above the first message of each day.
///
/// Without it a thread that spans a week reads as one conversation, and a
/// reply that came three days after the question looks instant.
class ChatDayDivider extends StatelessWidget {
  const ChatDayDivider({required this.date, super.key});

  final DateTime date;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.x12),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.x12,
            vertical: AppSpacing.x4,
          ),
          decoration: BoxDecoration(
            color: c.surface3,
            borderRadius: AppRadius.fullAll,
          ),
          child: Text(_label(context), style: type.bodyXs(color: c.fgMuted)),
        ),
      ),
    );
  }

  String _label(BuildContext context) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final day = DateTime(date.year, date.month, date.day);
    final difference = today.difference(day).inDays;

    // Hard-coded rather than read from the copy table, because the table has
    // no key for either word: the web thread renders a full timestamp on every
    // message and never groups by day. Two words, and the alternative was
    // inventing keys the web will never use.
    if (difference == 0) return 'النهاردة';
    if (difference == 1) return 'امبارح';
    // `d MMMM` in Arabic — «٣ سبتمبر». The year is dropped inside the same
    // year, which is every thread in practice.
    return DateFormat(
      day.year == today.year ? 'd MMMM' : 'd MMMM y',
      context.locale.languageCode,
    ).format(date);
  }
}
