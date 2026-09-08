/// The progress protocol's numbers, copied from
/// `packages/contracts/src/progress.ts`.
///
/// ⚠️ These are a CONTRACT with the server, not client preferences. The API
/// enforces the same values on every heartbeat and clamps a client that
/// disagrees — a player claiming a bigger delta does not earn more watch time,
/// it just reports dishonestly and gets the same credit.
abstract final class ProgressConstants {
  /// How far into the video the furthest point must reach.
  static const videoPositionThreshold = 0.95;

  /// How much of it must actually have been watched.
  ///
  /// ⚠️ BOTH thresholds are required, because either alone is trivially
  /// defeated: position-only means dragging the scrubber to the end,
  /// watch-time-only means leaving it playing in the background.
  static const videoWatchedThreshold = 0.7;

  /// One heartbeat per ten seconds of PLAYBACK — not of wall-clock time.
  static const heartbeatInterval = Duration(milliseconds: 10000);

  /// The hard cap on one heartbeat's claim. 15 > 10 on purpose, so a
  /// backgrounded app can report one late tick without losing it.
  static const maxHeartbeatDeltaSeconds = 15;

  /// Text and attachment lessons complete after this long on screen.
  ///
  /// ⚠️ The server measures it from its own `firstOpenedAt`. Asking early is
  /// not an error and cannot make it happen faster.
  static const dwellComplete = Duration(milliseconds: 5000);

  /// The local accumulator's tick.
  static const tick = Duration(seconds: 1);

  /// Ticks per flush — `heartbeatInterval / tick`.
  static const ticksPerFlush = 10;

  /// A jump larger than this in ONE tick is a SEEK, not playback, and must not
  /// be counted. Without it, dragging the scrubber would earn watch time.
  static const maxHonestTickAdvance = 2;

  /// Resume BEFORE the furthest point, so the student gets a run-up rather
  /// than being dropped mid-sentence.
  static const resumeRewindSeconds = 5;

  /// Whether the server would call this video complete.
  ///
  /// ⚠️ A MIRROR of the server's rule, never the decision. The client may use
  /// it to predict the outcome; it must reconcile to whatever comes back.
  static bool isVideoAutoComplete({
    required int durationSeconds,
    required int maxPositionSeconds,
    required int watchedSeconds,
  }) {
    // An unknown duration makes every ratio meaningless — and would make the
    // thresholds trivially satisfiable at 0. Such a lesson can only be
    // finished with the manual button.
    if (durationSeconds <= 0) return false;
    return maxPositionSeconds >= videoPositionThreshold * durationSeconds &&
        watchedSeconds >= videoWatchedThreshold * durationSeconds;
  }

  /// Where playback should start, from the furthest point reached.
  ///
  /// Zero for a COMPLETED lesson: reopening something already finished is
  /// rewatching it, and dropping a student twenty seconds from the end is the
  /// opposite of helpful. Zero too when the point is past the duration — the
  /// instructor swapped in a shorter cut and the stored position is stale.
  static int resumePoint({
    required int maxPositionSeconds,
    required int durationSeconds,
    required bool isComplete,
  }) {
    if (isComplete) return 0;
    final point = maxPositionSeconds - resumeRewindSeconds;
    if (point <= 0) return 0;
    if (durationSeconds > 0 && point >= durationSeconds) return 0;
    return point;
  }
}
