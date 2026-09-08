import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../../../features/auth/presentation/cubit/auth_cubit.dart';
import '../../../localization/copy_keys.dart';
import '../../../router/routes.dart';
import '../../../theme/app_colors.dart';
import '../../../theme/app_spacing.dart';
import '../media/app_avatar.dart';
import '../media/brand_lockup.dart';
import 'notification_bell.dart';

/// The app bar on every signed-in screen.
///
/// ⚠️ It carries NO page title, and that is copied from the web deliberately:
/// «The page title is deliberately absent below md. Measured at 8px on a 360px
/// phone; instead every route renders its own `<h1>`.» So the bar holds the
/// menu, the brand, the bell and the avatar — and each screen states its own
/// name in the page body where there is room for it.
class StudentTopBar extends StatelessWidget implements PreferredSizeWidget {
  const StudentTopBar({super.key});

  /// 56, matching the web's `--topbar-h`.
  @override
  Size get preferredSize => const Size.fromHeight(56);

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);

    return Container(
      decoration: BoxDecoration(
        color: c.surface1,
        border: Border(bottom: BorderSide(color: c.line, width: 0.5)),
      ),
      child: SafeArea(
        bottom: false,
        child: SizedBox(
          height: 56,
          child: Padding(
            padding: const EdgeInsetsDirectional.only(
              start: AppSpacing.x4,
              end: AppSpacing.x8,
            ),
            child: Row(
              children: [
                // ⚠️ NOT `Scaffold.of(context).openDrawer()` via the default
                // leading widget. The default hamburger is a bare icon with no
                // visible label, and the web's own bar shows «القائمة» beside
                // it — the label is what makes it obvious on a first launch
                // that the rest of the app is behind it.
                const StudentMenuButton(),
                const SizedBox(width: AppSpacing.x4),

                // Portrait only. At 360px the full wordmark «أيمن أبو العلا»
                // overflowed this row on the web and rendered on top of the
                // theme switch; the sheet behind the menu shows the full
                // lockup.
                Flexible(
                  child: BrandLockup(
                    compact: true,
                    showTagline: false,
                    onTap: () => context.go(AppRoutes.dashboard),
                  ),
                ),

                const Spacer(),

                const NotificationBell(),
                const StudentAccountButton(),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// «القائمة» — the labelled drawer trigger.
class StudentMenuButton extends StatelessWidget {
  const StudentMenuButton({super.key});

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);

    return Semantics(
      button: true,
      label: tr(CopyKeys.navMenuLabel),
      child: InkWell(
        onTap: Scaffold.of(context).openDrawer,
        borderRadius: BorderRadius.circular(6),
        child: SizedBox(
          width: AppSpacing.minTap,
          height: AppSpacing.minTap,
          child: Icon(Icons.menu_rounded, size: 22, color: c.fg),
        ),
      ),
    );
  }
}

/// The avatar, which opens «بروفايلي».
///
/// A single tap to the profile rather than a dropdown: the web's account menu
/// holds four rows, and on a phone every one of them is already in the drawer
/// two lines below where the student's finger already is.
class StudentAccountButton extends StatelessWidget {
  const StudentAccountButton({super.key});

  @override
  Widget build(BuildContext context) {
    final user = context.select<AuthCubit, String?>((cubit) => cubit.user?.name);

    return Semantics(
      button: true,
      label: tr(CopyKeys.navAccountMenu),
      child: InkWell(
        onTap: () => context.go(AppRoutes.profile),
        borderRadius: BorderRadius.circular(999),
        child: SizedBox(
          width: AppSpacing.minTap,
          height: AppSpacing.minTap,
          child: Center(
            child: AppAvatar(name: user ?? ''),
          ),
        ),
      ),
    );
  }
}
