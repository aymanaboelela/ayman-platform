import 'package:dio/dio.dart';
import 'package:http_parser/http_parser.dart';

import '../../../../core/data/network/api_client.dart';
import '../../domain/entities/lesson_player.dart';
import '../../domain/entities/lesson_progress.dart';
import '../models/player_mapper.dart';

/// The lesson player's endpoints, and the progress protocol.
class PlayerRemoteDataSource {
  const PlayerRemoteDataSource(this._client);

  final ApiClient _client;

  /// Everything one lesson screen needs.
  ///
  /// ⚠️ 404 means «no such lesson» OR «not your lesson» OR «the gate has not
  /// opened it» — deliberately indistinguishable, because a 403 would confirm
  /// that an id exists. Do not build UI that tells them apart.
  ///
  /// The ONE 403 here is a lapsed grant: an expired, revoked or not-yet-valid
  /// entitlement for a student who IS enrolled. That one belongs to the
  /// subscribe flow.
  Future<Result<LessonPlayer>> player(String lessonId) {
    return _client.get<LessonPlayer>(
      '/lessons/${Uri.encodeComponent(lessonId)}/player',
      parse: (data) => PlayerMapper.player(data as Map<String, dynamic>),
    );
  }

  /// Called ONCE when the player mounts, for EVERY lesson kind.
  ///
  /// It is what writes `enrollment.lastLessonId`, so it is the entire
  /// mechanism behind resume and the dashboard's «نكمّل من مكانك» card. A
  /// screen that skips it works perfectly and quietly stops the student from
  /// ever being brought back here.
  ///
  /// ⚠️ The body must be EXACTLY `{}` — the schema is `.strict()`, so an extra
  /// key is a 400 rather than a stripped field.
  Future<Result<LessonProgress>> open(String lessonId) {
    return _client.post<LessonProgress>(
      '/lessons/${Uri.encodeComponent(lessonId)}/open',
      body: const <String, dynamic>{},
      parse: (data) => PlayerMapper.progress(data as Map<String, dynamic>),
    );
  }

  /// One tick of playback. VIDEO lessons only — anything else is a 400.
  ///
  /// [delta] is seconds of ACTUAL playback since the last call, capped at 15
  /// server-side. The claim is intersected with the gap the SERVER measured,
  /// so there is no path where a bigger number buys more credit.
  Future<Result<HeartbeatResult>> heartbeat(
    String lessonId, {
    required int position,
    required int delta,
  }) {
    return _client.post<HeartbeatResult>(
      '/lessons/${Uri.encodeComponent(lessonId)}/heartbeat',
      body: {'position': position, 'delta': delta},
      parse: (data) => PlayerMapper.heartbeat(data as Map<String, dynamic>),
    );
  }

  /// Text and attachment lessons only.
  ///
  /// The elapsed time is measured SERVER-side from `firstOpenedAt` — there is
  /// nothing in the request to forge. Asking early is not an error: the answer
  /// is the unchanged truth and the caller may ask again.
  Future<Result<HeartbeatResult>> dwell(String lessonId) {
    return _client.post<HeartbeatResult>(
      '/lessons/${Uri.encodeComponent(lessonId)}/dwell',
      body: const <String, dynamic>{},
      parse: (data) => PlayerMapper.heartbeat(data as Map<String, dynamic>),
    );
  }

  /// «خلاص · التالي».
  ///
  /// ⚠️ A quiz lesson is a 400 — it is completed by passing its quiz, and the
  /// button is hidden for that reason rather than being allowed to fail.
  ///
  /// Idempotent: a second press returns the unchanged row with
  /// `justCompleted: false`, does not rewrite the timestamp, and does not
  /// overwrite an `auto` completion with `manual`.
  Future<Result<HeartbeatResult>> complete(String lessonId) {
    return _client.post<HeartbeatResult>(
      '/lessons/${Uri.encodeComponent(lessonId)}/complete',
      body: const <String, dynamic>{},
      parse: (data) => PlayerMapper.heartbeat(data as Map<String, dynamic>),
    );
  }

  /// Uploads one page of الواجب and returns its storage key.
  Future<Result<HomeworkImageUpload>> uploadHomeworkImage(
    String lessonId, {
    required String filePath,
    required String filename,
    required MediaType contentType,
    void Function(int sent, int total)? onProgress,
  }) async {
    final form = FormData.fromMap({
      'file': await MultipartFile.fromFile(
        filePath,
        filename: filename,
        contentType: contentType,
      ),
    });

    return _client.upload<HomeworkImageUpload>(
      '/homework/lessons/${Uri.encodeComponent(lessonId)}/images',
      form: form,
      onProgress: onProgress,
      parse: (data) {
        final json = data as Map<String, dynamic>;
        return HomeworkImageUpload(
          storageKey: json['storageKey'] as String,
          sizeBytes: (json['sizeBytes'] as num).toInt(),
        );
      },
    );
  }

  /// Hands the pages in.
  ///
  /// ⚠️ Every key is re-`stat`'d against the bucket server-side: a key that is
  /// merely SHAPED right is not a key to anything, and comes back 400.
  Future<Result<HomeworkSubmission>> submitHomework(
    String lessonId, {
    required List<HomeworkImageUpload> images,
  }) {
    return _client.post<HomeworkSubmission>(
      '/homework/lessons/${Uri.encodeComponent(lessonId)}/submissions',
      body: {
        'images': [
          for (final image in images)
            {'storageKey': image.storageKey, 'sizeBytes': image.sizeBytes},
        ],
      },
      parse: (data) =>
          PlayerMapper.homeworkSubmission(data as Map<String, dynamic>),
    );
  }
}

/// One uploaded page, before it is submitted.
class HomeworkImageUpload {
  const HomeworkImageUpload({
    required this.storageKey,
    required this.sizeBytes,
  });

  final String storageKey;
  final int sizeBytes;
}
