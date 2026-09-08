import 'package:easy_localization/easy_localization.dart' hide TextDirection;
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/notification_entry.dart';
import '../../domain/entities/notification_view.dart';

/// One notification.
///
/// An unread row is marked TWICE — a tinted background and a dot — because
/// colour alone is not available to every student, and on a cheap screen the
/// tint is a very small difference.
class NotificationRow extends StatelessWidget {
  const NotificationRow({
    required this.entry,
    required this.view,
    required this.onTap,
    super.key,
  });

  final NotificationEntry entry;
  final NotificationView view;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final unread = entry.isUnread;

    return InkWell(
      onTap: onTap,
      child: Container(
        color: unread ? c.accent.withValues(alpha: 0.06) : null,
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.screenInset,
          vertical: AppSpacing.x12,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: AppSpacing.x12,
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: unread ? c.accent.withValues(alpha: 0.14) : c.surface3,
                borderRadius: AppRadius.mdAll,
              ),
              child: Icon(
                view.icon,
                size: 18,
                color: unread ? c.accentText : c.fgMuted,
              ),
            ),

            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    view.title,
                    style: type.bodySm(
                      color: c.fg,
                      weight: unread ? AppTextStyle.semibold : AppTextStyle.regular,
                    ),
                  ),
                  if (view.detail != null) ...[
                    const SizedBox(height: AppSpacing.x2),
                    Text(view.detail!, style: type.bodyXs(color: c.fgMuted)),
                  ],
                  if (view.subtitle != null && view.subtitle!.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.x2),
                    Text(
                      view.subtitle!,
                      style: type.bodyXs(color: c.fgFaint),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                  const SizedBox(height: AppSpacing.x4),
                  Text(
                    // An absolute stamp, not «من ٥ دقايق». The copy table HAS
                    // an `ago` template and the web deliberately does not use
                    // it — a relative time has to be recomputed to stay true,
                    // and a list that says "5 minutes ago" an hour later is
                    // worse than one that says when.
                    DateFormat('d MMM · HH:mm', context.locale.languageCode)
                        .format(entry.createdAt),
                    style: type.bodyXs(color: c.fgFaint),
                  ),
                ],
              ),
            ),

            if (unread)
              Container(
                width: 8,
                height: 8,
                margin: const EdgeInsets.only(top: AppSpacing.x8),
                decoration: BoxDecoration(color: c.accent, shape: BoxShape.circle),
              ),
          ],
        ),
      ),
    );
  }
}
