import 'package:dartz/dartz.dart';
import 'package:http_parser/http_parser.dart';

import '../../../../core/data/exception/failure.dart';
import '../../domain/entities/payment_submission.dart';
import '../../domain/repositories/payments_repository.dart';
import '../datasources/payments_remote_data_source.dart';

class PaymentsRepositoryImpl implements PaymentsRepository {
  const PaymentsRepositoryImpl(this._remote);

  final PaymentsRemoteDataSource _remote;

  @override
  Future<PaymentSubmission?> latestFor(String courseId) async {
    final result = await _remote.mine();
    if (!result.isOk) return null;

    // Newest-first from the API, so the FIRST match is the latest.
    for (final row in result.value) {
      if (row.courseId == courseId) return row;
    }
    return null;
  }

  @override
  Future<Either<Failure, PaymentSubmission>> submit({
    required String courseId,
    required PaymentPlan plan,
    required String senderPhone,
    required String filePath,
    required String filename,
    required MediaType contentType,
    String? termId,
    void Function(int sent, int total)? onProgress,
  }) async {
    final upload = await _remote.uploadScreenshot(
      filePath: filePath,
      filename: filename,
      contentType: contentType,
      onProgress: onProgress,
    );
    if (!upload.isOk) return Left(upload.failure!);

    final submitted = await _remote.submit(
      courseId: courseId,
      plan: plan,
      senderPhone: senderPhone,
      screenshotKey: upload.value,
      termId: termId,
    );

    return submitted.isOk
        ? Right(submitted.value)
        : Left(submitted.failure!);
  }
}
