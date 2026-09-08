import 'package:dartz/dartz.dart';
import 'package:http_parser/http_parser.dart';

import '../../../../core/data/exception/failure.dart';
import '../../data/datasources/player_remote_data_source.dart';
import '../entities/lesson_player.dart';
import '../entities/lesson_progress.dart';

abstract interface class PlayerRepository {
  Future<Either<Failure, LessonPlayer>> load(String lessonId);

  /// ⚠️ Never surfaces its failure. See the implementation.
  Future<void> open(String lessonId);

  Future<Either<Failure, HeartbeatResult>> heartbeat(
    String lessonId, {
    required int position,
    required int delta,
  });

  Future<Either<Failure, HeartbeatResult>> dwell(String lessonId);

  Future<Either<Failure, HeartbeatResult>> complete(String lessonId);

  Future<Either<Failure, HomeworkImageUpload>> uploadHomeworkImage(
    String lessonId, {
    required String filePath,
    required String filename,
    required MediaType contentType,
    void Function(int sent, int total)? onProgress,
  });

  Future<Either<Failure, HomeworkSubmission>> submitHomework(
    String lessonId, {
    required List<HomeworkImageUpload> images,
  });
}
