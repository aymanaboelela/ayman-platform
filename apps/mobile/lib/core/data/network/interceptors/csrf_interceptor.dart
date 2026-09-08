import 'package:dio/dio.dart';
import 'package:uuid/uuid.dart';

import '../api_headers.dart';

/// Satisfies `CsrfGuard` and stamps every request with a traceable id.
///
/// Two jobs in one interceptor because both are "headers every request needs
/// and no caller should have to remember".
class CsrfInterceptor extends Interceptor {
  CsrfInterceptor({Uuid? uuid}) : _uuid = uuid ?? const Uuid();

  final Uuid _uuid;

  /// The methods `CsrfGuard` actually checks. GET/HEAD/OPTIONS are waved
  /// through, and sending the header on them is harmless but noisy.
  static const _stateChanging = {'POST', 'PUT', 'PATCH', 'DELETE'};

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (_stateChanging.contains(options.method.toUpperCase())) {
      // ⚠️ Not conditional on the path. `/api/auth/**` bypasses `CsrfGuard`
      // entirely, so the header is unnecessary there — but better-auth ignores
      // unknown headers, and a path-based exemption is one refactor away from
      // exempting a route that needed it. Always sending it is strictly safer
      // than being clever about when not to.
      options.headers[ApiHeaders.csrfToken] = ApiHeaders.csrfTokenValue;
    }

    // v4, not v7: this id is only ever compared for equality when joining a
    // student's report to a log line, and the API generates a v4 itself when
    // the header is absent. Matching it keeps the two indistinguishable in the
    // logs.
    options.headers[ApiHeaders.requestId] ??= _uuid.v4();

    handler.next(options);
  }
}
