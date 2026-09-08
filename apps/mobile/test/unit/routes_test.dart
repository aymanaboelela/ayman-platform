import 'package:ayman_mobile/core/router/routes.dart';
import 'package:flutter_test/flutter_test.dart';

/// Which routes live outside the tab shell.
///
/// This is the rule that decides `push` against `go`, and both mistakes ship
/// silently — each looks right on the screen it opens and misbehaves one
/// gesture later. The lesson case below is a bug that actually shipped: a
/// course card `go`-ing to the player destroyed the shell, and one back press
/// closed the app.
void main() {
  group('isOutsideShell', () {
    test('the player, the runner, the chat and the bell are outside', () {
      expect(AppRoutes.isOutsideShell(AppRoutes.chat), isTrue);
      expect(AppRoutes.isOutsideShell(AppRoutes.notifications), isTrue);
      expect(
        AppRoutes.isOutsideShell(AppRoutes.lessonOf('algebra', 'lesson-1')),
        isTrue,
      );
      expect(AppRoutes.isOutsideShell(AppRoutes.quizOf('lesson-1')), isTrue);
      expect(
        AppRoutes.isOutsideShell(AppRoutes.attemptOf('lesson-1', 'a1')),
        isTrue,
      );
      // ⚠️ The REVIEW screen too. It renders with normal chrome — see
      // `isAttemptRoute`, which deliberately excludes it — but it is still a
      // root-level route, and `go` would take the shell down under it just the
      // same. Chrome and navigator are two different questions.
      expect(
        AppRoutes.isOutsideShell(AppRoutes.attemptReviewOf('lesson-1', 'a1')),
        isTrue,
      );
    });

    test('every tab root is INSIDE', () {
      for (final route in [
        AppRoutes.dashboard,
        AppRoutes.path,
        AppRoutes.library,
        AppRoutes.results,
        AppRoutes.store,
        AppRoutes.profile,
        AppRoutes.foundations,
        AppRoutes.playground,
        AppRoutes.section,
        AppRoutes.devices,
      ]) {
        expect(
          AppRoutes.isOutsideShell(route),
          isFalse,
          reason: '$route is a shell destination',
        );
      }
    });

    test('a course page is inside — it is a branch route', () {
      expect(
        AppRoutes.isOutsideShell(AppRoutes.courseDetailOf('algebra')),
        isFalse,
      );
    });

    test('a slug that merely CONTAINS a lesson path does not match', () {
      expect(AppRoutes.isOutsideShell('/library/courses-lessons'), isFalse);
    });
  });

  group('bare-chrome routes', () {
    test('the runner is bare, its review is NOT', () {
      // Anchored on purpose: stripping the review screen's chrome would trap
      // the student on it with no way back.
      expect(
        AppRoutes.isAttemptRoute(AppRoutes.attemptOf('l1', 'a1')),
        isTrue,
      );
      expect(
        AppRoutes.isAttemptRoute(AppRoutes.attemptReviewOf('l1', 'a1')),
        isFalse,
      );
    });

    test('the player hides the bottom bar', () {
      expect(AppRoutes.isLessonRoute(AppRoutes.lessonOf('s', 'l')), isTrue);
      expect(AppRoutes.isLessonRoute(AppRoutes.courseDetailOf('s')), isFalse);
    });
  });
}
