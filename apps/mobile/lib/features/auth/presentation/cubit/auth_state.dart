part of 'auth_cubit.dart';

/// Where the app is with respect to "who is this".
///
/// A sealed hierarchy rather than one class with nullable fields, because the
/// router branches on it and every impossible combination — signed in with no
/// user, unknown with a user — should be unrepresentable rather than merely
/// unlikely.
sealed class AuthState extends Equatable {
  const AuthState();

  @override
  List<Object?> get props => [];
}

/// Before the first `/api/session` has answered.
///
/// The splash screen holds here. It is a REAL state, not a loading flag: a
/// router that treated "unknown" as "signed out" would flash the sign-in screen
/// at every returning student on every cold start.
final class AuthUnknown extends AuthState {
  const AuthUnknown();
}

/// No session — never signed in, signed out, or the token was rejected.
final class AuthSignedOut extends AuthState {
  const AuthSignedOut({this.reason});

  /// Why, when the app knows. `session_expired` is the one worth telling the
  /// student about: they were signed in a moment ago and are now looking at a
  /// login screen, and an unexplained one reads as the app losing their data.
  final String? reason;

  @override
  List<Object?> get props => [reason];
}

/// Signed in, and the app knows who.
final class AuthSignedIn extends AuthState {
  const AuthSignedIn(this.user);

  final SessionUser user;

  @override
  List<Object?> get props => [user];
}
