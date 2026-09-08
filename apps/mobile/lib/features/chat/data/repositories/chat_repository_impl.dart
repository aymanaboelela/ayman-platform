import 'package:dartz/dartz.dart';
import 'package:http_parser/http_parser.dart';

import '../../../../core/data/exception/failure.dart';
import '../../domain/entities/chat_thread.dart';
import '../../domain/repositories/chat_repository.dart';
import '../datasources/chat_remote_data_source.dart';
import '../models/staged_attachment.dart';

class ChatRepositoryImpl implements ChatRepository {
  const ChatRepositoryImpl(this._remote);

  final ChatRemoteDataSource _remote;

  @override
  Future<Either<Failure, ChatThread?>> myThread() async {
    final result = await _remote.myThread();
    return result.isOk ? Right(result.value) : Left(result.failure!);
  }

  @override
  Future<Either<Failure, ChatThread>> send({
    ChatThread? thread,
    required String message,
    StagedAttachment? attachment,
  }) async {
    // ⚠️ OPENING a thread cannot carry a file, and following up can.
    //
    // That is the API's shape, not an oversight here: `OpenConversationSchema`
    // has no `attachment` field, because the FIRST message is the one that has
    // to say what the student wants and «صورة من غير سؤال» gives the
    // instructor nothing to answer. The UI enforces the same thing by not
    // offering the attach button until a thread exists.
    if (thread == null) {
      final result = await _remote.open(message);
      return result.isOk ? Right(result.value) : Left(result.failure!);
    }

    final result = await _remote.post(
      threadId: thread.id,
      message: message,
      attachment: attachment,
    );
    return result.isOk ? Right(result.value) : Left(result.failure!);
  }

  @override
  Future<void> markRead(String threadId) async {
    // Deliberately unchecked. The route answers 204 for any id — it is an
    // `updateMany` scoped by owner — so the only way this fails is the network,
    // and a dot that clears on the next refresh instead is not worth telling
    // anyone about.
    await _remote.markRead(threadId);
  }

  @override
  Future<Either<Failure, StagedAttachment>> upload({
    required String filePath,
    required String filename,
    required MediaType contentType,
    int? durationSeconds,
    void Function(int sent, int total)? onProgress,
  }) async {
    final result = await _remote.upload(
      filePath: filePath,
      filename: filename,
      contentType: contentType,
      durationSeconds: durationSeconds,
      onProgress: onProgress,
    );
    return result.isOk ? Right(result.value) : Left(result.failure!);
  }
}
