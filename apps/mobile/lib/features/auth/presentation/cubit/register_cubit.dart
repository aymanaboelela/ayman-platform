import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:meta/meta.dart';

import '../../../../core/data/exception/failure.dart';
import '../../../../core/functions/egyptian_phone.dart';
import '../../../../core/localization/validation_messages.dart';
import '../../domain/entities/session_user.dart';
import '../../domain/repositories/auth_repository.dart';

part 'register_state.dart';

/// Drives «إنشاء حسابك».
///
/// The validation below is a transcription of `RegisterSchema`, and it is
/// deliberately a DUPLICATE rather than the authority: the server re-validates
/// everything and nothing stops a caller POSTing straight past this. What it
/// buys is that the student is told which field is wrong before they press the
/// button, instead of getting one generic «مقدرناش نعمل الحساب» back.
class RegisterCubit extends Cubit<RegisterState> {
  RegisterCubit(this._repository) : super(const RegisterState());

  final AuthRepository _repository;

  /// Clears the banner and every field error as soon as anything is edited.
  void onFieldChanged() {
    if (state.failure == null && !state.hasFieldErrors) return;
    emit(state.copyWith(clearFailure: true, fieldErrors: _noFieldErrors));
  }

  Future<void> submit({
    required String name,
    required String phone,
    required String email,
    required String password,
    required String confirmPassword,
  }) async {
    if (state.submitting) return;

    final trimmedName = name.trim();
    final trimmedEmail = email.trim();
    final normalisedPhone = EgyptianPhone.normalize(phone);

    final errors = (
      name: switch (trimmedName.length) {
        < 2 => ValidationMessages.registerNameRequired,
        > 120 => ValidationMessages.registerNameTooLong,
        _ => null,
      },
      // Empty and malformed are DIFFERENT messages, matching the schema:
      // `egyptianPhone('رقم الموبايل مطلوب')` fires the required text on a
      // blank string and the INVALID constant on anything it cannot parse.
      phone: phone.trim().isEmpty
          ? ValidationMessages.registerPhoneRequired
          : normalisedPhone == null
              ? ValidationMessages.registerPhoneInvalid
              : null,
      // Optional. Blank is accepted and the field is omitted from the request
      // entirely — an untouched optional input submits `''`, and letting that
      // reach a `z.email()` is the fastest way to make an optional field feel
      // required.
      email: trimmedEmail.isNotEmpty && !_looksLikeEmail(trimmedEmail)
          ? ValidationMessages.registerEmailInvalid
          : null,
      password: switch (password.length) {
        < 8 => ValidationMessages.registerPasswordTooShort,
        > 128 => ValidationMessages.registerPasswordTooLong,
        _ => null,
      },
      // Attached to confirmPassword, not to password — the schema's
      // `superRefine` puts it there, and marking the first field would send
      // the student back to change the one they got right.
      confirmPassword: confirmPassword.isEmpty
          ? ValidationMessages.registerConfirmRequired
          : confirmPassword != password
              ? ValidationMessages.registerConfirmMismatch
              : null,
    );

    final hasError = errors.name != null ||
        errors.phone != null ||
        errors.email != null ||
        errors.password != null ||
        errors.confirmPassword != null;

    if (hasError) {
      emit(state.copyWith(clearFailure: true, fieldErrors: errors));
      return;
    }

    emit(
      state.copyWith(
        submitting: true,
        clearFailure: true,
        fieldErrors: _noFieldErrors,
      ),
    );

    final result = await _repository.register(
      name: trimmedName,
      // Already E.164 — the server normalises again, but sending the canonical
      // form means the value that reaches `/sign-up/email` is exactly what
      // `/sign-in/phone-number` will later look the account up by.
      phoneNumber: normalisedPhone!,
      password: password,
      email: trimmedEmail.isEmpty ? null : trimmedEmail,
    );

    result.fold(
      (failure) => emit(state.copyWith(submitting: false, failure: failure)),
      (user) => emit(state.copyWith(submitting: false, signedIn: user)),
    );
  }

  /// A shape check, not a validity check.
  ///
  /// Deliberately loose: the server runs `z.email()` and is the authority. A
  /// strict client-side regex is how an honest student with an unusual but
  /// legal address gets refused by a form that never sends anything.
  bool _looksLikeEmail(String value) {
    final at = value.indexOf('@');
    if (at <= 0 || at != value.lastIndexOf('@')) return false;
    final domain = value.substring(at + 1);
    return domain.contains('.') && !domain.startsWith('.') && !domain.endsWith('.');
  }
}
