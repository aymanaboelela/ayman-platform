import 'package:dartz/dartz.dart';
import 'package:http_parser/http_parser.dart';

import '../../../../core/data/exception/failure.dart';
import '../entities/payment_submission.dart';

abstract interface class PaymentsRepository {
  /// The student's most recent submission for one course, or null.
  ///
  /// ⚠️ A FAILED lookup returns null, not a failure. It must never block
  /// checkout: worst case the student sees the plan picker again and the
  /// submit call 409s, which is handled — better than refusing to show a
  /// payment form because a status probe timed out.
  Future<PaymentSubmission?> latestFor(String courseId);

  /// Uploads the screenshot, then files the submission.
  ///
  /// One method because the two calls are one act: a key with no submission
  /// behind it is an orphaned object in storage, and every caller that split
  /// them had to reimplement the retry.
  Future<Either<Failure, PaymentSubmission>> submit({
    required String courseId,
    required PaymentPlan plan,
    required String senderPhone,
    required String filePath,
    required String filename,
    required MediaType contentType,
    String? termId,
    void Function(int sent, int total)? onProgress,
  });
}
