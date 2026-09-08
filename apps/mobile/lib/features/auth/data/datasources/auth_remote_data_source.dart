import '../../../../core/data/network/api_client.dart';
import '../../../../core/functions/egyptian_phone.dart';
import '../../domain/entities/session_user.dart';
import '../models/session_user_model.dart';

/// Every auth call the app makes, and nothing else.
///
/// ## Why `/api/auth/**` is different from the rest of the API
///
/// better-auth is mounted as raw middleware BEFORE Nest's guards, so these
/// routes see none of the app's own protections: no `AuthGuard`, no
/// `CsrfGuard`, no throttler. They have their own origin and form-CSRF checks
/// instead, and those are gated on the request carrying a `Cookie` header — a
/// native client sends none, so they never fire. Every practical consequence of
/// that is written up in `lib/core/data/network/api_headers.dart`.
class AuthRemoteDataSource {
  const AuthRemoteDataSource(this._client);

  final ApiClient _client;

  /// Who is signed in, plus the permission list.
  ///
  /// `/api/session`, NOT better-auth's `/api/auth/get-session`. The latter
  /// returns more of the user row but no permissions, so the app would need a
  /// second round trip before it could decide whether to render one admin
  /// link. On a cold start over EDGE that is a visible second of chrome
  /// flicker.
  ///
  /// 401 when anonymous — a real answer, not an error to retry.
  Future<Result<SessionUser>> session() {
    return _client.get<SessionUser>(
      '/session',
      parse: (data) => SessionUserMapper.fromJson(data as Map<String, dynamic>),
    );
  }

  /// Sign in with whatever the student typed in the one identifier field.
  ///
  /// There are TWO endpoints behind this and the client picks between them —
  /// see [EgyptianPhone.resolveLoginIdentifier] for why the `@` test has to run
  /// before the phone test, and why unparseable input goes to the email
  /// endpoint on purpose.
  ///
  /// Both return `{ token, user }`. The token is the 90-day session credential;
  /// [AuthInterceptor] also picks it up from the `set-auth-token` response
  /// header, but it is read from the body here too because that header only
  /// appears once the bearer plugin is deployed and a mismatch between app and
  /// server versions must not lose the session.
  Future<Result<String>> signIn({
    required String identifier,
    required String password,
  }) {
    final resolved = EgyptianPhone.resolveLoginIdentifier(identifier);

    final (path, body) = switch (resolved.kind) {
      LoginIdentifierKind.phone => (
        '/auth/sign-in/phone-number',
        {'phoneNumber': resolved.value, 'password': password},
      ),
      LoginIdentifierKind.email => (
        '/auth/sign-in/email',
        {'email': resolved.value, 'password': password},
      ),
    };

    return _client.post<String>(
      path,
      body: body,
      parse: (data) => (data as Map<String, dynamic>)['token'] as String,
    );
  }

  /// Create the account.
  ///
  /// ⚠️ `/auth/sign-up/email` even though the student signs up with a PHONE.
  ///
  /// There is one registration path and it is the email one, because
  /// better-auth's phone plugin has no sign-up route that takes a password —
  /// its flow is OTP, and this deployment can send no messages at all (no SMS
  /// provider, no WhatsApp Business credentials, no mail). The server's
  /// `createAuthBeforeHook` mints a `…@phone.invalid` placeholder email to
  /// satisfy better-auth's `z.email()` route validator and then strips it back
  /// to NULL before the row is written, so the placeholder never exists
  /// anywhere the app can see it — and the app must NOT send one itself.
  ///
  /// [phoneNumber] must already be E.164 — the caller normalises, exactly as
  /// the web's `RegisterSchema` transforms before it sends. The server
  /// normalises again and rejects a malformed one with a 400 carrying
  /// `code: 'INVALID_PHONE_NUMBER'`, but by then the student has already
  /// pressed the button and read a failure.
  ///
  /// ⚠️ [email] is OMITTED ENTIRELY when the student gave none — not sent as
  /// `null`, not sent as `''`. better-auth's own route schema types it as
  /// `z.email()`, so an empty string is a validation failure and a null is a
  /// type error; the placeholder that makes the field satisfiable is minted
  /// SERVER-side and stripped again before the row is written.
  Future<Result<String>> signUp({
    required String name,
    required String phoneNumber,
    required String password,
    String? email,
  }) {
    final trimmedEmail = email?.trim();

    return _client.post<String>(
      '/auth/sign-up/email',
      body: {
        'name': name.trim(),
        'phoneNumber': phoneNumber,
        'password': password,
        if (trimmedEmail != null && trimmedEmail.isNotEmpty) 'email': trimmedEmail,
      },
      parse: (data) => (data as Map<String, dynamic>)['token'] as String,
    );
  }

  /// Native Google / Apple sign-in.
  ///
  /// The `idToken` branch of `/auth/sign-in/social`, which exists precisely so
  /// a native client never has to run a browser redirect. The server verifies
  /// the token's signature and its `aud` claim against the configured
  /// `GOOGLE_CLIENT_ID` — which is why the app asks the Google SDK for a token
  /// minted for the WEB client id (`serverClientId`), not the platform one.
  ///
  /// [nonce] must be the same value that was used to request the token, or
  /// verification fails with `INVALID_TOKEN` — which surfaces as a generic
  /// sign-in failure and is almost impossible to diagnose from the app side.
  Future<Result<String>> signInWithIdToken({
    required String provider,
    required String idToken,
    String? nonce,
    String? accessToken,
    Map<String, dynamic>? user,
  }) {
    return _client.post<String>(
      '/auth/sign-in/social',
      body: {
        'provider': provider,
        'idToken': {
          'token': idToken,
          'nonce': ?nonce,
          'accessToken': ?accessToken,
          // Apple sends the name ONCE, on the very first authorisation, and
          // never again. If it is not forwarded now the account is created
          // with an empty name and there is no way to recover it from Apple.
          'user': ?user,
        },
      },
      parse: (data) => (data as Map<String, dynamic>)['token'] as String,
    );
  }

  /// End the session server-side.
  ///
  /// Best-effort by design: the caller clears local state whether or not this
  /// succeeds. A sign-out that failed because the student is on a train with no
  /// signal must still sign them out of the phone in their hand — the server
  /// session then expires on its own, and «أجهزتي» can revoke it explicitly.
  Future<Result<void>> signOut() {
    return _client.post<void>('/auth/sign-out');
  }
}
