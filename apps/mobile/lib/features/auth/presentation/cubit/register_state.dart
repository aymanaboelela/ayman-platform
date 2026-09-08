part of 'register_cubit.dart';

/// The register form's per-field errors, computed client-side against the same
/// rules `RegisterSchema` enforces.
///
/// A record rather than five nullable fields on the state, so "clear them all"
/// is one assignment and cannot leave one behind.
typedef RegisterFieldErrors = ({
  String? name,
  String? phone,
  String? email,
  String? password,
  String? confirmPassword,
});

const RegisterFieldErrors _noFieldErrors = (
  name: null,
  phone: null,
  email: null,
  password: null,
  confirmPassword: null,
);

@immutable
class RegisterState extends Equatable {
  const RegisterState({
    this.submitting = false,
    this.failure,
    this.fieldErrors = _noFieldErrors,
    this.signedIn,
  });

  final bool submitting;

  /// The banner above the form. `PHONE_ALREADY_REGISTERED` is the one the UI
  /// treats specially — it gets a link into sign-in rather than just words.
  final Failure? failure;

  final RegisterFieldErrors fieldErrors;

  /// Set once, on success. The page listens and hands the user to [AuthCubit].
  final SessionUser? signedIn;

  bool get hasFieldErrors =>
      fieldErrors.name != null ||
      fieldErrors.phone != null ||
      fieldErrors.email != null ||
      fieldErrors.password != null ||
      fieldErrors.confirmPassword != null;

  RegisterState copyWith({
    bool? submitting,
    Failure? failure,
    RegisterFieldErrors? fieldErrors,
    SessionUser? signedIn,
    bool clearFailure = false,
  }) {
    return RegisterState(
      submitting: submitting ?? this.submitting,
      failure: clearFailure ? null : (failure ?? this.failure),
      fieldErrors: fieldErrors ?? this.fieldErrors,
      signedIn: signedIn ?? this.signedIn,
    );
  }

  @override
  List<Object?> get props => [submitting, failure, fieldErrors, signedIn];
}
