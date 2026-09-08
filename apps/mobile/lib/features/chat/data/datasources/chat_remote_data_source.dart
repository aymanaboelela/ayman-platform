import 'package:dio/dio.dart';
import 'package:http_parser/http_parser.dart';

import '../../../../core/data/network/api_client.dart';
import '../../domain/entities/chat_thread.dart';
import '../models/chat_mapper.dart';
import '../models/staged_attachment.dart';

/// Every conversation call the app makes.
class ChatRemoteDataSource {
  const ChatRemoteDataSource(this._client);

  final ApiClient _client;

  /// The student's current thread, or null when they have never written.
  ///
  /// ⚠️ A student may hold up to three threads plus an outreach one, and this
  /// endpoint picks ONE: any thread with an unread reply wins, oldest unread
  /// first, otherwise the newest. The app does not choose and must not try —
  /// showing a list of threads would be a different product from the web's
  /// single panel.
  Future<Result<ChatThread?>> myThread() {
    return _client.get<ChatThread?>(
      '/assistant/conversations/mine',
      parse: (data) => ChatMapper.threadOrNull(data as Map<String, dynamic>),
    );
  }

  /// Open the first thread.
  ///
  /// `entryPath: ['root']` because the guided node tree is no longer walked —
  /// the spec says to send exactly this from a mobile chat. The field is still
  /// required and still validated against real node ids, so it cannot be
  /// dropped or left empty.
  ///
  /// `name`/`phone` are GUEST-only and deliberately absent: the app has no
  /// signed-out chat, and sending them from a signed-in caller is ignored at
  /// best and a 400 at worst.
  Future<Result<ChatThread>> open(String message) {
    return _client.post<ChatThread>(
      '/assistant/conversations',
      body: {
        'entryPath': ['root'],
        'message': message,
      },
      parse: (data) => ChatMapper.thread(data as Map<String, dynamic>),
    );
  }

  /// Follow up in an existing thread, optionally with a file.
  Future<Result<ChatThread>> post({
    required String threadId,
    required String message,
    StagedAttachment? attachment,
  }) {
    return _client.post<ChatThread>(
      '/assistant/conversations/$threadId/messages',
      body: {
        'message': message,
        if (attachment != null) 'attachment': attachment.toJson(),
      },
      parse: (data) => ChatMapper.thread(data as Map<String, dynamic>),
    );
  }

  /// Clear the unread dot.
  ///
  /// 204 with no body, ALWAYS — including for a thread the caller does not
  /// own, because it is an `updateMany` scoped by owner and silently matches
  /// zero rows. So a failure here is a network failure and nothing else, and
  /// it is safe to fire and forget.
  Future<Result<void>> markRead(String threadId) {
    return _client.post<void>('/assistant/conversations/$threadId/read');
  }

  /// Upload a photo or a voice note, before attaching it to a message.
  ///
  /// ⚠️ The ONE assistant route that requires a session. Guests can hold a
  /// thread and post to it but cannot upload — receiving a file needs no
  /// permission, sending one does.
  ///
  /// [contentType] is stated explicitly rather than left to Dio's guess: the
  /// server picks its pipeline from the FILENAME EXTENSION, and a recorder
  /// writing to a temp file with no extension would be refused with «اتبعت
  /// صورة أو رسالة صوتية بس» for a file that is perfectly acceptable.
  Future<Result<StagedAttachment>> upload({
    required String filePath,
    required String filename,
    required MediaType contentType,
    int? durationSeconds,
    void Function(int sent, int total)? onProgress,
    CancelToken? cancelToken,
  }) async {
    final form = FormData.fromMap({
      'file': await MultipartFile.fromFile(
        filePath,
        filename: filename,
        contentType: contentType,
      ),
    });

    return _client.upload<StagedAttachment>(
      '/assistant/conversations/attachments',
      form: form,
      cancelToken: cancelToken,
      onProgress: onProgress,
      // The duration is threaded through the upload result rather than sent
      // to the server, which neither wants it nor returns it. It travels with
      // the message instead.
      parse: (data) => StagedAttachment.fromJson(
        data as Map<String, dynamic>,
        durationSeconds: durationSeconds,
      ),
    );
  }
}
