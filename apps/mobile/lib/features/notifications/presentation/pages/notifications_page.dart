import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/di/injection_container.dart';
import '../../../../core/extensions/navigation_extension.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/feedback/app_empty_state.dart';
import '../../../../core/presentation/widgets/feedback/app_error_view.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/notification_view.dart';
import '../../domain/repositories/notifications_repository.dart';
import '../cubit/notifications_cubit.dart';
import '../widgets/notification_row.dart';

/// «الإشعارات».
class NotificationsPage extends StatelessWidget {
  const NotificationsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => NotificationsCubit(sl<NotificationsRepository>())..load(),
      child: const _NotificationsView(),
    );
  }
}

class _NotificationsView extends StatefulWidget {
  const _NotificationsView();

  @override
  State<_NotificationsView> createState() => _NotificationsViewState();
}

class _NotificationsViewState extends State<_NotificationsView> {
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scroll
      ..removeListener(_onScroll)
      ..dispose();
    super.dispose();
  }

  /// Loads the next page 400px before the bottom.
  ///
  /// Ahead of the edge rather than at it, so the rows are already there when
  /// the student arrives — a spinner at the bottom of an infinite list is a
  /// stutter, not a feature.
  void _onScroll() {
    if (_scroll.position.pixels >= _scroll.position.maxScrollExtent - 400) {
      context.read<NotificationsCubit>().loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return BlocBuilder<NotificationsCubit, NotificationsState>(
      builder: (context, state) {
        final cubit = context.read<NotificationsCubit>();

        return Scaffold(
          backgroundColor: c.surface1,
          appBar: AppBar(
            title: Text(tr(CopyKeys.notificationsTitle)),
            leading: BackButton(onPressed: () => context.pop()),
            actions: [
              if (state.unread > 0)
                TextButton(
                  onPressed: state.markingAll ? null : cubit.markAllRead,
                  child: Text(
                    state.markingAll
                        ? tr(CopyKeys.notificationsMarkingAll)
                        : tr(CopyKeys.notificationsMarkAllRead),
                    style: type.bodyXs(color: c.accentText),
                  ),
                ),
            ],
          ),
          body: RefreshIndicator(
            onRefresh: cubit.load,
            child: switch (state) {
              NotificationsState(loading: true) => const Center(
                child: CircularProgressIndicator(),
              ),
              NotificationsState(failure: final failure?, entries: []) => AppErrorView(
                failure: failure,
                onRetry: cubit.load,
              ),
              NotificationsState(isEmpty: true) => ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  const SizedBox(height: AppSpacing.x48),
                  AppEmptyState(
                    icon: Icons.notifications_none_rounded,
                    title: tr(CopyKeys.notificationsEmpty),
                    body: tr(CopyKeys.notificationsEmptyHint),
                  ),
                ],
              ),
              _ => ListView.separated(
                controller: _scroll,
                physics: const AlwaysScrollableScrollPhysics(),
                // +1 for the footer, which is either a spinner or nothing.
                itemCount: state.entries.length + 1,
                separatorBuilder: (_, _) =>
                    Divider(color: c.line, height: 0.5, thickness: 0.5),
                itemBuilder: (context, index) {
                  if (index == state.entries.length) {
                    return state.loadingMore
                        ? const Padding(
                            padding: EdgeInsets.all(AppSpacing.x16),
                            child: Center(child: CircularProgressIndicator()),
                          )
                        : const SizedBox(height: AppSpacing.x32);
                  }

                  final entry = state.entries[index];
                  // Non-null by construction: the cubit filters unrenderable
                  // rows out at load, so nothing here has to hold a null.
                  final view = NotificationDescriber.describe(entry)!;

                  return NotificationRow(
                    entry: entry,
                    view: view,
                    onTap: () {
                      cubit.markRead(entry);
                      if (view.route != null) context.open(view.route!);
                    },
                  );
                },
              ),
            },
          ),
        );
      },
    );
  }
}
