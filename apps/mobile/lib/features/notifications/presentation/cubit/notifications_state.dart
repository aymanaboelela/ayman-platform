part of 'notifications_cubit.dart';

@immutable
class NotificationsState extends Equatable {
  const NotificationsState({
    this.loading = true,
    this.entries = const [],
    this.nextCursor,
    this.loadingMore = false,
    this.failure,
    this.unread = 0,
    this.markingAll = false,
  });

  final bool loading;

  /// Already FILTERED: rows whose kind this build does not know are dropped at
  /// load, so nothing downstream has to think about them.
  final List<NotificationEntry> entries;

  final String? nextCursor;
  final bool loadingMore;
  final Failure? failure;
  final int unread;
  final bool markingAll;

  bool get hasMore => nextCursor != null;
  bool get isEmpty => entries.isEmpty && !loading && failure == null;

  NotificationsState copyWith({
    bool? loading,
    List<NotificationEntry>? entries,
    String? nextCursor,
    bool? loadingMore,
    Failure? failure,
    int? unread,
    bool? markingAll,
    bool clearFailure = false,
    bool clearCursor = false,
  }) {
    return NotificationsState(
      loading: loading ?? this.loading,
      entries: entries ?? this.entries,
      nextCursor: clearCursor ? null : (nextCursor ?? this.nextCursor),
      loadingMore: loadingMore ?? this.loadingMore,
      failure: clearFailure ? null : (failure ?? this.failure),
      unread: unread ?? this.unread,
      markingAll: markingAll ?? this.markingAll,
    );
  }

  @override
  List<Object?> get props => [
    loading,
    entries,
    nextCursor,
    loadingMore,
    failure,
    unread,
    markingAll,
  ];
}
