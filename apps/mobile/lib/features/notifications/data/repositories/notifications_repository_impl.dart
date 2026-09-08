import 'package:dartz/dartz.dart';

import '../../../../core/data/exception/failure.dart';
import '../../domain/entities/notification_feed.dart';
import '../../domain/repositories/notifications_repository.dart';
import '../datasources/notifications_remote_data_source.dart';

class NotificationsRepositoryImpl implements NotificationsRepository {
  const NotificationsRepositoryImpl(this._remote);

  final NotificationsRemoteDataSource _remote;

  @override
  Future<Either<Failure, NotificationFeed>> feed({String? cursor}) async {
    final result = await _remote.feed(cursor: cursor);
    return result.isOk ? Right(result.value) : Left(result.failure!);
  }

  @override
  Future<Either<Failure, int>> unreadCount() async {
    final result = await _remote.unreadCount();
    return result.isOk ? Right(result.value) : Left(result.failure!);
  }

  @override
  Future<void> markRead(String id) async {
    await _remote.markRead(id);
  }

  @override
  Future<Either<Failure, Unit>> markAllRead() async {
    final result = await _remote.markAllRead();
    return result.isOk ? const Right(unit) : Left(result.failure!);
  }
}
