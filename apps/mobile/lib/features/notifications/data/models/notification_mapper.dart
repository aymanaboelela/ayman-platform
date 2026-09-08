import '../../domain/entities/notification_entry.dart';
import '../../domain/entities/notification_feed.dart';

/// Parses `GET /api/me/notifications`.
abstract final class NotificationMapper {
  static NotificationFeed feed(Map<String, dynamic> json) {
    final raw = json['entries'];
    return NotificationFeed(
      entries: raw is List
          ? raw.cast<Map<String, dynamic>>().map(entry).toList(growable: false)
          : const [],
      nextCursor: json['nextCursor'] as String?,
    );
  }

  static NotificationEntry entry(Map<String, dynamic> json) {
    return NotificationEntry(
      id: json['id'] as String,
      kind: json['kind'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String).toLocal(),
      readAt: json['readAt'] is String
          ? DateTime.parse(json['readAt'] as String).toLocal()
          : null,
      // Everything except the four base fields. Kept whole rather than picked
      // apart per kind: the describer is the only thing that reads it, and a
      // field added server-side for an existing kind then needs no change
      // here at all.
      payload: Map<String, dynamic>.from(json)
        ..removeWhere((key, _) => const {'id', 'kind', 'createdAt', 'readAt'}.contains(key)),
    );
  }
}
