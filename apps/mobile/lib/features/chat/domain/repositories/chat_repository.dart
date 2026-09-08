import 'package:dartz/dartz.dart';
import 'package:http_parser/http_parser.dart';

import '../../../../core/data/exception/failure.dart';
import '../../data/models/staged_attachment.dart';
import '../entities/chat_thread.dart';

abstract interface class ChatRepository {
  /// The student's thread, or `null` when they have never written.
  Future<Either<Failure, ChatThread?>> myThread();

  /// Send a message. Opens the thread when there is none, follows up when
  /// there is — the caller does not have to know which, because the student
  /// does not either.
  Future<Either<Failure, ChatThread>> send({
    ChatThread? thread,
    required String message,
    StagedAttachment? attachment,
  });

  /// Fire-and-forget. Never surfaces a failure: the dot clearing a moment late
  /// is not worth an error in front of the student.
  Future<void> markRead(String threadId);

  Future<Either<Failure, StagedAttachment>> upload({
    required String filePath,
    required String filename,
    required MediaType contentType,
    int? durationSeconds,
    void Function(int sent, int total)? onProgress,
  });
}
