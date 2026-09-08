import 'dart:async';

/// The exam countdown, anchored to the SERVER's clock.
///
/// ## ⚠️ The device clock is read exactly once per anchor and never again
///
/// A student whose phone clock is wrong — or who changes it mid-exam — must
/// not be able to buy or steal time. Every response a running client sees
/// carries a fresh `serverTime`, and the remaining time is measured from that
/// anchor with a MONOTONIC stopwatch:
///
/// ```
/// nowServer = anchorServer + stopwatch.elapsed
/// remaining = deadline - nowServer
/// ```
///
/// `DateTime.now()` appears nowhere in the loop. A clock jump moves nothing.
///
/// ## The grace period
///
/// Only when the quiz's `overdueHandling` is `graceperiod` AND `graceSeconds`
/// is positive: at zero the clock enters GRACE instead of firing, and counts a
/// second time to `deadline + grace`. For `autosubmit` and `autoabandon` the
/// callback fires the moment the main countdown reaches zero.
///
/// The callback is LATCHED — it fires exactly once, whatever the ticking does
/// afterwards. A submit fired twice is a 409 in the middle of an exam.
class AttemptClock {
  AttemptClock({
    required DateTime serverTime,
    required DateTime deadline,
    required this.graceSeconds,
    required this.usesGracePeriod,
    required this.onTimeUp,
  })  : _deadline = deadline,
        _anchorServer = serverTime;

  /// Extra seconds after the deadline in which a hand-in is still accepted.
  final int graceSeconds;

  /// Whether the GRACE UI is shown. The server tolerates writes until
  /// `deadline + extraTime + grace` whatever this says — only the display
  /// differs.
  final bool usesGracePeriod;

  final void Function() onTimeUp;

  DateTime _anchorServer;
  DateTime _deadline;

  final _elapsed = Stopwatch();
  Timer? _timer;

  /// Fired once, and never again.
  bool _fired = false;

  /// Past the deadline and inside the grace window.
  bool _inGrace = false;
  bool get isInGrace => _inGrace;

  final _ticks = StreamController<Duration>.broadcast();

  /// Remaining time, emitted when the displayed SECOND changes.
  Stream<Duration> get ticks => _ticks.stream;

  Duration get remaining {
    final nowServer = _anchorServer.add(_elapsed.elapsed);
    final target = _inGrace
        ? _deadline.add(Duration(seconds: graceSeconds))
        : _deadline;
    final left = target.difference(nowServer);
    return left.isNegative ? Duration.zero : left;
  }

  void start() {
    if (_timer != null) return;
    _elapsed.start();
    // Sampled four times a second so the zero crossing is committed promptly:
    // a whole-second sample would delay the hand-in by up to a second, which
    // on an exam is a real answer lost.
    _timer = Timer.periodic(const Duration(milliseconds: 250), (_) => _tick());
    _tick();
  }

  /// A fresh `serverTime` arrived — from a save, or from a resume.
  ///
  /// Re-anchoring is what keeps a long attempt honest: drift between the
  /// device's stopwatch and the server accumulates, and every save corrects it.
  void reanchor({required DateTime serverTime, DateTime? deadline}) {
    _anchorServer = serverTime;
    if (deadline != null) _deadline = deadline;
    _elapsed
      ..reset()
      ..start();
  }

  Duration? _lastEmitted;

  void _tick() {
    final left = remaining;

    // Emit only when the displayed second changes — except the zero crossing,
    // which is committed exactly.
    final seconds = left.inMilliseconds <= 0 ? 0 : (left.inMilliseconds / 1000).ceil();
    if (_lastEmitted == null || _lastEmitted!.inSeconds != seconds) {
      _lastEmitted = Duration(seconds: seconds);
      if (!_ticks.isClosed) _ticks.add(left);
    }

    if (left > Duration.zero) return;

    // The main countdown is done. Enter grace ONCE, if this quiz has one.
    if (usesGracePeriod && graceSeconds > 0 && !_inGrace) {
      _inGrace = true;
      _lastEmitted = null;
      return;
    }

    if (_fired) return;
    _fired = true;
    onTimeUp();
  }

  void dispose() {
    _timer?.cancel();
    _timer = null;
    _elapsed.stop();
    _ticks.close();
  }
}
