import 'package:easy_localization/easy_localization.dart' hide TextDirection;
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../../../features/notifications/presentation/cubit/unread_badge_cubit.dart';
import '../../../localization/copy_keys.dart';
import '../../../router/routes.dart';
import '../../../theme/app_colors.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_text_style.dart';

/// The bell, with its unread count.
class NotificationBell extends StatelessWidget {
  const NotificationBell({super.key});

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return BlocBuilder<UnreadBadgeCubit, int>(
      builder: (context, unread) {
        return Semantics(
          button: true,
          // The count is IN the label, not only in the badge: a screen reader
          // announcing «الإشعارات» alone tells a blind student nothing about
          // whether it is worth opening.
          label: unread > 0
              ? tr(CopyKeys.notificationsBellWithUnread, namedArgs: {'n': '$unread'})
              : tr(CopyKeys.notificationsBell),
          child: InkWell(
            onTap: () => context.push(AppRoutes.notifications),
            borderRadius: BorderRadius.circular(999),
            child: SizedBox(
              width: AppSpacing.minTap,
              height: AppSpacing.minTap,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Icon(
                    unread > 0
                        ? Icons.notifications_rounded
                        : Icons.notifications_none_rounded,
                    size: 22,
                    color: unread > 0 ? c.accentText : c.fgMuted,
                  ),
                  if (unread > 0)
                    PositionedDirectional(
                      top: 6,
                      end: 4,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        constraints: const BoxConstraints(minWidth: 16),
                        height: 16,
                        decoration: BoxDecoration(
                          color: c.err,
                          borderRadius: BorderRadius.circular(999),
                          // A ring in the BAR's colour, so the badge reads as
                          // separate from the bell instead of merging with it
                          // at a glance.
                          border: Border.all(color: c.surface1, width: 1.5),
                        ),
                        child: Center(
                          child: Text(
                            // «+9» past nine: three digits do not fit, and the
                            // exact number stops mattering long before then.
                            unread > 9 ? '+9' : '$unread',
                            textDirection: TextDirection.ltr,
                            style: type.numeric(
                              color: const Color(0xFFFFFFFF),
                              size: 10,
                              weight: AppTextStyle.bold,
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
