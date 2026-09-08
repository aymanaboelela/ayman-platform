/// The header names the API actually looks at, and what a NATIVE client must
/// put in them.
///
/// Everything here was read out of `apps/api/src/modules/security/csrf.guard.ts`
/// and better-auth's `origin-check.mjs`. It is written down in one place
/// because the rules are the opposite of what a web developer expects: the
/// safest thing a native client can do is send FEWER headers, not more.
abstract final class ApiHeaders {
  /// The bearer credential. Only present once signed in.
  static const authorization = 'Authorization';

  /// The token better-auth hands back on the response of any request that
  /// establishes a session. The app stores this, not a cookie.
  static const setAuthToken = 'set-auth-token';

  /// ⚠️ REQUIRED on every POST/PUT/PATCH/DELETE outside `/api/auth/**`, and
  /// its VALUE IS NEVER CHECKED.
  ///
  /// `CsrfGuard` rejects a state-changing request whose `x-csrf-token` header
  /// is missing or empty with `403 "CSRF: missing x-csrf-token header"`. It
  /// never compares the value to anything — presence is the entire control,
  /// because the real defence is the `Origin` and `Sec-Fetch-Site` checks
  /// beside it, and those only mean something for a browser.
  ///
  /// The web mints a random UUID into a `__Host-csrf` cookie and echoes it, so
  /// that the check *can* be tightened into a real double-submit later without
  /// a client change. A native app has no cookie to echo, so it sends a
  /// constant — and would keep working unchanged if the server started
  /// validating, because at that point it would also have to hand native
  /// clients a token to echo.
  static const csrfToken = 'x-csrf-token';

  /// Any non-empty string satisfies the guard. Spelled as something a person
  /// reading an access log can recognise rather than a random value, since it
  /// carries no entropy requirement at all.
  static const csrfTokenValue = 'mobile';

  /// Echoed back in every error body as `requestId`, and logged server-side.
  ///
  /// The app generates one per request so a student's report («الامتحان وقف»)
  /// can be joined to the exact server-side log line, which is otherwise
  /// impossible: the API's error responses never carry a stack and the
  /// diagnostics module only records what the client explicitly reports.
  static const requestId = 'x-request-id';

  /// ⚠️ Headers a native client MUST NOT send, and why.
  ///
  /// - `Origin` — `CsrfGuard` 403s anything whose Origin is not exactly
  ///   `APP_URL`, and better-auth's `trustedOrigins` does the same for
  ///   `/api/auth/**`. An ABSENT Origin is explicitly accepted by both. Dio
  ///   does not add one on mobile; this note exists so nobody "fixes" a
  ///   phantom CORS problem by adding it.
  /// - `Cookie` — better-auth's `validateOrigin` is gated on
  ///   `useCookies = headers.has('cookie')`. Send even one cookie and the
  ///   origin check switches on, at which point the absent Origin becomes
  ///   `MISSING_OR_NULL_ORIGIN` and every auth call 403s.
  /// - `Sec-Fetch-Site` — a browser header. `CsrfGuard` rejects any value
  ///   other than `same-origin`/`none`, and native clients have no business
  ///   claiming to be a browser.
  static const forbidden = <String>['Origin', 'Cookie', 'Sec-Fetch-Site', 'Referer'];
}
