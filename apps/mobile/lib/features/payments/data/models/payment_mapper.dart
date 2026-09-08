import '../../../../core/data/network/json_parse.dart';
import '../../domain/entities/payment_submission.dart';

/// Parses the payment endpoints.
///
/// Hand-written against `PaymentSubmissionSchema` in
/// `packages/contracts/src/payments.ts`.
abstract final class PaymentMapper {
  /// `GET /api/payments/submissions/me` → a bare ARRAY, not an envelope.
  static List<PaymentSubmission> mine(dynamic data) =>
      jsonList(data, submission);

  static PaymentSubmission submission(Map<String, dynamic> json) {
    return PaymentSubmission(
      id: json['id'] as String,
      courseId: json['courseId'] as String,
      courseTitle: json['courseTitle'] as String,
      status: json['status'] as String,
      plan: PaymentPlan.fromWire(json['plan'] as String?),
      termTitle: json['termTitle'] as String?,
      amountCents: (json['amountCents'] as num).toInt(),
      rejectionReason: json['rejectionReason'] as String?,
      validUntil: _date(json['validUntil']),
      createdAt: _date(json['createdAt']) ?? DateTime.now(),
    );
  }

  /// ⚠️ Parsed as UTC and converted, never `DateTime.parse` alone. The API
  /// sends ISO-8601 with a `Z`; a device in Cairo reading it as local time
  /// would put every expiry two hours out, which for a subscription ending at
  /// midnight is a day.
  static DateTime? _date(dynamic value) {
    if (value is! String || value.isEmpty) return null;
    return DateTime.tryParse(value)?.toLocal();
  }
}
