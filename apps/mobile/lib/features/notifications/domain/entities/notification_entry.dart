import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

/// One row from `GET /api/me/notifications`.
///
/// ## Why the payload is a Map and not eighteen subclasses
///
/// The wire type is a zod discriminated union with EIGHTEEN variants, and the
/// API drops any row it cannot render. Modelling each as its own Dart class
/// buys type safety on fields that are read in exactly one place — the
/// describer — and costs eighteen files plus a parse that throws on a kind
/// this build has not heard of yet.
///
/// Rule 3 of the spec is explicit: *unknown kinds must not crash, the client
/// must skip a kind it does not know rather than throwing.* A flat payload with
/// a typed reader gives that for free: an unrecognised kind describes to null
/// and is filtered out, and a rolling API release cannot take the screen down.
@immutable
class NotificationEntry extends Equatable {
  const NotificationEntry({
    required this.id,
    required this.kind,
    required this.createdAt,
    required this.payload,
    this.readAt,
  });

  final String id;

  /// The discriminator, as a raw String. See the class docs for why it is not
  /// an enum: an enum parse throws on a value added server-side.
  final String kind;

  final DateTime createdAt;

  /// Null while unread. The whole read model is this one field.
  final DateTime? readAt;

  /// Everything else the row carried, flat.
  final Map<String, dynamic> payload;

  bool get isUnread => readAt == null;

  /// A payload string, or `''`.
  ///
  /// Empty rather than null on purpose: every copy template that interpolates
  /// one puts it at the END of the sentence precisely so the sentence still
  /// reads when the value is missing — a book order whose lines were all
  /// removed is NOT dropped by the server and arrives with `bookTitle: ''`.
  String str(String key) {
    final value = payload[key];
    return value is String ? value : '';
  }

  int? intOrNull(String key) {
    final value = payload[key];
    return value is num ? value.toInt() : null;
  }

  bool? boolOrNull(String key) {
    final value = payload[key];
    return value is bool ? value : null;
  }

  NotificationEntry markRead(DateTime at) => NotificationEntry(
    id: id,
    kind: kind,
    createdAt: createdAt,
    readAt: readAt ?? at,
    payload: payload,
  );

  @override
  List<Object?> get props => [id, kind, createdAt, readAt, payload];
}
