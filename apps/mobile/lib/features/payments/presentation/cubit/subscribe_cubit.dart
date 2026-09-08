import 'package:easy_localization/easy_localization.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/data/exception/failure.dart';
import '../../../../core/data/settings/settings_repository.dart';
import '../../../../core/functions/egyptian_phone.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../../../core/services/media/image_pick_service.dart';
import '../../../course/domain/entities/course_detail.dart';
import '../../domain/entities/payment_submission.dart';
import '../../domain/repositories/payments_repository.dart';

part 'subscribe_state.dart';

/// Owns «اشتراك الكورس» — the four steps between "this costs money" and
/// "we have your transfer".
class SubscribeCubit extends Cubit<SubscribeState> {
  SubscribeCubit({
    required PaymentsRepository payments,
    required SettingsRepository settings,
    required CourseDetail course,
  })  : _payments = payments,
        _settings = settings,
        _course = course,
        super(const SubscribeState());

  final PaymentsRepository _payments;
  final SettingsRepository _settings;
  final CourseDetail _course;

  CourseDetail get course => _course;

  /// ⚠️ Opens on [SubscribeStep.checking], NEVER on the plan picker.
  ///
  /// A student who already has a submission in the review queue for THIS
  /// course must see that — «قيد المراجعة» again, not a second plan picker
  /// they could resubmit through. The API would 409 it anyway, but arriving
  /// there via a fresh «اختار الباقة» reads as though the platform forgot
  /// they already paid.
  Future<void> start() async {
    final settings = await _settings.load();
    final instapay = settings.contact.instapay;

    // Nothing to pay to. Said plainly rather than showing a form whose money
    // has nowhere to go.
    if (instapay == null || instapay.isEmpty) {
      emit(state.copyWith(step: SubscribeStep.unavailable));
      return;
    }

    final latest = await _payments.latestFor(_course.id);

    emit(
      state.copyWith(
        instapay: instapay,
        step: latest != null && latest.isPending
            ? SubscribeStep.pending
            : SubscribeStep.choosePlan,
        // Surfaced on the picker as context, not as an error: they are being
        // asked to pay again and these two sentences say why.
        rejectionReason: latest != null && latest.isRejected
            ? latest.rejectionReason
            : null,
        previouslyLapsed: latest?.isLapsed ?? false,
      ),
    );
  }

  /// ⚠️ A term purchase needs a SECOND choice — which term — unless there is
  /// only one to pick. A course with exactly one open, priced term goes
  /// straight to the form, same as the date-based plans do.
  void choosePlan(PaymentPlan plan) {
    if (plan != PaymentPlan.term) {
      emit(state.copyWith(
        plan: plan,
        clearTermId: true,
        step: SubscribeStep.form,
        clearError: true,
      ));
      return;
    }

    if (_course.terms.length == 1) {
      emit(state.copyWith(
        plan: plan,
        termId: _course.terms.single.id,
        step: SubscribeStep.form,
        clearError: true,
      ));
      return;
    }

    emit(state.copyWith(
      plan: plan,
      clearTermId: true,
      step: SubscribeStep.chooseTerm,
      clearError: true,
    ));
  }

  void chooseTerm(CourseTerm term) => emit(
        state.copyWith(
          termId: term.id,
          step: SubscribeStep.form,
          clearError: true,
        ),
      );

  /// Back out one step, or answer false when there is nowhere to go — the
  /// sheet then closes.
  bool back() {
    switch (state.step) {
      case SubscribeStep.form when state.plan == PaymentPlan.term &&
          _course.terms.length > 1:
        emit(state.copyWith(step: SubscribeStep.chooseTerm, clearError: true));
        return true;
      case SubscribeStep.form:
      case SubscribeStep.chooseTerm:
        emit(state.copyWith(step: SubscribeStep.choosePlan, clearError: true));
        return true;
      default:
        return false;
    }
  }

  void setSenderPhone(String value) =>
      emit(state.copyWith(senderPhone: value, clearError: true));

  void setScreenshot(PickedImage image) =>
      emit(state.copyWith(screenshot: image, clearError: true));

  /// Validates, uploads, files. One call, because the two requests are one act.
  Future<bool> submit() async {
    final plan = state.plan;
    final screenshot = state.screenshot;
    if (plan == null || state.step == SubscribeStep.submitting) return false;

    if (state.senderPhone.trim().isEmpty) {
      emit(state.copyWith(error: tr(CopyKeys.subscribeSenderPhoneRequired)));
      return false;
    }

    // Normalised to E.164 HERE and not on the server's word alone: the API
    // rejects a malformed number with a generic validation message, and the
    // student is looking at the one field it is about.
    final phone = EgyptianPhone.normalize(state.senderPhone);
    if (phone == null) {
      emit(state.copyWith(error: tr(CopyKeys.subscribeSenderPhoneInvalid)));
      return false;
    }

    if (screenshot == null) {
      emit(state.copyWith(error: tr(CopyKeys.subscribeScreenshotRequired)));
      return false;
    }

    emit(state.copyWith(step: SubscribeStep.submitting, clearError: true));

    final result = await _payments.submit(
      courseId: _course.id,
      plan: plan,
      termId: state.termId,
      senderPhone: phone,
      filePath: screenshot.path,
      filename: screenshot.filename,
      contentType: screenshot.contentType,
      onProgress: (sent, total) => emit(
        state.copyWith(
          step: SubscribeStep.submitting,
          uploadProgress: total > 0 ? sent / total : null,
        ),
      ),
    );

    return result.fold(
      (failure) {
        emit(
          state.copyWith(
            step: SubscribeStep.form,
            // 409 is not a retryable error — a pending submission for this
            // course already exists, and «حاول تاني» would invite a duplicate.
            error: failure is ConflictFailure
                ? tr(CopyKeys.subscribeAlreadyPending)
                : failure.message,
          ),
        );
        return false;
      },
      (_) {
        emit(state.copyWith(step: SubscribeStep.success));
        return true;
      },
    );
  }
}
