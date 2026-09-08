part of 'subscribe_cubit.dart';

/// Where the student is in the flow.
enum SubscribeStep {
  /// Reading the InstaPay number and any submission already in the queue.
  checking,

  /// No InstaPay number configured — there is nowhere to send the money.
  unavailable,

  /// A submission for this course is already awaiting review.
  pending,

  choosePlan,
  chooseTerm,
  form,
  submitting,
  success,
}

class SubscribeState extends Equatable {
  const SubscribeState({
    this.step = SubscribeStep.checking,
    this.instapay,
    this.plan,
    this.termId,
    this.senderPhone = '',
    this.screenshot,
    this.error,
    this.rejectionReason,
    this.previouslyLapsed = false,
    this.uploadProgress,
  });

  final SubscribeStep step;

  /// E.164. Displayed as local digits — that is what a transfer screen asks
  /// a student to dial.
  final String? instapay;

  final PaymentPlan? plan;
  final String? termId;
  final String senderPhone;
  final PickedImage? screenshot;

  /// One sentence under the form. Cleared on every edit.
  final String? error;

  /// Why the LAST attempt was refused, in the admin's own words.
  final String? rejectionReason;

  /// They were subscribed before and the access ran out.
  final bool previouslyLapsed;

  /// 0..1 while the screenshot uploads, null before and after. A student on
  /// mobile data has just spent money and needs to see something moving.
  final double? uploadProgress;

  SubscribeState copyWith({
    SubscribeStep? step,
    String? instapay,
    PaymentPlan? plan,
    String? termId,
    bool clearTermId = false,
    String? senderPhone,
    PickedImage? screenshot,
    String? error,
    bool clearError = false,
    String? rejectionReason,
    bool? previouslyLapsed,
    double? uploadProgress,
  }) {
    return SubscribeState(
      step: step ?? this.step,
      instapay: instapay ?? this.instapay,
      plan: plan ?? this.plan,
      // ⚠️ An explicit clear, because `null` in `copyWith` means "unchanged".
      // Switching from a term plan to a monthly one has to DROP the term id —
      // the API refines that `plan == 'term'` iff `termId != null` and would
      // refuse the pair.
      termId: clearTermId ? null : (termId ?? this.termId),
      senderPhone: senderPhone ?? this.senderPhone,
      screenshot: screenshot ?? this.screenshot,
      error: clearError ? null : (error ?? this.error),
      rejectionReason: rejectionReason ?? this.rejectionReason,
      previouslyLapsed: previouslyLapsed ?? this.previouslyLapsed,
      uploadProgress: uploadProgress,
    );
  }

  @override
  List<Object?> get props => [
    step,
    instapay,
    plan,
    termId,
    senderPhone,
    screenshot,
    error,
    rejectionReason,
    previouslyLapsed,
    uploadProgress,
  ];
}
