import '../../../../core/data/network/api_client.dart';
import '../../domain/entities/notification_feed.dart';
import '../models/notification_mapper.dart';

class NotificationsRemoteDataSource {
  const NotificationsRemoteDataSource(this._client);

  final ApiClient _client;

  /// One page.
  ///
  /// `limit` is capped at 50 server-side and anything non-numeric or <= 0
  /// silently falls back to 20, so a bad value fails quietly rather than
  /// loudly — which is why the client sends a fixed, known-good one.
  Future<Result<NotificationFeed>> feed({String? cursor, int limit = 20}) {
    return _client.get<NotificationFeed>(
      '/me/notifications',
      query: {
        'cursor': ?cursor,
        'limit': '$limit',
      },
      parse: (data) => NotificationMapper.feed(data as Map<String, dynamic>),
    );
  }

  /// Just the number, for the bell.
  ///
  /// Its own route on purpose — the bar renders it on every screen and must
  /// not fetch twenty rows for one integer.
  Future<Result<int>> unreadCount() {
    return _client.get<int>(
      '/me/notifications/unread-count',
      parse: (data) => (data as Map<String, dynamic>)['unread'] as int,
    );
  }

  /// 204, always — including for an id the caller does not own, which updates
  /// zero rows. Idempotent: the filter includes `readAt: null`, so marking an
  /// already-read row does not move its timestamp.
  Future<Result<void>> markRead(String id) {
    return _client.post<void>('/me/notifications/$id/read');
  }

  Future<Result<void>> markAllRead() {
    return _client.post<void>('/me/notifications/read-all');
  }
}
