import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

import 'chat_attachment.dart';

/// Who wrote a message. Two values, and there will never be a third: a thread
/// has exactly two participants.
enum ChatAuthor {
  /// The student.
  visitor,

  /// المهندس أيمن.
  admin;

  static ChatAuthor parse(String raw) =>
      raw == 'admin' ? ChatAuthor.admin : ChatAuthor.visitor;
}

/// One bubble.
@immutable
class ChatMessage extends Equatable {
  const ChatMessage({
    required this.id,
    required this.author,
    required this.body,
    required this.createdAt,
    this.adminReaction,
    this.attachment,
    this.editedAt,
    this.pending = false,
    this.failed = false,
  });

  final String id;
  final ChatAuthor author;

  /// ⚠️ PLAIN TEXT. There is no HTML or markdown sink on this path at all, and
  /// adding one would be the regression — never render it as anything but a
  /// text node.
  ///
  /// May be `''` when the message is a bare file.
  final String body;

  final DateTime createdAt;

  /// One emoji the INSTRUCTOR put on this message, WhatsApp style. There is no
  /// visitor reaction — the student cannot react to anything.
  final String? adminReaction;

  final ChatAttachment? attachment;

  /// When the instructor last rewrote the words. Renders as «معدّلة».
  final DateTime? editedAt;

  /// A message this device has sent but the server has not confirmed.
  ///
  /// Rendered immediately, greyed, with a clock instead of a tick. Without it
  /// the student types, presses send, and watches nothing happen for as long
  /// as the round trip takes — which on EDGE is several seconds, and is when
  /// they press send again.
  final bool pending;

  /// The send failed and the message is still on screen with a retry.
  ///
  /// Deliberately not removed: dropping the bubble loses what they typed.
  final bool failed;

  bool get isMine => author == ChatAuthor.visitor;
  bool get hasBody => body.trim().isNotEmpty;
  bool get isEdited => editedAt != null;

  ChatMessage copyWith({bool? pending, bool? failed}) => ChatMessage(
    id: id,
    author: author,
    body: body,
    createdAt: createdAt,
    adminReaction: adminReaction,
    attachment: attachment,
    editedAt: editedAt,
    pending: pending ?? this.pending,
    failed: failed ?? this.failed,
  );

  @override
  List<Object?> get props => [
    id,
    author,
    body,
    createdAt,
    adminReaction,
    attachment,
    editedAt,
    pending,
    failed,
  ];
}
