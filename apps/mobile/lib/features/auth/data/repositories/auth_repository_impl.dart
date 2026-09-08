import 'package:dartz/dartz.dart';
import 'package:easy_localization/easy_localization.dart';

import '../../../../core/data/exception/failure.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../../../core/services/social_auth/social_auth_service.dart';
import '../../../../core/services/storage_service/preferences_store.dart';
import '../../../../core/services/storage_service/secure_store.dart';
import '../../domain/entities/session_user.dart';
import '../../domain/repositories/auth_repository.dart';
import '../datasources/auth_remote_data_source.dart';

/// The only place a session token is written or erased.
///
/// Sign-in and sign-up are TWO round trips, deliberately: the auth endpoints
/// return a token and a partial user, but not the permission list, so the token
/// is stored and then `/api/session` is called to get the shape the whole app
/// reads. Doing it here rather than in the cubit means a screen can never
/// observe a half-signed-in state where the token exists and the user does not.
class AuthRepositoryImpl implements AuthRepository {
  const AuthRepositoryImpl({
    required AuthRemoteDataSource remote,
    required SecureStore secureStore,
    required PreferencesStore preferences,
    required SocialAuthService socialAuth,
  })  : _remote = remote,
        _secure = secureStore,
        _preferences = preferences,
        _socialAuth = socialAuth;

  final AuthRemoteDataSource _remote;
  final SecureStore _secure;
  final PreferencesStore _preferences;
  final SocialAuthService _socialAuth;

  @override
  Future<Either<Failure, SessionUser>> currentSession() async {
    final result = await _remote.session();
    if (!result.isOk) return Left(result.failure!);
    await _secure.writeUserId(result.value.id);
    return Right(result.value);
  }

  @override
  Future<Either<Failure, SessionUser>> signIn({
    required String identifier,
    required String password,
  }) async {
    final signedIn = await _remote.signIn(identifier: identifier, password: password);
    if (!signedIn.isOk) return Left(_loginFailure(signedIn.failure!));
    return _adoptToken(signedIn.value);
  }

  @override
  Future<Either<Failure, SessionUser>> register({
    required String name,
    required String phoneNumber,
    required String password,
    String? email,
  }) async {
    final created = await _remote.signUp(
      name: name,
      phoneNumber: phoneNumber,
      password: password,
      email: email,
    );
    if (!created.isOk) return Left(_registerFailure(created.failure!));
    return _adoptToken(created.value);
  }

  @override
  Future<Either<Failure, SessionUser>> signInWithGoogle() async {
    final credential = await _socialAuth.google();
    return credential.fold(Left.new, (c) async {
      final signedIn = await _remote.signInWithIdToken(
        provider: 'google',
        idToken: c.idToken,
        nonce: c.nonce,
        accessToken: c.accessToken,
      );
      if (!signedIn.isOk) return Left(_socialFailure(signedIn.failure!));
      return _adoptToken(signedIn.value);
    });
  }

  @override
  Future<Either<Failure, SessionUser>> signInWithApple() async {
    final credential = await _socialAuth.apple();
    return credential.fold(Left.new, (c) async {
      final signedIn = await _remote.signInWithIdToken(
        provider: 'apple',
        idToken: c.idToken,
        nonce: c.nonce,
        // Apple hands over the name exactly ONCE, on the first authorisation,
        // and never again for that Apple ID. Not forwarding it now creates an
        // account with an empty name that nothing can repair.
        user: c.fullName,
      );
      if (!signedIn.isOk) return Left(_socialFailure(signedIn.failure!));
      return _adoptToken(signedIn.value);
    });
  }

  @override
  Future<Either<Failure, Unit>> signOut() async {
    // Server first, local second — but the local clear is unconditional.
    //
    // A sign-out that failed because the student is on a train with no signal
    // must still sign them out of the phone in their hand. The server session
    // then expires on its own (90 days) and «أجهزتي» can revoke it explicitly,
    // which is strictly better than leaving a credential on a device the
    // student believes they have signed out of.
    await _remote.signOut();
    await _secure.clearSession();
    await _preferences.clearSession();
    return const Right(unit);
  }

  /// Store the token, then read the session it authenticates.
  ///
  /// The token has to be written BEFORE `/api/session` is called — the
  /// interceptor reads it from the Keychain per request, and a session call
  /// made before the write would go out anonymous and 401.
  Future<Either<Failure, SessionUser>> _adoptToken(String token) async {
    await _secure.writeSessionToken(token);
    final session = await _remote.session();
    if (!session.isOk) {
      // Signed in as far as the server is concerned, but the app cannot tell
      // who. Dropping the token is the only honest state: keeping it would put
      // the app in a shell it cannot populate, and every screen would show an
      // error next to a signed-in avatar.
      await _secure.clearSession();
      return Left(session.failure!);
    }
    await _secure.writeUserId(session.value.id);
    return Right(session.value);
  }

  /// ⚠️ Every sign-in failure gets the SAME message, deliberately.
  ///
  /// The server already guarantees this: `LoginSecurityService` returns one
  /// body — `{ code: 'INVALID_CREDENTIALS' }` — for a wrong password, a
  /// non-existent account and a soft-locked one, and runs an Argon2 verify
  /// against a dummy hash when the account does not exist so the TIMING matches
  /// too. Reproducing a distinguishable message on the client would hand back
  /// the account-enumeration oracle the server spent that work removing.
  ///
  /// The one exception is a BAN, which the server does distinguish — it is the
  /// only login failure a student can act on, and its Arabic message comes
  /// through as the failure's own text.
  Failure _loginFailure(Failure failure) {
    if (failure is NetworkFailure) return failure;
    if (failure.code == 'BANNED' || failure.code == 'ACCOUNT_BANNED') return failure;
    if (failure is UnauthorizedFailure || failure.statusCode == 401) {
      return ValidationFailure(tr(CopyKeys.authErrorsLogin), code: 'INVALID_CREDENTIALS');
    }
    return failure;
  }

  /// Branch on `code`, never on `message`.
  ///
  /// The API's own message for a duplicate number is «هذا الرقم لديه حساب
  /// بالفعل», which is NOT what the product says — the UI renders «الرقم ده
  /// ليه حساب عندنا بالفعل.» and offers a link into sign-in. Two different
  /// sentences for one condition is not a mistake to be tidied up: the server's
  /// is an API message and the product's is a screen with an action on it.
  ///
  /// Everything else collapses to one generic line. A student cannot act on
  /// "unique violation race" or "hashing failure", and telling them which one
  /// happened only makes the failure feel more broken.
  Failure _registerFailure(Failure failure) {
    if (failure is NetworkFailure) return failure;
    if (failure.code == 'PHONE_ALREADY_REGISTERED') {
      return ValidationFailure(
        tr(CopyKeys.authErrorsRegisterPhoneTaken),
        code: 'PHONE_ALREADY_REGISTERED',
        statusCode: failure.statusCode,
      );
    }
    return ValidationFailure(tr(CopyKeys.authErrorsRegister), code: failure.code);
  }

  /// `OAUTH_LINK_ERROR` is the one social failure worth naming.
  ///
  /// It means the provider's email already belongs to an account created with a
  /// password, and better-auth refuses to link them silently — which is
  /// correct, because auto-linking on an unverified email is an account
  /// takeover. The student's real next step is to sign in with their password,
  /// so the message has to say that rather than «حصلت مشكلة».
  Failure _socialFailure(Failure failure) {
    if (failure is NetworkFailure || failure is CancelledFailure) return failure;
    if (failure.code == 'OAUTH_LINK_ERROR') {
      return ValidationFailure(
        tr(CopyKeys.authErrorsSocialAccountNotLinked),
        code: 'OAUTH_LINK_ERROR',
      );
    }
    return ValidationFailure(tr(CopyKeys.authErrorsSocialGeneric), code: failure.code);
  }
}
