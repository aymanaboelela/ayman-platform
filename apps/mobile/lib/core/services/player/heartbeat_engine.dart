import 'dart:async';
import 'dart:math' as math;

import '../../data/progress/progress_constants.dart';

/// What the engine needs from whatever is playing.
///
/// ⚠️ ONE adapter, for BOTH sources. The mirror and the YouTube fallback are
/// two different players, and writing a heartbeat for each is how the two
/// silently disagree about what a watched second is. Everything the protocol
/// needs is these three numbers.
abstract interface class PlaybackSource {
  /// Where the scrubber is, in seconds.
  double get seconds;

  /// Whether it is actually playing right now.
  bool get playing;

  /// The media's length in seconds, or 0 when unknown.
  double get duration;
}

/// Turns playback into heartbeats.
///
/// ## Why there is a local accumulator at all
///
/// The server is told how many seconds of ACTUAL playback happened, and it has
/// no way to see that for itself — it only knows when requests arrived. So the
/// client counts, once a second, and flushes every ten.
///
/// ## The honesty rule, and why it is not optional
///
/// A tick that advanced the position by more than [maxHonestTickAdvance] is a
/// SEEK, not playback, and earns nothing. Without it, dragging the scrubber to
/// the end would credit the whole lecture — which is precisely the hole
/// position-only completion rules leave open.
///
/// The engine reports honestly because the server clamps anyway: the claim is
/// intersected with the gap the server measured, so a dishonest client gets
/// the same credit and a wrong idea of its own progress.
class HeartbeatEngine {
  HeartbeatEngine({
    required PlaybackSource source,
    required Future<void> Function(int position, int delta) onFlush,
  })  : _source = source,
        _onFlush = onFlush;

  final PlaybackSource _source;
  final Future<void> Function(int position, int delta) _onFlush;

  Timer? _timer;

  /// Seconds of honest playback since the last flush.
  int _pending = 0;

  /// Ticks since the last flush.
  int _ticks = 0;

  /// Where the position was at the previous tick, to measure the advance.
  double? _lastPosition;

  /// A flush is in flight — a second one would report the same seconds twice.
  bool _flushing = false;

  bool get isRunning => _timer != null;

  void start() {
    if (_timer != null) return;
    _lastPosition = _source.seconds;
    _timer = Timer.periodic(ProgressConstants.tick, (_) => _onTick());
  }

  /// Stops ticking and flushes whatever is owed.
  ///
  /// ⚠️ Awaited by the caller on dispose. Seconds counted and never sent are
  /// seconds the student watched and does not get credit for, and they are
  /// most likely to be lost at exactly the moment a lesson is finished and the
  /// screen closes.
  Future<void> stop() async {
    _timer?.cancel();
    _timer = null;
    await _flush();
  }

  void _onTick() {
    final position = _source.seconds;
    final previous = _lastPosition;
    _lastPosition = position;

    if (!_source.playing) {
      // Paused: the position may still move (the student is scrubbing), and
      // none of it is playback.
      return;
    }

    if (previous != null) {
      final advance = position - previous;
      // Backwards is a rewind, forwards by more than the honest ceiling is a
      // seek. Neither is watched time. A NEGATIVE advance still counts as one
      // tick towards the flush, so a student who rewinds constantly still gets
      // their heartbeats sent.
      if (advance >= 0 && advance <= ProgressConstants.maxHonestTickAdvance) {
        _pending += 1;
      }
    }

    _ticks += 1;
    if (_ticks >= ProgressConstants.ticksPerFlush) unawaited(_flush());
  }

  Future<void> _flush() async {
    if (_flushing) return;

    final delta = math.min(_pending, ProgressConstants.maxHeartbeatDeltaSeconds);
    final position = _source.seconds.floor();
    _ticks = 0;

    // Nothing was watched. Still worth sending IF the position moved, because
    // `maxPositionSeconds` is half the completion rule and a student who
    // seeks to the end and stops would otherwise never record having got
    // there. A zero-delta heartbeat is explicitly allowed by the schema.
    if (delta <= 0 && position <= 0) return;

    _flushing = true;
    _pending -= delta;

    try {
      await _onFlush(position, delta);
    } catch (_) {
      // Put the seconds BACK. A failed flush is a network problem, not a
      // reason to lose watch time the student earned — the next flush carries
      // both, and the server's 15-second cap is what stops a long outage from
      // arriving as one implausible claim.
      _pending += delta;
    } finally {
      _flushing = false;
    }
  }
}
