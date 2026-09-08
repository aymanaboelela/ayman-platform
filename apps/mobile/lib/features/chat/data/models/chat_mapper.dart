import '../../domain/entities/chat_attachment.dart';
import '../../domain/entities/chat_message.dart';
import '../../domain/entities/chat_thread.dart';

/// Parses `GET /api/assistant/conversations/mine` and the two POSTs that
/// return the same shape.
abstract final class ChatMapper {
  /// ⚠️ `conversation` is NULL when the student has never opened a thread, and
  /// the response is a 200, never a 404. Treating the null as an error would
  /// turn "you have not written to him yet" into a red screen.
  static ChatThread? threadOrNull(Map<String, dynamic> json) {
    final raw = json['conversation'];
    if (raw is! Map<String, dynamic>) return null;
    return thread(raw);
  }

  static ChatThread thread(Map<String, dynamic> json) {
    final rawMessages = json['messages'];
    return ChatThread(
      id: json['id'] as String,
      status: ChatStatus.parse(json['status'] as String),
      messages: rawMessages is List
          ? rawMessages
                .cast<Map<String, dynamic>>()
                .map(message)
                .toList(growable: false)
          : const [],
      unreadForVisitor: (json['unreadForVisitor'] as num?)?.toInt() ?? 0,
    );
  }

  static ChatMessage message(Map<String, dynamic> json) {
    final rawAttachment = json['attachment'];
    return ChatMessage(
      id: json['id'] as String,
      author: ChatAuthor.parse(json['author'] as String),
      // Never `?? ''`-ed away into something else: an empty body is a REAL
      // state — a message that is a bare file — and the bubble branches on it.
      body: json['body'] as String? ?? '',
      createdAt: DateTime.parse(json['createdAt'] as String).toLocal(),
      adminReaction: json['adminReaction'] as String?,
      attachment: rawAttachment is Map<String, dynamic>
          ? attachment(rawAttachment)
          : null,
      editedAt: json['editedAt'] is String
          ? DateTime.parse(json['editedAt'] as String).toLocal()
          : null,
    );
  }

  static ChatAttachment attachment(Map<String, dynamic> json) {
    return ChatAttachment(
      kind: ChatAttachmentKind.parse(json['kind'] as String),
      filename: json['filename'] as String,
      sizeBytes: (json['sizeBytes'] as num).toInt(),
      durationSeconds: (json['durationSeconds'] as num?)?.toInt(),
      path: json['path'] as String,
      downloadPath: json['downloadPath'] as String,
    );
  }
}
