import 'dart:io';

import 'package:dartz/dartz.dart';
import 'package:dio/dio.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../data/exception/failure.dart';
import '../../data/network/api_client.dart';
import '../../data/network/api_error_mapper.dart';

/// Opens a file that lives behind the API's own gate.
///
/// ## Why a link will not do
///
/// A lesson's slides are served from `/api/lessons/:id/resources/:rid/download`,
/// not from the public media origin — deliberately, because `/media/*` is
/// public and can never carry enrolment-gated content, so these routes
/// re-derive access on every request.
///
/// That means the SESSION has to travel with the request, and this app's
/// session is a bearer token held in secure storage, not a cookie any browser
/// would send. Handing the URL to the system browser makes an anonymous call
/// and returns a 401 that reads, to a student, as a broken slide deck.
///
/// So the bytes are fetched with the authenticated client, written to a
/// temporary file, and handed to the OS.
class GatedFileService {
  const GatedFileService(this._client);

  final ApiClient _client;

  /// Downloads [path] and offers it to whatever app can open it.
  ///
  /// [suggestedName] is the instructor's TITLE, not the stored filename —
  /// multer decodes the multipart name as latin1, so the stored one is
  /// mojibake for any Arabic upload.
  Future<Either<Failure, Unit>> openInSystem({
    required String path,
    required String suggestedName,
    String? mime,
  }) async {
    try {
      final directory = await getTemporaryDirectory();
      final file = File(p.join(directory.path, _safeName(suggestedName, mime)));

      // Through `raw` on purpose: this is a byte stream to disk, not a JSON
      // response, and the client's parse/error mapping does not apply. The
      // interceptors — and therefore the bearer token — still do.
      await _client.raw.download(path, file.path);

      final result = await SharePlus.instance.share(
        ShareParams(files: [XFile(file.path, mimeType: mime)]),
      );

      return result.status == ShareResultStatus.unavailable
          ? Left(const ServerFailure('لسه مقدرناش نفتح الملف ده.'))
          : const Right(unit);
    } on DioException catch (error) {
      return Left(ApiErrorMapper.map(error));
    } catch (_) {
      return Left(const ServerFailure('لسه مقدرناش نفتح الملف ده.'));
    }
  }

  /// A filesystem-safe name that still reads as the lecture's material.
  ///
  /// The extension comes from the MIME type rather than from the title: a
  /// title is prose («البريزنتيشن الأساسي») and the OS picks the app to open
  /// with by extension.
  static String _safeName(String title, String? mime) {
    final cleaned = title.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_').trim();
    final base = cleaned.isEmpty ? 'lesson-material' : cleaned;
    final extension = switch (mime) {
      'application/pdf' => '.pdf',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation' =>
        '.pptx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' =>
        '.docx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' =>
        '.xlsx',
      _ => '',
    };
    return p.extension(base).isEmpty ? '$base$extension' : base;
  }
}
