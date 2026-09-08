import 'package:dio/dio.dart';
import 'package:pretty_dio_logger/pretty_dio_logger.dart';

import '../../config/app_environment.dart';
import '../../services/storage_service/secure_store.dart';
import '../exception/failure.dart';
import 'api_error_mapper.dart';
import 'interceptors/auth_interceptor.dart';
import 'interceptors/csrf_interceptor.dart';

/// The single HTTP client. Every data source takes this, never a bare [Dio].
///
/// It exists to make three things impossible rather than merely discouraged:
/// forgetting the CSRF header on a write, letting a `DioException` escape into
/// a cubit, and having two places that decide what a 401 means.
class ApiClient {
  ApiClient(this._dio);

  final Dio _dio;

  /// Exposed for the few things that genuinely need the raw client — a
  /// download with a progress callback, a `CancelToken` on a long upload.
  /// Reaching for it to make an ordinary request bypasses the error mapping.
  Dio get raw => _dio;

  factory ApiClient.create({
    required SecureStore store,
    required Future<void> Function() onUnauthorized,
  }) {
    final dio = Dio(
      BaseOptions(
        baseUrl: AppEnvironment.apiBaseUrl,
        connectTimeout: AppEnvironment.connectTimeout,
        receiveTimeout: AppEnvironment.receiveTimeout,
        // The API only parses `application/json` by default — `bodyParser` is
        // disabled at bootstrap and better-auth installs the JSON parser for
        // everything else. A request sent as form-urlencoded arrives with an
        // empty body and fails validation for reasons the error never explains.
        contentType: Headers.jsonContentType,
        responseType: ResponseType.json,
        // Dio's default treats anything outside 2xx as an exception, which is
        // what we want — the mapper turns it into a Failure. Stated explicitly
        // because a `validateStatus: (_) => true` is a common "fix" that
        // silently routes every 500 into the success path.
        validateStatus: (status) => status != null && status >= 200 && status < 300,
      ),
    );

    dio.interceptors.add(CsrfInterceptor());
    dio.interceptors.add(AuthInterceptor(store, onUnauthorized: onUnauthorized));

    if (AppEnvironment.verboseNetworkLogs) {
      // Last, so it prints the headers the interceptors above actually added.
      dio.interceptors.add(
        PrettyDioLogger(
          requestHeader: true,
          requestBody: true,
          responseHeader: false,
          responseBody: true,
          // A lesson outline or a question bank page is thousands of
          // characters; printing it in full pushes everything else out of the
          // console scrollback.
          maxWidth: 120,
        ),
      );
    }

    return ApiClient(dio);
  }

  Future<Result<T>> get<T>(
    String path, {
    Map<String, dynamic>? query,
    T Function(dynamic data)? parse,
    CancelToken? cancelToken,
  }) {
    return _send(
      () => _dio.get<dynamic>(path, queryParameters: query, cancelToken: cancelToken),
      parse,
    );
  }

  Future<Result<T>> post<T>(
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    T Function(dynamic data)? parse,
    CancelToken? cancelToken,
    Duration? timeout,
  }) {
    return _send(
      () => _dio.post<dynamic>(
        path,
        data: body,
        queryParameters: query,
        cancelToken: cancelToken,
        options: timeout == null ? null : Options(receiveTimeout: timeout, sendTimeout: timeout),
      ),
      parse,
    );
  }

  Future<Result<T>> patch<T>(
    String path, {
    Object? body,
    T Function(dynamic data)? parse,
    CancelToken? cancelToken,
  }) {
    return _send(
      () => _dio.patch<dynamic>(path, data: body, cancelToken: cancelToken),
      parse,
    );
  }

  Future<Result<T>> put<T>(
    String path, {
    Object? body,
    T Function(dynamic data)? parse,
    CancelToken? cancelToken,
  }) {
    return _send(() => _dio.put<dynamic>(path, data: body, cancelToken: cancelToken), parse);
  }

  Future<Result<T>> delete<T>(
    String path, {
    Object? body,
    T Function(dynamic data)? parse,
    CancelToken? cancelToken,
  }) {
    return _send(
      () => _dio.delete<dynamic>(path, data: body, cancelToken: cancelToken),
      parse,
    );
  }

  /// A multipart upload — a homework photo, a chat attachment, a voice note.
  ///
  /// Gets [AppEnvironment.uploadTimeout] rather than the default receive
  /// timeout: a two-minute voice note on an EDGE uplink genuinely takes
  /// minutes, and failing it at 45 seconds loses recorded audio the student
  /// cannot re-record.
  Future<Result<T>> upload<T>(
    String path, {
    required FormData form,
    T Function(dynamic data)? parse,
    CancelToken? cancelToken,
    void Function(int sent, int total)? onProgress,
  }) {
    return _send(
      () => _dio.post<dynamic>(
        path,
        data: form,
        cancelToken: cancelToken,
        onSendProgress: onProgress,
        options: Options(
          sendTimeout: AppEnvironment.uploadTimeout,
          receiveTimeout: AppEnvironment.uploadTimeout,
          contentType: Headers.multipartFormDataContentType,
        ),
      ),
      parse,
    );
  }

  Future<Result<T>> _send<T>(
    Future<Response<dynamic>> Function() request,
    T Function(dynamic data)? parse,
  ) async {
    try {
      final response = await request();
      if (parse == null) return Result.ok(response.data as T);
      try {
        return Result.ok(parse(response.data));
      } catch (error, stack) {
        // ⚠️ A parse failure is REPORTED, never swallowed into an empty list.
        //
        // This is how the app finds out the API shipped a shape it does not
        // know about. Treating it as "no data" hides a broken release behind
        // an empty state that looks like a legitimate one, and the report
        // that reaches us is «الصفحة فاضية» — indistinguishable from a student
        // who genuinely has no courses.
        return Result.fail(
          ParseFailure('$error', code: 'parse'),
          cause: error,
          stack: stack,
        );
      }
    } on DioException catch (error, stack) {
      return Result.fail(ApiErrorMapper.map(error), cause: error, stack: stack);
    }
  }
}

/// What every [ApiClient] call returns.
///
/// Deliberately NOT `Either<Failure, T>` at this layer: `dartz`'s `Either` is
/// the repository's vocabulary, and the extra [cause]/[stack] carried here are
/// for the diagnostics reporter, not for the UI. Repositories fold this into
/// an `Either` and the debugging detail stops at that boundary.
class Result<T> {
  const Result.ok(T value) : _value = value, failure = null, cause = null, stack = null;

  const Result.fail(Failure this.failure, {this.cause, this.stack}) : _value = null;

  final T? _value;
  final Failure? failure;
  final Object? cause;
  final StackTrace? stack;

  bool get isOk => failure == null;

  /// Only valid when [isOk]. Throws rather than returning null so a missed
  /// check is a loud crash in a test instead of a null on a screen.
  T get value {
    if (failure != null) {
      throw StateError('Result.value read on a failed result: $failure');
    }
    return _value as T;
  }
}
