import 'dart:io';

import 'package:dio/dio.dart';
import 'package:easy_localization/easy_localization.dart';

import '../../localization/copy_keys.dart';
import '../exception/failure.dart';

/// Turns a [DioException] into the one [Failure] the UI should act on.
///
/// This is the ONLY place an HTTP status becomes Arabic. Doing it here rather
/// than in each cubit is what stops the app from growing five slightly
/// different ways of saying «حصلت مشكلة» — the copy is authored once in
/// `packages/contracts/src/copy/ar.ts` and reaches both apps through the
/// generated bundle.
abstract final class ApiErrorMapper {
  static Failure map(DioException error) {
    switch (error.type) {
      case DioExceptionType.cancel:
        // Silent on purpose: the student pressed Back or cancelled an upload.
        // Showing an error because somebody navigated away is the commonest
        // way a Flutter app looks broken.
        return const CancelledFailure();

      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return NetworkFailure(tr(CopyKeys.offlineBody), code: 'timeout');

      case DioExceptionType.connectionError:
        return NetworkFailure(tr(CopyKeys.offlineBody), code: 'offline');

      case DioExceptionType.badCertificate:
        // Never softened into a retry. A bad certificate on a domain the app
        // pins to is either a misconfigured origin or someone sitting between
        // the student and it, and both deserve a hard stop.
        return NetworkFailure(tr(CopyKeys.commonError), code: 'bad_certificate');

      case DioExceptionType.unknown:
        if (error.error is SocketException) {
          return NetworkFailure(tr(CopyKeys.offlineBody), code: 'offline');
        }
        return ServerFailure(tr(CopyKeys.commonError), code: 'unknown');

      case DioExceptionType.badResponse:
        return _fromResponse(error.response);
    }
  }

  static Failure _fromResponse(Response<dynamic>? response) {
    final status = response?.statusCode ?? 0;
    final body = response?.data;

    // Every error body from this API has the same shape:
    // `{ statusCode, message, code?, requestId, timestamp }` — see
    // `apps/api/src/common/filters/all-exceptions.filter.ts`.
    final map = body is Map ? body : const {};
    final code = map['code'] is String ? map['code'] as String : null;
    final rawMessage = map['message'] is String ? map['message'] as String : null;

    // ⚠️ The server's `message` is only shown when it is ARABIC.
    //
    // Most of them are: the services throw student-facing strings on purpose.
    // But the generic ones are Nest's own derived names — "Forbidden
    // Exception", "Not Found" — and a few are developer text like
    // "invalid list query". Putting those in front of a student is worse than
    // a generic Arabic sentence, so the heuristic is deliberately crude and
    // deliberately biased towards the safe answer.
    final message = _isArabic(rawMessage) ? rawMessage! : null;

    return switch (status) {
      400 || 422 => ValidationFailure(
        message ?? tr(CopyKeys.commonError),
        code: code,
        statusCode: status,
      ),
      401 => UnauthorizedFailure(message ?? tr(CopyKeys.commonError), code: code),
      403 => ForbiddenFailure(message ?? tr(CopyKeys.commonError), code: code),
      404 => NotFoundFailure(message ?? tr(CopyKeys.commonError), code: code),
      409 => ConflictFailure(message ?? tr(CopyKeys.commonError), code: code),
      429 => RateLimitFailure(
        message ?? tr(CopyKeys.commonError),
        code: code,
        retryAfter: _retryAfter(response),
      ),
      // 5xx and anything unrecognised. `offline.serverBody` is the one that says
      // «نتك شغال — المشكلة عندنا إحنا», which is both true and the thing that
      // stops a student rebooting their router.
      >= 500 => ServerFailure(tr(CopyKeys.offlineServerBody), code: code, statusCode: status),
      _ => ServerFailure(message ?? tr(CopyKeys.commonError), code: code, statusCode: status),
    };
  }

  /// `Retry-After` is either delta-seconds or an HTTP-date (RFC 9110 §10.2.3).
  /// `@nestjs/throttler` sends seconds, but parsing both costs four lines and
  /// removes a whole class of "why is the retry immediate" bug.
  static Duration? _retryAfter(Response<dynamic>? response) {
    final raw = response?.headers.value('retry-after');
    if (raw == null || raw.isEmpty) return null;

    final seconds = int.tryParse(raw.trim());
    if (seconds != null) return Duration(seconds: seconds);

    final until = HttpDate.parse(raw);
    final delta = until.difference(DateTime.now());
    return delta.isNegative ? Duration.zero : delta;
  }

  /// Whether a string contains Arabic script.
  ///
  /// U+0600–U+06FF is the Arabic block; the two supplements and Arabic
  /// Presentation Forms are not checked because nothing in this product's copy
  /// uses them. One Arabic character is enough — a message like
  /// «الامتحان قفل» is unambiguous, and a mixed string with a course code in
  /// Latin still reads as Arabic.
  static bool _isArabic(String? value) {
    if (value == null || value.isEmpty) return false;
    return RegExp(r'[؀-ۿ]').hasMatch(value);
  }
}
