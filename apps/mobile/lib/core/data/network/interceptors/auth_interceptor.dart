import 'package:dio/dio.dart';

import '../../../services/storage_service/secure_store.dart';
import '../api_headers.dart';

/// Attaches the session to every outgoing request, and harvests a new one from
/// every response that mints it.
///
/// The token is read from the Keychain per request rather than cached in a
/// field. That costs a platform-channel hop, and buys the property that a
/// sign-out in one part of the app takes effect on the very next request from
/// every other part — including one already queued behind a slow upload. A
/// cached field would let an in-flight screen keep using a credential the
/// student has just revoked.
class AuthInterceptor extends Interceptor {
  AuthInterceptor(this._store, {required this.onUnauthorized});

  final SecureStore _store;

  /// Called when the server says the session is gone.
  ///
  /// The interceptor deliberately does NOT navigate: routing is not the
  /// network layer's job, and a redirect fired from here would fight whatever
  /// the screen was doing. It clears the token and reports; the app shell
  /// listens and decides.
  final Future<void> Function() onUnauthorized;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await _store.readSessionToken();
    if (token != null && token.isNotEmpty) {
      options.headers[ApiHeaders.authorization] = 'Bearer $token';
    }

    // Belt and braces against a header that would break auth entirely — see
    // the note on `ApiHeaders.forbidden`. Nothing in the app sets these
    // today, and this is what keeps it that way when someone copies a curl
    // command out of a browser's devtools.
    for (final name in ApiHeaders.forbidden) {
      options.headers.remove(name);
      options.headers.remove(name.toLowerCase());
    }

    handler.next(options);
  }

  @override
  Future<void> onResponse(
    Response<dynamic> response,
    ResponseInterceptorHandler handler,
  ) async {
    // better-auth's bearer plugin emits `set-auth-token` on ANY response that
    // would have set the session cookie — which includes the rolling refresh
    // (`session.updateAge` is one day), not just sign-in. Persisting it here
    // rather than only in the auth repository is what keeps a 90-day session
    // alive for a student who never signs out.
    final minted = response.headers.value(ApiHeaders.setAuthToken);
    if (minted != null && minted.isNotEmpty) {
      await _store.writeSessionToken(minted);
    }
    handler.next(response);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    if (err.response?.statusCode == 401) {
      // 401 from this API means the session row is gone: revoked from
      // «أجهزتي», expired, or the account was deleted. There is no refresh
      // token to exchange — better-auth's session is the credential — so the
      // only correct action is to drop it. Keeping it would make every
      // subsequent request 401 too, and the app would look like it was
      // "loading" forever.
      await _store.clearSession();
      await onUnauthorized();
    }
    handler.next(err);
  }
}
