import 'package:dartz/dartz.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:meta/meta.dart';

import '../../../../core/data/exception/failure.dart';
import '../../../../core/localization/validation_messages.dart';
import '../../domain/entities/session_user.dart';
import '../../domain/repositories/auth_repository.dart';

part 'login_state.dart';

/// Drives the sign-in screen.
///
/// Short-lived — created with the page, disposed with it. The app-wide session
/// lives in [AuthCubit]; this one only owns "what is the form doing right now".
class LoginCubit extends Cubit<LoginState> {
  LoginCubit(this._repository) : super(const LoginState());

  final AuthRepository _repository;

  /// Clears the error banner as soon as the student changes anything.
  ///
  /// Without this the message from the previous attempt sits above a form they
  /// have already corrected, and «البريد أو كلمة المرور مش مظبوطين» stops
  /// meaning "this attempt failed" and starts meaning "this screen is broken".
  void onFieldChanged() {
    if (state.failure == null && state.identifierError == null && state.passwordError == null) {
      return;
    }
    emit(state.copyWith(clearFailure: true, clearFieldErrors: true));
  }

  Future<void> submit({required String identifier, required String password}) async {
    if (state.isBusy) return;

    // ⚠️ The client-side rules are exactly the server's, and they are almost
    // nothing: `identifier` is trim + min 1 with NO shape check, and
    // `password` is min 1 with NO length check.
    //
    // The absent length check is deliberate on the server and must stay absent
    // here. A sign-in form that refuses a 6-character password tells an
    // attacker that no account has one — and it locks out any student whose
    // password predates a rule change.
    final trimmedIdentifier = identifier.trim();
    final identifierError =
        trimmedIdentifier.isEmpty ? ValidationMessages.loginIdentifierRequired : null;
    final passwordError = password.isEmpty ? ValidationMessages.loginPasswordRequired : null;

    if (identifierError != null || passwordError != null) {
      emit(
        state.copyWith(
          clearFailure: true,
          identifierError: identifierError,
          passwordError: passwordError,
        ),
      );
      return;
    }

    emit(
      state.copyWith(
        pending: LoginPending.credentials,
        clearFailure: true,
        clearFieldErrors: true,
      ),
    );

    final result = await _repository.signIn(
      identifier: trimmedIdentifier,
      password: password,
    );

    _settle(result);
  }

  Future<void> withGoogle() => _social(LoginPending.google, _repository.signInWithGoogle);

  Future<void> withApple() => _social(LoginPending.apple, _repository.signInWithApple);

  Future<void> _social(
    LoginPending which,
    Future<Either<Failure, SessionUser>> Function() run,
  ) async {
    if (state.isBusy) return;
    emit(state.copyWith(pending: which, clearFailure: true, clearFieldErrors: true));
    _settle(await run());
  }

  void _settle(Either<Failure, SessionUser> result) {
    result.fold(
      (failure) {
        // A cancelled provider sheet is not a failure to report — the student
        // closed it on purpose. Reporting it puts «حصلت مشكلة» on screen for
        // an action they deliberately abandoned.
        if (failure is CancelledFailure) {
          emit(state.copyWith(pending: LoginPending.none));
          return;
        }
        emit(state.copyWith(pending: LoginPending.none, failure: failure));
      },
      (user) => emit(state.copyWith(pending: LoginPending.none, signedIn: user)),
    );
  }
}
