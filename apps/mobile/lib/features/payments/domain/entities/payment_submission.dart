import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

/// What a student is buying.
///
/// `term` is the odd one out and it stays that way: the three date-based plans
/// expire on a date, a term ends when the admin closes it. Its `validUntil` is
/// always null, which is why «اشتراكه خلص» is never said about one.
enum PaymentPlan {
  monthly,
  quarterly,
  yearly,
  term;

  /// The wire value. ⚠️ `name` happens to match for all four today; spelled
  /// out anyway so renaming a Dart enum member cannot silently change an API
  /// request.
  String get wire => switch (this) {
        PaymentPlan.monthly => 'monthly',
        PaymentPlan.quarterly => 'quarterly',
        PaymentPlan.yearly => 'yearly',
        PaymentPlan.term => 'term',
      };

  static PaymentPlan? fromWire(String? value) => switch (value) {
        'monthly' => PaymentPlan.monthly,
        'quarterly' => PaymentPlan.quarterly,
        'yearly' => PaymentPlan.yearly,
        'term' => PaymentPlan.term,
        _ => null,
      };
}

/// One submitted transfer, awaiting or past review.
@immutable
class PaymentSubmission extends Equatable {
  const PaymentSubmission({
    required this.id,
    required this.courseId,
    required this.courseTitle,
    required this.status,
    required this.amountCents,
    required this.createdAt,
    this.plan,
    this.termTitle,
    this.rejectionReason,
    this.validUntil,
  });

  final String id;
  final String courseId;
  final String courseTitle;

  /// `pending` | `approved` | `rejected`.
  final String status;

  final PaymentPlan? plan;
  final String? termTitle;
  final int amountCents;

  /// Why it was refused, in the admin's own words. Shown to the student.
  final String? rejectionReason;

  /// When access runs out. ⚠️ Always null for a `term` plan — a closed term is
  /// an admin action, not a date running out.
  final DateTime? validUntil;

  final DateTime createdAt;

  bool get isPending => status == 'pending';
  bool get isRejected => status == 'rejected';

  /// Approved, and the access it bought has already run out.
  ///
  /// A student who subscribed before and let it lapse lands back on the plan
  /// picker; saying so is the difference between «اشترك» and «كنت مشترك قبل
  /// كده وخلصت مدتك — اشترك تاني».
  bool get isLapsed =>
      status == 'approved' &&
      validUntil != null &&
      validUntil!.isBefore(DateTime.now());

  @override
  List<Object?> get props => [id, courseId, status, plan, validUntil, createdAt];
}
