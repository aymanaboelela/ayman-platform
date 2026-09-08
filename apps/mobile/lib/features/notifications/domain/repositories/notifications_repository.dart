import 'package:dartz/dartz.dart';

import '../../../../core/data/exception/failure.dart';
import '../entities/notification_feed.dart';

abstract interface class NotificationsRepository {
  Future<Either<Failure, NotificationFeed>> feed({String? cursor});

  Future<Either<Failure, int>> unreadCount();

  /// Fire and forget: the route answers 204 for any id.
  Future<void> markRead(String id);

  Future<Either<Failure, Unit>> markAllRead();
}
