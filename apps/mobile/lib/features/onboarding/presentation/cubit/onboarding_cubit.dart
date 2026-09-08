import 'package:easy_localization/easy_localization.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/data/exception/failure.dart';
import '../../../../core/data/taxonomy/taxonomy.dart';
import '../../../../core/functions/egyptian_phone.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../../../core/localization/validation_messages.dart';
import '../../domain/entities/onboarding_draft.dart';
import '../../domain/repositories/onboarding_repository.dart';

part 'onboarding_state.dart';

/// The four-step wizard.
///
/// ## Why validation is per STEP and not per form
///
/// A student who fills three steps and then discovers on the fourth that their
/// phone was wrong has to walk back through the whole thing. Each step
/// validates its own fields before it will advance, so an error is always on
/// the screen that caused it.
class OnboardingCubit extends Cubit<OnboardingState> {
  OnboardingCubit(this._repository) : super(const OnboardingState());

  final OnboardingRepository _repository;

  /// The step holding the phone. The one server error that walks BACKWARDS
  /// lands here — a 409 means the number belongs to another account.
  static const phoneStep = 0;
  static const lastStep = 3;

  /// Reads the reference data, and seeds what the account already knows.
  ///
  /// ⚠️ [knownName] goes into the DRAFT, not just into the text field.
  /// Seeding the controller alone shipped first and produced «الاسم الكامل
  /// مطلوب» over a field the student could plainly see filled in — the
  /// controller and the draft are two different things, and `onChanged` only
  /// fires when a human types.
  Future<void> load({String? knownName}) async {
    emit(
      state.copyWith(
        loading: true,
        draft: knownName == null || knownName.trim().isEmpty
            ? state.draft
            : state.draft.copyWith(fullName: knownName),
      ),
    );
    final taxonomy = await _repository.taxonomy();
    emit(state.copyWith(loading: false, taxonomy: taxonomy, taxonomyLoaded: true));
  }

  void edit(OnboardingDraft Function(OnboardingDraft draft) change) {
    emit(state.copyWith(draft: change(state.draft), clearErrors: true));
  }

  /// Validates the current step, then advances.
  ///
  /// Returns false when it did not move, so the caller can leave the keyboard
  /// where it is rather than scrolling a step the student is still on.
  bool next() {
    final errors = _validate(state.step);
    if (errors.isNotEmpty) {
      emit(state.copyWith(fieldErrors: errors));
      return false;
    }
    if (state.step >= lastStep) return false;
    emit(state.copyWith(step: state.step + 1, clearErrors: true));
    return true;
  }

  void back() {
    if (state.step == 0) return;
    emit(state.copyWith(step: state.step - 1, clearErrors: true));
  }

  /// Saves. Answers true when the profile was written.
  Future<bool> submit() async {
    final errors = _validate(state.step);
    if (errors.isNotEmpty) {
      emit(state.copyWith(fieldErrors: errors));
      return false;
    }

    emit(state.copyWith(submitting: true, clearErrors: true));
    final result = await _repository.submit(
      draft: state.draft,
      taxonomy: state.taxonomy,
    );

    return result.fold(
      (failure) {
        // ⚠️ 409 is the ONE server error attached to a field. It means the
        // number is already on another account, so the wizard walks BACK to
        // the step that holds it — leaving the student on step four with a
        // banner about a field three screens away is how a form becomes
        // unfinishable.
        final isConflict = failure is ConflictFailure;
        emit(
          state.copyWith(
            submitting: false,
            step: isConflict ? phoneStep : state.step,
            fieldErrors: isConflict
                ? {'phone': tr(CopyKeys.onboardingPhoneConflictError)}
                : const {},
            formError: isConflict
                ? tr(CopyKeys.onboardingPhoneConflictHint)
                : failure.message,
          ),
        );
        return false;
      },
      (_) {
        emit(state.copyWith(submitting: false, done: true));
        return true;
      },
    );
  }

  /// What is missing on one step.
  ///
  /// The messages are the CONTRACT's own, generated into the copy file — so a
  /// rule that changes in `onboarding.ts` changes here without anyone editing
  /// an Arabic string by hand.
  Map<String, String> _validate(int step) {
    final draft = state.draft;
    final errors = <String, String>{};

    switch (step) {
      case 0:
        if (draft.fullName.trim().length < 2) {
          errors['fullName'] = ValidationMessages.onboarding['fullName']!;
        }
        if (draft.gender == null) {
          errors['gender'] = tr(CopyKeys.onboardingGenderError);
        }
        if (EgyptianPhone.normalize(draft.phone) == null) {
          errors['phone'] = ValidationMessages.onboarding['phone']!;
        }
      case 1:
        if (draft.governorateCode == null) {
          errors['governorateCode'] =
              ValidationMessages.onboarding['governorateCode']!;
        }
        if (draft.schoolName.trim().isEmpty) {
          errors['schoolName'] = ValidationMessages.onboarding['schoolName']!;
        }
        if (draft.schoolStream == null) {
          errors['schoolStream'] = tr(CopyKeys.onboardingSchoolStreamError);
        }
      case 2:
        if (draft.year == null) {
          errors['year'] = ValidationMessages.onboarding['year']!;
        }
      case 3:
        if (EgyptianPhone.normalize(draft.fatherPhone) == null) {
          errors['fatherPhone'] = ValidationMessages.onboarding['fatherPhone']!;
        }
    }

    return errors;
  }
}
