import 'package:dartz/dartz.dart';
import 'package:flutter/foundation.dart';
import 'package:http_parser/http_parser.dart';

import '../../../../core/data/exception/failure.dart';
import '../../domain/entities/lesson_player.dart';
import '../../domain/entities/lesson_progress.dart';
import '../../domain/repositories/player_repository.dart';
import '../datasources/player_remote_data_source.dart';

class PlayerRepositoryImpl implements PlayerRepository {
  const PlayerRepositoryImpl(this._remote);

  final PlayerRemoteDataSource _remote;

  @override
  Future<Either<Failure, LessonPlayer>> load(String lessonId) async {
    final result = await _remote.player(lessonId);
    return result.isOk ? Right(result.value) : Left(result.failure!);
  }

  @override
  Future<void> open(String lessonId) async {
    final result = await _remote.open(lessonId);
    // ⚠️ SWALLOWED, and deliberately.
    //
    // `open` is bookkeeping: it bumps a counter and writes `lastLessonId`. A
    // student who came here to watch a lecture must not be shown an error
    // about a write they did not ask for and cannot act on — the video plays
    // either way, and the heartbeat that follows writes the same row.
    //
    // The cost of the failure is a resume target that stays where it was,
    // which the next successful open fixes.
    if (!result.isOk && kDebugMode) {
      debugPrint('lesson open failed: ${result.failure}');
    }
  }

  @override
  Future<Either<Failure, HeartbeatResult>> heartbeat(
    String lessonId, {
    required int position,
    required int delta,
  }) async {
    final result = await _remote.heartbeat(
      lessonId,
      position: position,
      delta: delta,
    );
    return result.isOk ? Right(result.value) : Left(result.failure!);
  }

  @override
  Future<Either<Failure, HeartbeatResult>> dwell(String lessonId) async {
    final result = await _remote.dwell(lessonId);
    return result.isOk ? Right(result.value) : Left(result.failure!);
  }

  @override
  Future<Either<Failure, HeartbeatResult>> complete(String lessonId) async {
    final result = await _remote.complete(lessonId);
    return result.isOk ? Right(result.value) : Left(result.failure!);
  }

  @override
  Future<Either<Failure, HomeworkImageUpload>> uploadHomeworkImage(
    String lessonId, {
    required String filePath,
    required String filename,
    required MediaType contentType,
    void Function(int sent, int total)? onProgress,
  }) async {
    final result = await _remote.uploadHomeworkImage(
      lessonId,
      filePath: filePath,
      filename: filename,
      contentType: contentType,
      onProgress: onProgress,
    );
    return result.isOk ? Right(result.value) : Left(result.failure!);
  }

  @override
  Future<Either<Failure, HomeworkSubmission>> submitHomework(
    String lessonId, {
    required List<HomeworkImageUpload> images,
  }) async {
    final result = await _remote.submitHomework(lessonId, images: images);
    return result.isOk ? Right(result.value) : Left(result.failure!);
  }
}
