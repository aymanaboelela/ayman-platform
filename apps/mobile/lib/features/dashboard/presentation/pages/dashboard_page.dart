import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/data/exception/failure.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/feedback/app_empty_state.dart';
import '../../../../core/presentation/widgets/feedback/app_error_view.dart';
import '../../../../core/presentation/widgets/feedback/app_skeleton_list.dart';
import '../../../../core/presentation/widgets/layout/app_section_header.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../auth/presentation/cubit/auth_cubit.dart';
import '../../domain/repositories/dashboard_repository.dart';
import '../cubit/dashboard_cubit.dart';
import '../widgets/continue_watching_card.dart';
import '../widgets/dashboard_hero.dart';
import '../widgets/enrolled_course_card.dart';

/// «حسابي» — the home screen.
class DashboardPage extends StatelessWidget {
  const DashboardPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => DashboardCubit(sl<DashboardRepository>())..load(),
      child: const _DashboardView(),
    );
  }
}

class _DashboardView extends StatelessWidget {
  const _DashboardView();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<DashboardCubit, DashboardState>(
      builder: (context, state) {
        return RefreshIndicator(
          onRefresh: context.read<DashboardCubit>().refresh,
          child: switch (state) {
            DashboardLoading() => const _DashboardSkeleton(),
            DashboardFailed(:final failure) => _DashboardError(failure: failure),
            DashboardReady(:final dashboard) => ListView(
              // `always`, so pull-to-refresh works even when the content is
              // shorter than the screen — which it is for a student with no
              // courses, the exact case where a refresh is most wanted.
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screenInset,
                AppSpacing.x16,
                AppSpacing.screenInset,
                AppSpacing.x32,
              ),
              children: [
                DashboardHero(
                  user: context.select((AuthCubit c) => c.user),
                  dashboard: dashboard,
                ),
                const SizedBox(height: AppSpacing.x24),

                if (dashboard.continueWatching != null) ...[
                  ContinueWatchingCard(item: dashboard.continueWatching!),
                  const SizedBox(height: AppSpacing.x24),
                ],

                AppSectionHeader(
                  title: tr(CopyKeys.dashboardMyCourses),
                  count: dashboard.hasCourses
                      ? '${dashboard.enrolledCourses.length}'
                      : null,
                  actionLabel: dashboard.hasCourses
                      ? tr(CopyKeys.dashboardLinkCourses)
                      : null,
                  onAction: dashboard.hasCourses
                      ? () => context.go(AppRoutes.library)
                      : null,
                ),
                const SizedBox(height: AppSpacing.x12),

                if (!dashboard.hasCourses)
                  AppEmptyState(
                    icon: Icons.collections_bookmark_outlined,
                    title: tr(CopyKeys.dashboardEmptyTitle),
                    body: tr(CopyKeys.dashboardEmptyBody),
                    actionLabel: tr(CopyKeys.dashboardBrowseCourses),
                    onAction: () => context.go(AppRoutes.library),
                  )
                else
                  // One column, not a grid. The web goes 2-up from `sm`
                  // (640px) and no phone this ships to is that wide in
                  // portrait; a 2-up grid at 360px gives each card 164px,
                  // which is narrower than the «نكمّل» button inside it.
                  for (final course in dashboard.enrolledCourses) ...[
                    EnrolledCourseCard(course: course),
                    const SizedBox(height: AppSpacing.stackGap),
                  ],
              ],
            ),
          },
        );
      },
    );
  }
}

/// What «حسابي» looks like while it loads.
///
/// Shaped like the real page — a band, then cards — rather than a centred
/// spinner. A spinner says "something is happening"; this says "your courses
/// are coming", and the layout does not jump when they arrive.
class _DashboardSkeleton extends StatelessWidget {
  const _DashboardSkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(AppSpacing.screenInset),
      children: const [
        // Shaped like the band: one tall block, then the three course cards
        // below it. Matching the real count matters — fewer placeholders than
        // content makes the page grow when it loads, more makes it shrink,
        // and either one moves whatever the student was about to tap.
        AppSkeletonList(rows: 2, rowHeight: 56, spacing: AppSpacing.x12),
        SizedBox(height: AppSpacing.x24),
        AppSkeletonList(rows: 3, rowHeight: 120, spacing: AppSpacing.stackGap),
      ],
    );
  }
}

/// The whole screen failed.
///
/// `/api/me/dashboard` is one of the three calls that is allowed to take this
/// page down — everything optional on the home screen is fetched separately
/// and degrades to its section not rendering.
class _DashboardError extends StatelessWidget {
  const _DashboardError({required this.failure});

  final Failure failure;

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(AppSpacing.screenInset),
      children: [
        const SizedBox(height: AppSpacing.x48),
        AppErrorView(
          failure: failure,
          onRetry: context.read<DashboardCubit>().load,
        ),
      ],
    );
  }
}
