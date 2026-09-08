import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

import 'notification_entry.dart';

/// One page of the feed.
@immutable
class NotificationFeed extends Equatable {
  const NotificationFeed({required this.entries, this.nextCursor});

  final List<NotificationEntry> entries;

  /// ⚠️ Read this before writing any pagination.
  ///
  /// It is a ROW ID, not a timestamp and not an offset. Several notifications
  /// routinely share a millisecond — three quiz results graded in one submit —
  /// so a `createdAt <` window cannot advance past them and repeats a page.
  ///
  /// And it is derived from the RAW page, before the server drops rows it
  /// cannot render. So `entries.length` can be less than the limit while this
  /// is still non-null: a short page is NOT the end. Stop only when this is
  /// null, and never substitute `entries.last.id` for it.
  final String? nextCursor;

  bool get hasMore => nextCursor != null;

  @override
  List<Object?> get props => [entries, nextCursor];
}
