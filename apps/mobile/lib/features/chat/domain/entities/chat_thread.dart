import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

import 'chat_message.dart';

/// Where a thread stands.
enum ChatStatus {
  /// Waiting on the instructor.
  open,

  /// He replied. The student may still follow up.
  answered,

  /// Done. ⚠️ The student may start a NEW thread but can never revive this one
  /// — the API refuses a post to a closed thread with 403, and there is no
  /// reopen route on the visitor side.
  closed;

  static ChatStatus parse(String raw) => switch (raw) {
    'answered' => ChatStatus.answered,
    'closed' => ChatStatus.closed,
    _ => ChatStatus.open,
  };
}

/// The conversation with أيمن.
@immutable
class ChatThread extends Equatable {
  const ChatThread({
    required this.id,
    required this.status,
    required this.messages,
    required this.unreadForVisitor,
  });

  final String id;
  final ChatStatus status;

  /// OLDEST FIRST — `messages.last` is the newest.
  ///
  /// Only the newest 100 come back and there is no pagination for older ones,
  /// so a very long thread is silently truncated at the top. That is the API's
  /// shape, not a client choice.
  final List<ChatMessage> messages;

  /// Messages from the instructor the student has not seen.
  final int unreadForVisitor;

  bool get canReply => status != ChatStatus.closed;
  bool get isEmpty => messages.isEmpty;

  ChatThread copyWith({List<ChatMessage>? messages, int? unreadForVisitor}) => ChatThread(
    id: id,
    status: status,
    messages: messages ?? this.messages,
    unreadForVisitor: unreadForVisitor ?? this.unreadForVisitor,
  );

  @override
  List<Object?> get props => [id, status, messages, unreadForVisitor];
}
