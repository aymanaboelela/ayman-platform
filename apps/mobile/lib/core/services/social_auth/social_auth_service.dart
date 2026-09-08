import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:dartz/dartz.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

import '../../config/app_environment.dart';
import '../../data/exception/failure.dart';
import '../../localization/copy_keys.dart';
import 'social_credential.dart';

/// Talks to the Google and Apple SDKs, and to nothing else.
///
/// It returns an ID TOKEN, not a session. Exchanging that token for a session
/// is `/api/auth/sign-in/social`'s job and the repository's — a native client
/// never runs the browser redirect flow the web uses.
///
/// ## Why availability is a first-class question here
///
/// Neither provider is configured on the server yet: `GOOGLE_CLIENT_ID` does
/// not exist (`docs/runbooks/google-sign-in.md` records that the OAuth client
/// has never been created), and the four `APPLE_*` vars are unset, which is why
/// better-auth registers neither provider and `/sign-in/social` answers 404
/// `PROVIDER_NOT_FOUND`.
///
/// So [googleAvailable] and [appleAvailable] gate the BUTTONS. A sign-in button
/// that always fails is worse than no button: the student concludes the app is
/// broken rather than that the option does not exist.
class SocialAuthService {
  SocialAuthService();

  bool _googleInitialised = false;

  /// Whether to render the Google button at all.
  ///
  /// The client id is compiled in via `--dart-define=GOOGLE_SERVER_CLIENT_ID`.
  /// Empty means the server has no matching OAuth client either, since the two
  /// are provisioned together.
  bool get googleAvailable => AppEnvironment.googleServerClientId.isNotEmpty;

  /// Sign in with Apple is iOS-only here.
  ///
  /// It exists on Android through a web redirect, but that path needs a
  /// `redirectUri` on a domain listed in the Apple developer console AND a
  /// Services ID — neither of which exists. And Apple's own rule (App Store
  /// guideline 4.8) only requires the button where another third-party sign-in
  /// is offered, which is on iOS.
  bool get appleAvailable =>
      Platform.isIOS && AppEnvironment.appleServiceId.isNotEmpty;

  /// ⚠️ `serverClientId`, and specifically the WEB client id.
  ///
  /// Google mints a different OAuth client per platform, and by default the
  /// native SDK returns an ID token whose `aud` is the iOS or Android client.
  /// better-auth verifies `aud` against the single `GOOGLE_CLIENT_ID` the
  /// server holds — the web one — so a token minted for the platform client is
  /// rejected with `INVALID_TOKEN`, which reaches the app as a generic sign-in
  /// failure and is close to undiagnosable from this side.
  ///
  /// Passing the web client id as `serverClientId` is what makes the SDK put it
  /// in `aud`. It also means ZERO backend change is needed to accept mobile
  /// sign-ins once the OAuth client exists.
  Future<void> _ensureGoogleInitialised() async {
    if (_googleInitialised) return;
    await GoogleSignIn.instance.initialize(
      serverClientId: AppEnvironment.googleServerClientId,
    );
    _googleInitialised = true;
  }

  Future<Either<Failure, SocialCredential>> google() async {
    if (!googleAvailable) {
      return Left(
        ValidationFailure(tr(CopyKeys.authErrorsSocialGeneric), code: 'PROVIDER_NOT_CONFIGURED'),
      );
    }

    try {
      await _ensureGoogleInitialised();
      final account = await GoogleSignIn.instance.authenticate();
      final idToken = account.authentication.idToken;

      if (idToken == null || idToken.isEmpty) {
        // Happens when the Play Services account has no verified email, and on
        // an emulator without Play Services. There is nothing to send, and
        // sending an empty token would earn a 401 the student cannot read.
        return Left(
          ValidationFailure(tr(CopyKeys.authErrorsSocialGeneric), code: 'NO_ID_TOKEN'),
        );
      }

      return Right(SocialCredential(idToken: idToken));
    } on GoogleSignInException catch (error) {
      if (error.code == GoogleSignInExceptionCode.canceled) {
        // The student closed the sheet. Silent — see CancelledFailure.
        return const Left(CancelledFailure());
      }
      return Left(
        ValidationFailure(tr(CopyKeys.authErrorsSocialGeneric), code: error.code.name),
      );
    } catch (_) {
      return Left(
        ValidationFailure(tr(CopyKeys.authErrorsSocialGeneric), code: 'GOOGLE_SDK'),
      );
    }
  }

  Future<Either<Failure, SocialCredential>> apple() async {
    if (!appleAvailable) {
      return Left(
        ValidationFailure(tr(CopyKeys.authErrorsSocialGeneric), code: 'PROVIDER_NOT_CONFIGURED'),
      );
    }

    // ⚠️ The nonce is sent to Apple HASHED and to the server RAW.
    //
    // Apple embeds the SHA-256 it was given as the token's `nonce` claim;
    // better-auth hashes the raw value it receives and compares. Send the same
    // form to both and verification fails — a replay defence that looks exactly
    // like a wrong client id.
    final rawNonce = _nonce();

    try {
      final credential = await SignInWithApple.getAppleIDCredential(
        scopes: const [
          AppleIDAuthorizationScopes.email,
          AppleIDAuthorizationScopes.fullName,
        ],
        nonce: sha256.convert(utf8.encode(rawNonce)).toString(),
      );

      final idToken = credential.identityToken;
      if (idToken == null || idToken.isEmpty) {
        return Left(
          ValidationFailure(tr(CopyKeys.authErrorsSocialGeneric), code: 'NO_ID_TOKEN'),
        );
      }

      // Apple sends the name on the FIRST authorisation only, and never again
      // for that Apple ID — not after a re-install, not on a new device. If it
      // is dropped here the account is created with an empty name and nothing
      // can recover it.
      final givenName = credential.givenName;
      final familyName = credential.familyName;
      final hasName = (givenName?.isNotEmpty ?? false) || (familyName?.isNotEmpty ?? false);

      return Right(
        SocialCredential(
          idToken: idToken,
          nonce: rawNonce,
          fullName: hasName
              ? {
                  'name': {
                    'firstName': givenName ?? '',
                    'lastName': familyName ?? '',
                  },
                  if (credential.email != null) 'email': credential.email,
                }
              : null,
        ),
      );
    } on SignInWithAppleAuthorizationException catch (error) {
      if (error.code == AuthorizationErrorCode.canceled) {
        return const Left(CancelledFailure());
      }
      return Left(
        ValidationFailure(tr(CopyKeys.authErrorsSocialGeneric), code: error.code.name),
      );
    } catch (_) {
      return Left(
        ValidationFailure(tr(CopyKeys.authErrorsSocialGeneric), code: 'APPLE_SDK'),
      );
    }
  }

  /// Signs the student out of the provider SDK too.
  ///
  /// Without this, the next «كمّل بحساب جوجل» silently reuses the previously
  /// chosen account with no picker — which is the wrong behaviour on a shared
  /// phone, and this product runs on plenty of shared phones.
  Future<void> signOut() async {
    if (_googleInitialised) {
      await GoogleSignIn.instance.signOut();
    }
    // Apple has no sign-out: the authorisation lives in the system Settings
    // app, and there is no API to revoke it from here.
  }

  /// A cryptographically random nonce.
  ///
  /// `Random.secure()`, never `Random()` — the whole point of the value is that
  /// an attacker cannot predict it, and the default generator is seeded
  /// predictably enough to make a replay feasible.
  String _nonce([int length = 32]) {
    const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';
    final random = Random.secure();
    return List.generate(length, (_) => charset[random.nextInt(charset.length)]).join();
  }
}
