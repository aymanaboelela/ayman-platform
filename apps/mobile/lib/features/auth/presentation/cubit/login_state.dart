part of 'login_cubit.dart';

/// Which button is spinning, if any.
///
/// One enum rather than three booleans: the three sign-in paths are mutually
/// exclusive, and a `isLoading && isGoogleLoading` state that cannot happen
/// should not be expressible. It also means "disable everything except the
/// button that is working" is one comparison.
enum LoginPending { none, credentials, google, apple }

@immutable
class LoginState extends Equatable {
  const LoginState({
    this.pending = LoginPending.none,
    this.failure,
    this.identifierError,
    this.passwordError,
    this.signedIn,
  });

  final LoginPending pending;

  /// The last failure, for the banner above the form. Cleared the moment the
  /// student edits either field — an error message that outlives the thing it
  /// describes reads as the app being stuck.
  final Failure? failure;

  /// Per-field validation, computed client-side before any request.
  final String? identifierError;
  final String? passwordError;

  /// Set exactly once, on success. The page listens for it and hands the user
  /// to [AuthCubit], which is what actually moves the router.
  final SessionUser? signedIn;

  bool get isBusy => pending != LoginPending.none;

  /// Whether a given button should show its spinner.
  bool isPending(LoginPending which) => pending == which;

  LoginState copyWith({
    LoginPending? pending,
    Failure? failure,
    String? identifierError,
    String? passwordError,
    SessionUser? signedIn,
    bool clearFailure = false,
    bool clearFieldErrors = false,
  }) {
    return LoginState(
      pending: pending ?? this.pending,
      failure: clearFailure ? null : (failure ?? this.failure),
      identifierError: clearFieldErrors ? null : (identifierError ?? this.identifierError),
      passwordError: clearFieldErrors ? null : (passwordError ?? this.passwordError),
      signedIn: signedIn ?? this.signedIn,
    );
  }

  @override
  List<Object?> get props => [pending, failure, identifierError, passwordError, signedIn];
}
