part of 'dashboard_cubit.dart';

/// The home screen's four states.
///
/// [DashboardReady] carries a `refreshing` flag rather than dropping back to
/// [DashboardLoading] on a pull-to-refresh: replacing a screenful of the
/// student's own courses with skeletons because they pulled down is the most
/// common way a refresh feels like a crash.
sealed class DashboardState extends Equatable {
  const DashboardState();

  @override
  List<Object?> get props => [];
}

final class DashboardLoading extends DashboardState {
  const DashboardLoading();
}

final class DashboardFailed extends DashboardState {
  const DashboardFailed(this.failure);

  final Failure failure;

  @override
  List<Object?> get props => [failure];
}

final class DashboardReady extends DashboardState {
  const DashboardReady(this.dashboard, {this.refreshing = false});

  final Dashboard dashboard;

  /// A refresh is in flight over content that is already on screen.
  final bool refreshing;

  DashboardReady copyWith({Dashboard? dashboard, bool? refreshing}) =>
      DashboardReady(
        dashboard ?? this.dashboard,
        refreshing: refreshing ?? this.refreshing,
      );

  @override
  List<Object?> get props => [dashboard, refreshing];
}
