import 'package:dartz/dartz.dart';

import '../../../../core/data/exception/failure.dart';
import '../entities/session_user.dart';

/// What the app can do about who is signed in.
///
/// Abstract so the presentation layer never sees Dio, a status code or a
/// response body — and so a cubit test can drive every branch (locked account,
/// wrong password, dead network, a phone that already has an account) without a
/// server.
abstract interface class AuthRepository {
  /// The current session, or a [UnauthorizedFailure] when there is none.
  ///
  /// Called on every cold start. A 401 here is a normal answer, not an error to
  /// report — it means "signed out", and the caller routes to sign-in.
  Future<Either<Failure, SessionUser>> currentSession();

  /// Sign in with the one identifier field. The token is stored on success.
  Future<Either<Failure, SessionUser>> signIn({
    required String identifier,
    required String password,
  });

  /// Create the account and sign in. [phoneNumber] must be E.164.
  ///
  /// The failure for a number that already has an account is a
  /// [ValidationFailure] carrying `code: 'PHONE_ALREADY_REGISTERED'` — the UI
  /// branches on that to offer «ادخل بالرقم ده» instead of the generic message.
  Future<Either<Failure, SessionUser>> register({
    required String name,
    required String phoneNumber,
    required String password,
    String? email,
  });

  /// Native Google sign-in.
  Future<Either<Failure, SessionUser>> signInWithGoogle();

  /// Native Sign in with Apple.
  Future<Either<Failure, SessionUser>> signInWithApple();

  /// Ends the session locally, always — and on the server, best-effort.
  Future<Either<Failure, Unit>> signOut();
}
