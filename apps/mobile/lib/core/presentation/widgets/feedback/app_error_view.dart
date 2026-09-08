import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../data/exception/failure.dart';
import '../../../localization/copy_keys.dart';
import '../buttons/app_button.dart';
import 'app_empty_state.dart';

/// What a screen shows instead of its content when the load failed.
///
/// It reads the [Failure] and decides three things the caller should not have
/// to: which sentence, whether «نحاول تاني» is honest, and whether to draw
/// anything at all.
///
/// ## The three answers
///
/// * [NetworkFailure] — «مفيش نت دلوقتي». The phone never reached us, so the
///   only true statement is about the connection and the only useful button is
///   a retry.
/// * A 5xx [ServerFailure] — «المنصة مش راضية ترد دلوقتي» / «نتك شغال —
///   المشكلة عندنا إحنا». Naming whose fault it is matters: a student staring
///   at «حصلت مشكلة» during a two-minute deploy assumes their phone, their
///   connection or their account is broken, and the copy exists to say it is
///   none of those and it comes back by itself.
/// * Anything else — «حصلت مشكلة» plus the failure's OWN message, which the
///   data layer already resolved into Arabic for that specific endpoint.
///
/// ## [CancelledFailure] paints nothing
///
/// The student pressed Back or cancelled an upload. Rendering an error panel
/// because somebody navigated away is the single commonest way a Flutter app
/// looks broken, and it happens on every screen at once, so the check lives
/// here rather than in each cubit.
///
/// ## Why it is painted as an empty state and not in red
///
/// It composes [AppEmptyState], so a failed load and an empty list are the
/// same object in the same place — which is honest, because from where the
/// student sits both are "this screen has nothing on it yet". A red-tinted
/// panel would rank «المنصة بتتحدث دلوقتي» alongside a wrong answer in the
/// quiz runner, and red in this product means an answer was wrong. The
/// severity lives in the words.
///
/// ## Why most failures get no retry button
///
/// A retry is offered only where pressing it can plausibly change the answer.
/// A 404 will still be a 404; a 403 will still be a 403; a 401 needs a route
/// to sign-in, not a button. [RateLimitFailure] is the pointed one — the
/// throttler allows 10/s, 60/min and 1000/hour per session, and a retry button
/// under a 429 invites exactly the tapping that turns a two-second stall into
/// a lockout. Those cases get the sentence and no button; a screen that has
/// somewhere better to send the student passes [onRetry] as null and offers
/// its own way out.
class AppErrorView extends StatelessWidget {
  const AppErrorView({required this.failure, this.onRetry, this.compact = false, super.key});

  final Failure failure;

  /// Re-runs the load. Null means the caller has no retry to offer, and then
  /// no retry is drawn even for a network failure.
  final VoidCallback? onRetry;

  /// For an error inside a card or a section rather than in place of a whole
  /// route. See [AppEmptyState.compact].
  final bool compact;

  @override
  Widget build(BuildContext context) {
    if (failure is CancelledFailure) return const SizedBox.shrink();

    final (IconData icon, String title, String? body, bool retryable) = switch (failure) {
      NetworkFailure() => (
        Icons.wifi_off_outlined,
        tr(CopyKeys.offlineTitle),
        tr(CopyKeys.offlineBody),
        true,
      ),
      // The status is nullable because a failure can be synthesised without
      // one; treating an unknown status as 5xx would promise a retry the
      // situation may not deserve, so it falls through to the generic case.
      ServerFailure(:final statusCode) when statusCode != null && statusCode >= 500 => (
        Icons.cloud_off_outlined,
        tr(CopyKeys.offlineServerTitle),
        tr(CopyKeys.offlineServerBody),
        true,
      ),
      _ => (
        Icons.error_outline,
        tr(CopyKeys.commonError),
        // An empty message is common — `CancelledFailure` is not the only
        // failure constructed without one — and an empty body line would open
        // a hole under the title.
        failure.message.trim().isEmpty ? null : failure.message,
        false,
      ),
    };

    final showRetry = retryable && onRetry != null;

    return AppEmptyState(
      icon: icon,
      title: title,
      body: body,
      // «نحاول تاني».
      actionLabel: showRetry ? tr(CopyKeys.commonRetry) : null,
      onAction: showRetry ? onRetry : null,
      // Secondary, not primary. The amber fill is the product's one "press
      // this" colour and it belongs to what the student came to the screen to
      // do; «نحاول تاني» is getting back to that, not the thing itself. On a
      // route that failed to load it would also be the only saturated object
      // on screen, which makes a two-second server hiccup look like a crash.
      actionVariant: AppButtonVariant.secondary,
      compact: compact,
    );
  }
}
