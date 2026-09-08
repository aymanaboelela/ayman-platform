import 'package:dio/dio.dart';
import 'package:http_parser/http_parser.dart';

import '../../../../core/data/network/api_client.dart';
import '../../domain/entities/payment_submission.dart';
import '../models/payment_mapper.dart';

class PaymentsRemoteDataSource {
  const PaymentsRemoteDataSource(this._client);

  final ApiClient _client;

  /// This student's own submissions, NEWEST FIRST.
  ///
  /// The order is load-bearing: the first row for a course is its most recent
  /// submission, and it is the only one that should gate the subscribe sheet.
  /// An older rejection sitting behind a later approval must not resurface.
  Future<Result<List<PaymentSubmission>>> mine() {
    return _client.get<List<PaymentSubmission>>(
      '/payments/submissions/me',
      parse: PaymentMapper.mine,
    );
  }

  /// Uploads the transfer screenshot and returns its storage key.
  ///
  /// A separate call from the submission itself, and it has to be: the API
  /// takes a key, not bytes, so the picture is stored first and referenced
  /// second. A student whose upload succeeds and whose submit fails can
  /// retry the submit without re-picking the photo.
  Future<Result<String>> uploadScreenshot({
    required String filePath,
    required String filename,
    required MediaType contentType,
    void Function(int sent, int total)? onProgress,
  }) async {
    final form = FormData.fromMap({
      // ⚠️ `file` — the field name `FileInterceptor('file')` expects. Anything
      // else arrives as no file at all and 400s with a message about a missing
      // upload.
      'file': await MultipartFile.fromFile(
        filePath,
        filename: filename,
        contentType: contentType,
      ),
    });

    return _client.upload<String>(
      '/payments/screenshot',
      form: form,
      onProgress: onProgress,
      parse: (data) => (data as Map<String, dynamic>)['screenshotKey'] as String,
    );
  }

  /// Files the transfer for review.
  ///
  /// ⚠️ 409 means a pending submission for this course already exists. That is
  /// not a failure the student can retry away — it is «استنى الرد الأول».
  Future<Result<PaymentSubmission>> submit({
    required String courseId,
    required PaymentPlan plan,
    required String senderPhone,
    required String screenshotKey,
    String? termId,
  }) {
    return _client.post<PaymentSubmission>(
      '/payments/submissions',
      body: {
        'courseId': courseId,
        'plan': plan.wire,
        // Always sent, null included: the schema is `.strict()` and refines
        // that `plan == 'term'` iff `termId != null`, so omitting the key on a
        // non-term plan and sending it on a term one are two different bugs.
        'termId': termId,
        'senderPhone': senderPhone,
        'screenshotKey': screenshotKey,
      },
      parse: (data) =>
          PaymentMapper.submission(data as Map<String, dynamic>),
    );
  }
}
