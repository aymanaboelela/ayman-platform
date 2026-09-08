import 'package:equatable/equatable.dart';

/// The left side of every `Either<Failure, T>` a repository returns.
///
/// A failure is something the UI can ACT on: show a message, offer a retry,
/// send the student to sign-in. It is never a stack trace or a Dio object —
/// those are logged at the data-source boundary and stop there.
///
/// The `message` is already in Arabic and already safe to show. Resolving the
/// wording is the data layer's job, not the widget's, because the same HTTP
/// status means different things on different endpoints and only the data
/// layer knows which endpoint it called.
sealed class Failure extends Equatable {
  const Failure(this.message, {this.code, this.statusCode});

  /// Arabic, student-facing, already final.
  final String message;

  /// The API's machine-readable reason, when it sent one.
  ///
  /// `apps/api/src/common/filters/all-exceptions.filter.ts` puts this in the
  /// body as `code`. It is the ONLY structured detail that crosses the wire —
  /// the rest of an exception's payload is deliberately discarded server-side
  /// — so anything the UI needs to branch on has to arrive here or inside a
  /// 200 body.
  final String? code;

  final int? statusCode;

  @override
  List<Object?> get props => [message, code, statusCode];

  @override
  String toString() => '$runtimeType($statusCode, $code): $message';
}

/// The request reached the server and the server said no.
class ServerFailure extends Failure {
  const ServerFailure(super.message, {super.code, super.statusCode});
}

/// 401 — the session is gone: revoked from «أجهزتي», expired after 90 days, or
/// the account was deleted.
///
/// Its own type because it is the one failure with a side effect: whoever
/// observes it must clear the stored token and route to sign-in. A screen that
/// merely printed the message would leave the app in a state where every
/// subsequent request also 401s.
class UnauthorizedFailure extends Failure {
  const UnauthorizedFailure(super.message, {super.code, super.statusCode = 401});
}

/// 403 — signed in, but not allowed. A student reaching an admin route, a
/// locked lesson, a quiz outside its window.
class ForbiddenFailure extends Failure {
  const ForbiddenFailure(super.message, {super.code, super.statusCode = 403});
}

/// 404 — including a malformed id, which the API deliberately answers the same
/// way as an id that matches nothing.
class NotFoundFailure extends Failure {
  const NotFoundFailure(super.message, {super.code, super.statusCode = 404});
}

/// 409 — someone else changed it first. The attempt was submitted on another
/// device, the row moved, the version is stale.
class ConflictFailure extends Failure {
  const ConflictFailure(super.message, {super.code, super.statusCode = 409});
}

/// 400/422 — the request was wrong.
///
/// [fieldErrors] is populated only where the endpoint reports per-field
/// detail. Most do not: the API's exception filter reduces a Zod failure to
/// the string `"Validation failed"`, so a form usually gets one message for
/// the whole submission rather than a mark against the offending input.
class ValidationFailure extends Failure {
  const ValidationFailure(
    super.message, {
    super.code,
    super.statusCode = 400,
    this.fieldErrors = const {},
  });

  final Map<String, String> fieldErrors;

  @override
  List<Object?> get props => [...super.props, fieldErrors];
}

/// 429 — the throttler.
///
/// [retryAfter] comes from the `Retry-After` header when the server sends one.
/// The UI waits rather than hammering: the limits are 10/s, 60/min and
/// 1000/hour per session, and a retry loop that ignores this turns a brief
/// stall into a lockout.
class RateLimitFailure extends Failure {
  const RateLimitFailure(super.message, {super.code, super.statusCode = 429, this.retryAfter});

  final Duration? retryAfter;

  @override
  List<Object?> get props => [...super.props, retryAfter];
}

/// The request never got an answer: no route to host, DNS failure, timeout,
/// aeroplane mode.
///
/// Distinct from [ServerFailure] because it is the only one where "try again"
/// is honest advice, and the only one where a cached copy should be shown
/// instead of an error.
class NetworkFailure extends Failure {
  const NetworkFailure(super.message, {super.code});
}

/// The server answered, and the answer did not match the contract.
///
/// A missing required field, a string where a number was promised, an enum
/// value the app has never heard of. Surfaced rather than swallowed: this is
/// how a mobile app finds out the API shipped a change it does not know about,
/// and silently treating it as an empty list is how that goes unnoticed for a
/// release cycle.
class ParseFailure extends Failure {
  const ParseFailure(super.message, {super.code});
}

/// Reading or writing the device's own storage failed.
class CacheFailure extends Failure {
  const CacheFailure(super.message, {super.code});
}

/// The student stopped it themselves — cancelled an upload, backed out of a
/// screen mid-request.
///
/// Its own type so the UI can stay silent. Showing «حصلت مشكلة» because
/// somebody pressed Back is the most common way a Flutter app looks broken.
class CancelledFailure extends Failure {
  const CancelledFailure([super.message = '']);
}

/// The device refused: no camera, no microphone, no notifications.
///
/// [permanentlyDenied] separates "ask again" from "the OS will not ask again,
/// send them to Settings" — on iOS a second request after a refusal returns
/// instantly with no prompt, which looks exactly like the button doing nothing.
class PermissionFailure extends Failure {
  const PermissionFailure(super.message, {this.permanentlyDenied = false});

  final bool permanentlyDenied;

  @override
  List<Object?> get props => [...super.props, permanentlyDenied];
}
