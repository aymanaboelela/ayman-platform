import 'dart:async';

import '../../../features/quiz/domain/entities/attempt.dart';

/// Batches answers and sends them in order.
///
/// ## Why `seq` has to be monotonic
///
/// The server skips any slot whose stored `responseSeq` is already `>= seq`.
/// That is what stops a late write from a slow connection overwriting a newer
/// answer — and it is also what makes an out-of-order client silently lose its
/// own writes with no error at all. So this holds ONE counter, seeded from the
/// server's `nextSeq`, and increments it per flush.
///
/// ## Why it batches
///
/// A student answering twenty questions in two minutes would otherwise make
/// twenty requests. Answers are collected and flushed on a short debounce, and
/// FLUSHED IMMEDIATELY on the two moments that matter: leaving a question, and
/// handing the paper in.
///
/// ⚠️ A pending answer that is never flushed is a mark the student earned and
/// does not get. [flushNow] is awaited before every submit.
class AttemptAutosave {
  AttemptAutosave({
    required int nextSeq,
    required Future<SaveResult?> Function(int seq, Map<int, AnswerResponse?> answers)
        onSave,
    this.debounce = const Duration(milliseconds: 900),
  })  : _seq = nextSeq,
        _onSave = onSave;

  final Future<SaveResult?> Function(int seq, Map<int, AnswerResponse?> answers)
      _onSave;
  final Duration debounce;

  int _seq;

  /// Slot → the answer waiting to be sent. A later edit of the same slot
  /// REPLACES the pending one; only the last value is worth a request.
  final _pending = <int, AnswerResponse?>{};

  Timer? _timer;
  Future<void>? _inFlight;

  bool get hasPending => _pending.isNotEmpty;

  /// Records an answer and schedules a flush.
  void queue(int slotPosition, AnswerResponse? response) {
    _pending[slotPosition] = response;
    _timer?.cancel();
    _timer = Timer(debounce, () => unawaited(flushNow()));
  }

  /// Sends everything pending, now.
  ///
  /// Serialised: a second flush waits for the first, because two in flight at
  /// once is exactly the out-of-order write the sequence number exists to
  /// prevent.
  Future<void> flushNow() async {
    _timer?.cancel();
    _timer = null;

    final running = _inFlight;
    if (running != null) await running;

    if (_pending.isEmpty) return;

    final batch = Map<int, AnswerResponse?>.from(_pending);
    _pending.clear();
    final seq = _seq++;

    final future = _send(seq, batch);
    _inFlight = future;
    await future;
    _inFlight = null;
  }

  Future<void> _send(int seq, Map<int, AnswerResponse?> batch) async {
    final result = await _onSave(seq, batch);

    // A failed save puts the answers BACK, unless a newer edit already
    // replaced them — the student's latest keystroke always wins over a
    // retry of an older one.
    if (result == null) {
      for (final entry in batch.entries) {
        _pending.putIfAbsent(entry.key, () => entry.value);
      }
    }
  }

  void dispose() {
    _timer?.cancel();
    _timer = null;
  }
}
