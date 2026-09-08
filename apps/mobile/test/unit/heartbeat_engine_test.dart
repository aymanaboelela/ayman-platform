import 'package:ayman_mobile/core/data/progress/progress_constants.dart';
import 'package:ayman_mobile/core/services/player/heartbeat_engine.dart';
import 'package:flutter_test/flutter_test.dart';

/// A player under the engine's control, driven by the test.
class _FakeSource implements PlaybackSource {
  @override
  double seconds = 0;

  @override
  bool playing = true;

  @override
  double duration = 600;
}

void main() {
  group('the completion rule', () {
    test('needs BOTH thresholds — position alone is not enough', () {
      // Dragging the scrubber to the end. This is the hole a position-only
      // rule leaves open, and the reason the second threshold exists.
      expect(
        ProgressConstants.isVideoAutoComplete(
          durationSeconds: 600,
          maxPositionSeconds: 600,
          watchedSeconds: 10,
        ),
        isFalse,
      );
    });

    test('watch time alone is not enough either', () {
      // Left playing in the background and never finished.
      expect(
        ProgressConstants.isVideoAutoComplete(
          durationSeconds: 600,
          maxPositionSeconds: 100,
          watchedSeconds: 600,
        ),
        isFalse,
      );
    });

    test('both together complete it', () {
      expect(
        ProgressConstants.isVideoAutoComplete(
          durationSeconds: 600,
          maxPositionSeconds: 570, // exactly 95%
          watchedSeconds: 420, // exactly 70%
        ),
        isTrue,
      );
    });

    test('an unknown duration NEVER auto-completes', () {
      // Every ratio is meaningless, and the thresholds would be trivially
      // satisfiable at zero. Such a lesson is finished by hand or not at all.
      expect(
        ProgressConstants.isVideoAutoComplete(
          durationSeconds: 0,
          maxPositionSeconds: 0,
          watchedSeconds: 0,
        ),
        isFalse,
      );
    });
  });

  group('resume point', () {
    test('rewinds five seconds, so the student gets a run-up', () {
      expect(
        ProgressConstants.resumePoint(
          maxPositionSeconds: 300,
          durationSeconds: 600,
          isComplete: false,
        ),
        295,
      );
    });

    test('a COMPLETED lesson restarts from zero', () {
      // Reopening something already finished is rewatching it, and dropping a
      // student twenty seconds from the end is the opposite of helpful.
      expect(
        ProgressConstants.resumePoint(
          maxPositionSeconds: 590,
          durationSeconds: 600,
          isComplete: true,
        ),
        0,
      );
    });

    test('a stale position past the duration restarts from zero', () {
      // The instructor swapped in a shorter cut.
      expect(
        ProgressConstants.resumePoint(
          maxPositionSeconds: 900,
          durationSeconds: 600,
          isComplete: false,
        ),
        0,
      );
    });

    test('never goes negative', () {
      expect(
        ProgressConstants.resumePoint(
          maxPositionSeconds: 3,
          durationSeconds: 600,
          isComplete: false,
        ),
        0,
      );
    });
  });

  group('HeartbeatEngine', () {
    test('counts one second per honest tick and flushes at ten', () async {
      final source = _FakeSource();
      final flushes = <(int, int)>[];
      final engine = HeartbeatEngine(
        source: source,
        onFlush: (position, delta) async => flushes.add((position, delta)),
      );

      engine.start();
      // Ten seconds of ordinary playback.
      for (var i = 1; i <= 10; i++) {
        source.seconds = i.toDouble();
        await Future<void>.delayed(ProgressConstants.tick);
      }
      await engine.stop();

      expect(flushes, isNotEmpty);
      expect(flushes.first.$2, greaterThan(0));
      // Never more than one second per tick.
      expect(flushes.first.$2, lessThanOrEqualTo(10));
    }, timeout: const Timeout(Duration(seconds: 30)));

    test('a SEEK earns nothing', () async {
      final source = _FakeSource();
      final flushes = <(int, int)>[];
      final engine = HeartbeatEngine(
        source: source,
        onFlush: (position, delta) async => flushes.add((position, delta)),
      );

      engine.start();
      // One tick, and the scrubber jumps to the end. This is the whole
      // anti-cheat: the position is reported honestly (it IS where they are)
      // but no watch time is claimed for it.
      source.seconds = 599;
      await Future<void>.delayed(ProgressConstants.tick * 2);
      await engine.stop();

      final claimed = flushes.fold<int>(0, (sum, f) => sum + f.$2);
      expect(claimed, 0);
      // The position still reaches the server — `maxPositionSeconds` is the
      // other half of the rule and a seek genuinely did move it.
      expect(flushes.last.$1, 599);
    }, timeout: const Timeout(Duration(seconds: 30)));

    test('a PAUSED player earns nothing', () async {
      final source = _FakeSource()..playing = false;
      final flushes = <(int, int)>[];
      final engine = HeartbeatEngine(
        source: source,
        onFlush: (position, delta) async => flushes.add((position, delta)),
      );

      engine.start();
      for (var i = 1; i <= 3; i++) {
        source.seconds = i.toDouble();
        await Future<void>.delayed(ProgressConstants.tick);
      }
      await engine.stop();

      expect(flushes.fold<int>(0, (sum, f) => sum + f.$2), 0);
    }, timeout: const Timeout(Duration(seconds: 30)));

    test('a FAILED flush puts the seconds back', () async {
      // A network failure is not a reason to lose watch time the student
      // earned. The next flush carries both.
      final source = _FakeSource();
      var attempts = 0;
      final delivered = <int>[];

      final engine = HeartbeatEngine(
        source: source,
        onFlush: (position, delta) async {
          attempts += 1;
          if (attempts == 1) throw Exception('offline');
          delivered.add(delta);
        },
      );

      engine.start();
      for (var i = 1; i <= 21; i++) {
        source.seconds = i.toDouble();
        await Future<void>.delayed(ProgressConstants.tick);
      }
      await engine.stop();

      expect(attempts, greaterThan(1));
      // The second flush carries more than one flush's worth, because the
      // first one's seconds were returned to the accumulator.
      expect(delivered.any((delta) => delta > 10), isTrue);
    }, timeout: const Timeout(Duration(seconds: 60)));
  });
}
