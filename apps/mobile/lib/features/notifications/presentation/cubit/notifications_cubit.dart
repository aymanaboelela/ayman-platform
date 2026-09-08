import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:meta/meta.dart';

import '../../../../core/data/exception/failure.dart';
import '../../domain/entities/notification_entry.dart';
import '../../domain/entities/notification_view.dart';
import '../../domain/repositories/notifications_repository.dart';

part 'notifications_state.dart';

/// «الإشعارات».
class NotificationsCubit extends Cubit<NotificationsState> {
  NotificationsCubit(this._repository) : super(const NotificationsState());

  final NotificationsRepository _repository;

  Future<void> load() async {
    emit(state.copyWith(loading: true, clearFailure: true));

    final result = await _repository.feed();
    result.fold(
      (failure) => emit(state.copyWith(loading: false, failure: failure)),
      (feed) => emit(
        state.copyWith(
          loading: false,
          entries: _renderable(feed.entries),
          nextCursor: feed.nextCursor,
          clearCursor: feed.nextCursor == null,
          clearFailure: true,
        ),
      ),
    );

    await refreshUnread();
  }

  /// ⚠️ Paginates on `nextCursor` ONLY.
  ///
  /// Never on `entries.last.id`, and never stopping because a page came back
  /// short. The cursor is derived from the RAW page before the server drops
  /// rows it cannot render, so a page of twenty rows can yield three entries
  /// and still have more behind it — and the last ENTRY's id is not where the
  /// raw page ended.
  Future<void> loadMore() async {
    if (state.loadingMore || !state.hasMore) return;
    emit(state.copyWith(loadingMore: true));

    final result = await _repository.feed(cursor: state.nextCursor);
    result.fold(
      // A failed page keeps what is on screen and simply stops the spinner:
      // the student is reading rows they already have.
      (_) => emit(state.copyWith(loadingMore: false)),
      (feed) => emit(
        state.copyWith(
          loadingMore: false,
          entries: [...state.entries, ..._renderable(feed.entries)],
          nextCursor: feed.nextCursor,
          clearCursor: feed.nextCursor == null,
        ),
      ),
    );
  }

  Future<void> refreshUnread() async {
    final result = await _repository.unreadCount();
    result.fold((_) {}, (count) => emit(state.copyWith(unread: count)));
  }

  /// Marks one read, OPTIMISTICALLY.
  ///
  /// The row is struck from the unread list before the request goes, because
  /// the route answers 204 for any id and the only way it fails is the
  /// network — at which point the next load corrects it. Waiting for the round
  /// trip means the dot stays lit for a second after a tap, which reads as the
  /// tap not registering.
  Future<void> markRead(NotificationEntry entry) async {
    if (!entry.isUnread) return;

    final now = DateTime.now();
    emit(
      state.copyWith(
        entries: [
          for (final e in state.entries) e.id == entry.id ? e.markRead(now) : e,
        ],
        unread: state.unread > 0 ? state.unread - 1 : 0,
      ),
    );

    await _repository.markRead(entry.id);
  }

  Future<void> markAllRead() async {
    if (state.markingAll || state.unread == 0) return;
    emit(state.copyWith(markingAll: true));

    final now = DateTime.now();
    final result = await _repository.markAllRead();

    result.fold(
      (_) => emit(state.copyWith(markingAll: false)),
      (_) => emit(
        state.copyWith(
          markingAll: false,
          entries: [for (final e in state.entries) e.markRead(now)],
          unread: 0,
        ),
      ),
    );
  }

  /// Drops rows this build cannot render.
  ///
  /// The API is on a rolling release and the spec is explicit: an unknown kind
  /// must be skipped, not thrown on. Filtering HERE — once, at the boundary —
  /// means no widget below has to hold a null view.
  List<NotificationEntry> _renderable(List<NotificationEntry> entries) => entries
      .where((entry) => NotificationDescriber.describe(entry) != null)
      .toList(growable: false);
}
