import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../features/auth/presentation/cubit/auth_cubit.dart';
import '../../../config/app_environment.dart';
import '../../../localization/copy_keys.dart';
import '../../../router/routes.dart';
import '../../../router/student_nav_items.dart';
import '../../../theme/app_colors.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_text_style.dart';
import '../media/brand_lockup.dart';
import 'drawer_nav_row.dart';
import 'drawer_theme_row.dart';

/// Every destination the app has, including the four in the bottom bar.
///
/// Nothing is reachable only one way: the bar is a shortcut to the four screens
/// a student opens daily, and this is the complete list. A student who does not
/// find «الكتب» in the bar has to be able to find it here without learning that
/// some things live in one place and some in the other.
class StudentDrawer extends StatelessWidget {
  const StudentDrawer({super.key});

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final location = GoRouterState.of(context).uri.path;
    final active = StudentNav.activeFor(location);
    final isAdmin = context.select<AuthCubit, bool>(
      (cubit) => cubit.user?.isAdmin ?? false,
    );

    return Drawer(
      backgroundColor: c.surface1,
      // Square on the outer edge: the drawer runs the full height and its far
      // side is the screen edge, so rounding it leaves two slivers of page
      // showing through.
      shape: const RoundedRectangleBorder(),
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.all(AppSpacing.x16),
              // The FULL lockup here, tagline and all — this is the surface the
              // app bar's compact mark defers to.
              child: BrandLockup(
                onTap: () {
                  Navigator.of(context).pop();
                  context.go(AppRoutes.dashboard);
                },
              ),
            ),
            Divider(color: c.line, height: 0.5, thickness: 0.5),

            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.x8),
                children: [
                  for (final item in StudentNav.items)
                    DrawerNavRow(
                      item: item,
                      selected: active?.route == item.route,
                    ),

                  // The conversation with أيمن.
                  //
                  // Not in `StudentNav.items` because the web has no equivalent
                  // route — there it is a docked panel on every page, and a
                  // panel is the wrong shape on a phone. So the destination is
                  // mobile-only and lives here rather than pretending to
                  // mirror a web nav entry that does not exist.
                  DrawerNavRow(
                    item: const StudentNavItem(
                      route: AppRoutes.chat,
                      labelKey: CopyKeys.assistantThreadTitle,
                      icon: Icons.forum_outlined,
                      activeIcon: Icons.forum_rounded,
                    ),
                    selected: location == AppRoutes.chat,
                  ),

                  if (isAdmin) ...[
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.x16,
                        vertical: AppSpacing.x8,
                      ),
                      child: Divider(color: c.line, height: 0.5, thickness: 0.5),
                    ),
                    // Gated on the `admin:access` PERMISSION, not on a role
                    // string. `roleHasPermission` fails closed on an unknown
                    // role and this must too — and it is a courtesy either
                    // way, since the API re-checks on every request.
                    DrawerNavRow(
                      item: const StudentNavItem(
                        route: AppRoutes.admin,
                        labelKey: CopyKeys.navAdminPanel,
                        icon: Icons.shield_outlined,
                        activeIcon: Icons.shield_rounded,
                      ),
                      selected: location.startsWith(AppRoutes.admin),
                    ),
                  ],
                ],
              ),
            ),

            Divider(color: c.line, height: 0.5, thickness: 0.5),
            const DrawerThemeRow(),

            // «الموقع الرئيسي» — the marketing site, which the app does not
            // reimplement. See `AppRoutes.notInTheApp`.
            ListTile(
              leading: Icon(Icons.north_west_rounded, size: 20, color: c.fgMuted),
              title: Text(
                tr(CopyKeys.navBackToSite),
                style: type.bodySm(color: c.fgMuted),
              ),
              onTap: () => launchUrl(
                Uri.parse(AppEnvironment.siteUrl),
                mode: LaunchMode.externalApplication,
              ),
            ),

            ListTile(
              leading: Icon(Icons.logout_rounded, size: 20, color: c.err),
              title: Text(
                tr(CopyKeys.navLogout),
                style: type.bodySm(color: c.err),
              ),
              onTap: () {
                // Close the drawer BEFORE signing out. The router's redirect
                // fires the moment `AuthCubit` emits, and a drawer left open
                // over the sign-in screen is the classic artefact of doing
                // these in the other order.
                Navigator.of(context).pop();
                context.read<AuthCubit>().signOut();
              },
            ),
            const SizedBox(height: AppSpacing.x8),
          ],
        ),
      ),
    );
  }
}
