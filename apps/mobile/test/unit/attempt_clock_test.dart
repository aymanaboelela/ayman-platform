import 'package:ayman_mobile/core/services/quiz/attempt_autosave.dart';
import 'package:ayman_mobile/core/services/quiz/attempt_clock.dart';
import 'package:ayman_mobile/features/quiz/domain/entities/attempt.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('AttemptClock', () {
    test('counts down from the SERVER time, not the device clock', () {
      // The device is an hour fast. The remaining time must not care.
      final serverTime = DateTime.now().subtract(const Duration(hours: 1));
      final clock = AttemptClock(
        serverTime: serverTime,
        deadline: serverTime.add(const Duration(minutes: 10)),
        graceSeconds: 0,
        usesGracePeriod: false,
        onTimeUp: () {},
      );

      // Ten minutes, measured from the ANCHOR. Read against the device clock
      // the deadline is fifty minutes in the past and this would be negative.
      expect(clock.remaining.inMinutes, 10);
      clock.dispose();
    });

    test('an elapsed deadline reads zero, never negative', () {
      final serverTime = DateTime.now();
      final clock = AttemptClock(
        serverTime: serverTime,
        deadline: serverTime.subtract(const Duration(minutes: 5)),
        graceSeconds: 0,
        usesGracePeriod: false,
        onTimeUp: () {},
      );

      expect(clock.remaining, Duration.zero);
      clock.dispose();
    });

    test('fires ONCE at zero when there is no grace', () async {
      var fired = 0;
      final serverTime = DateTime.now();
      final clock = AttemptClock(
        serverTime: serverTime,
        deadline: serverTime.add(const Duration(milliseconds: 300)),
        graceSeconds: 0,
        usesGracePeriod: false,
        onTimeUp: () => fired += 1,
      )..start();

      await Future<void>.delayed(const Duration(milliseconds: 1400));
      clock.dispose();

      // Latched: the timer keeps sampling after zero and must not fire again.
      // A submit sent twice is a 409 in the middle of an exam.
      expect(fired, 1);
    });

    test('enters GRACE instead of firing, then fires at the end of it', () async {
      var fired = 0;
      final serverTime = DateTime.now();
      final clock = AttemptClock(
        serverTime: serverTime,
        deadline: serverTime.add(const Duration(milliseconds: 300)),
        graceSeconds: 1,
        usesGracePeriod: true,
        onTimeUp: () => fired += 1,
      )..start();

      await Future<void>.delayed(const Duration(milliseconds: 600));
      expect(fired, 0, reason: 'the grace window has not run out yet');
      expect(clock.isInGrace, isTrue);

      await Future<void>.delayed(const Duration(milliseconds: 1200));
      expect(fired, 1);
      clock.dispose();
    });

    test('re-anchoring corrects drift without moving the deadline', () {
      final serverTime = DateTime.now();
      final deadline = serverTime.add(const Duration(minutes: 10));
      final clock = AttemptClock(
        serverTime: serverTime,
        deadline: deadline,
        graceSeconds: 0,
        usesGracePeriod: false,
        onTimeUp: () {},
      );

      // A save comes back saying the server is two minutes further on than
      // this client thinks. The remaining time shrinks; the deadline does not
      // move.
      clock.reanchor(serverTime: serverTime.add(const Duration(minutes: 2)));
      expect(clock.remaining.inMinutes, 7);
      clock.dispose();
    });
  });

  group('AttemptAutosave', () {
    test('increments seq per flush and never reuses one', () async {
      final seen = <int>[];
      final autosave = AttemptAutosave(
        nextSeq: 5,
        debounce: const Duration(milliseconds: 10),
        onSave: (seq, answers) async {
          seen.add(seq);
          return SaveResult(
            savedSlots: answers.keys.toList(),
            serverTime: DateTime.now(),
            answeredCount: answers.length,
          );
        },
      );

      autosave.queue(0, const ChoiceAnswer(['a']));
      await autosave.flushNow();
      autosave.queue(1, const ChoiceAnswer(['b']));
      await autosave.flushNow();

      // Seeded from the server's `nextSeq`, then strictly increasing — a
      // repeat would be silently skipped server-side and the answer lost.
      expect(seen, [5, 6]);
      autosave.dispose();
    });

    test('a later edit of the same slot REPLACES the pending one', () async {
      Map<int, AnswerResponse?>? sent;
      final autosave = AttemptAutosave(
        nextSeq: 1,
        debounce: const Duration(milliseconds: 10),
        onSave: (seq, answers) async {
          sent = answers;
          return SaveResult(
            savedSlots: answers.keys.toList(),
            serverTime: DateTime.now(),
            answeredCount: answers.length,
          );
        },
      );

      autosave.queue(0, const ChoiceAnswer(['first']));
      autosave.queue(0, const ChoiceAnswer(['second']));
      await autosave.flushNow();

      expect(sent!.length, 1);
      expect((sent![0]! as ChoiceAnswer).optionIds, ['second']);
      autosave.dispose();
    });

    test('a FAILED save keeps the answer for the next flush', () async {
      var attempts = 0;
      final autosave = AttemptAutosave(
        nextSeq: 1,
        debounce: const Duration(milliseconds: 10),
        onSave: (seq, answers) async {
          attempts += 1;
          if (attempts == 1) return null; // the network was gone
          return SaveResult(
            savedSlots: answers.keys.toList(),
            serverTime: DateTime.now(),
            answeredCount: answers.length,
          );
        },
      );

      autosave.queue(0, const ChoiceAnswer(['a']));
      await autosave.flushNow();
      expect(autosave.hasPending, isTrue, reason: 'the answer must survive');

      await autosave.flushNow();
      expect(autosave.hasPending, isFalse);
      expect(attempts, 2);
      autosave.dispose();
    });

    test('a null response is sent — clearing is an ACT, not an omission', () async {
      Map<int, AnswerResponse?>? sent;
      final autosave = AttemptAutosave(
        nextSeq: 1,
        debounce: const Duration(milliseconds: 10),
        onSave: (seq, answers) async {
          sent = answers;
          return SaveResult(
            savedSlots: answers.keys.toList(),
            serverTime: DateTime.now(),
            answeredCount: 0,
          );
        },
      );

      autosave.queue(3, null);
      await autosave.flushNow();

      // «مسح إجابتي» has to reach the server: dropping the key would leave the
      // old answer standing and the question marked as answered.
      expect(sent!.containsKey(3), isTrue);
      expect(sent![3], isNull);
      autosave.dispose();
    });
  });
}
