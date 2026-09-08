import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';

import '../../domain/repositories/notifications_repository.dart';

/// Just the number on the bell.
///
/// ## Why this is separate from [NotificationsCubit]
///
/// The bell renders on EVERY signed-in screen; the feed exists only while the
/// notifications page is open. Sharing one cubit would mean either keeping the
/// whole feed in memory app-wide, or the bell going blank whenever the page is
/// closed. The API makes the same split for the same reason: `unread-count` is
/// its own route so the bar does not fetch twenty rows for one integer.
///
/// ## The refresh cadence
///
/// 60 seconds. The `medium` throttle is 60 requests a minute per session and
/// this must not be the thing that spends them — a student on the dashboard is
/// also loading courses, covers and progress. Anything faster buys a badge
/// that is thirty seconds fresher and costs the screen they are looking at.
class UnreadBadgeCubit extends Cubit<int> {
  UnreadBadgeCubit(this._repository) : super(0);

  final NotificationsRepository _repository;
  Timer? _timer;

  static const _interval = Duration(seconds: 60);

  Future<void> start() async {
    await refresh();
    _timer?.cancel();
    _timer = Timer.periodic(_interval, (_) => refresh());
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
  }

  /// A failure is DROPPED and the last known count stays.
  ///
  /// A badge that clears itself because one poll timed out tells the student
  /// their unread messages are gone, which is worse than a number that is a
  /// minute stale.
  Future<void> refresh() async {
    final result = await _repository.unreadCount();
    result.fold((_) {}, emit);
  }

  /// Called when the page marks something read, so the bell does not wait a
  /// minute to catch up with a tap the student just made.
  void set(int value) => emit(value < 0 ? 0 : value);

  @override
  Future<void> close() {
    _timer?.cancel();
    return super.close();
  }
}
