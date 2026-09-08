import '../../../core/data/path/learning_path.dart';
import 'entities/course_detail.dart';
import 'entities/course_outline.dart';

/// Joins the public section tree to the student's own gate and progress.
///
/// A direct port of `buildCourseOutline` in `apps/web/lib/course-outline.ts`.
/// ⚠️ The two must stay identical — see the parity rule in `CLAUDE.md`.
///
/// ## What the join is for
///
/// The catalogue half is the same for everyone and cached for hours; the path
/// half is per-student and per-request. Merging them server-side would make
/// the catalogue uncacheable per student, so they are two reads and one pure
/// function — which is also what makes the rule below testable without a
/// database.
///
/// ## Why the shape of the list stopped carrying meaning
///
/// This used to name the lesson standing in front of a locked one. It no
/// longer can: every lecture and every lecture quiz opens the day a student
/// enrols, and the only row the gate still closes is the final exam, which is
/// blocked by the whole course rather than by any nameable lesson.
///
/// What the padlock was doing, besides refusing, was telling the student where
/// they were — a run of locks with one open row at the front answered "where
/// am I" by the SHAPE of the list. With everything open the shape says
/// nothing, so the state has to be said in WORDS on every row.
///
/// ⚠️ Everything here is PRESENTATION. `/courses/:slug/lessons/:id` re-derives
/// the gate on every request and 404s the locked exam.
abstract final class CourseOutlineBuilder {
  static CourseOutline build({
    required CourseDetail course,
    /// The same course from `/api/me/path`, or null when not enrolled.
    required PathCourse? path,
  }) {
    final byId = {
      for (final node in path?.nodes ?? const <PathNode>[]) node.id: node,
    };

    // ⚠️ Counts LECTURES, and is incremented only for them.
    //
    // It used to increment per row, so «المحاضرة ٣» and «المحاضرة ٥» were the
    // two quizzes and a three-lecture course numbered up to five. A quiz has
    // no number of its own — it is «كويز المحاضرة ٢», named after the lecture
    // it belongs to — so it takes its lecture's index and the counter stays
    // put.
    var index = 0;

    OutlineLesson toLesson(CourseLesson lesson) {
      final node = byId[lesson.id];
      return OutlineLesson(
        id: lesson.id,
        title: lesson.title,
        kind: lesson.kind,
        durationSeconds: lesson.durationSeconds,
        isExam: node?.isExam ?? false,
        gate: node?.gate,
        index: index,
        state: node?.state,
      );
    }

    final sections = <OutlineSection>[];
    for (final section in course.sections) {
      // Two parallel lists rather than one list of entries, because a quiz
      // has to be appended to an entry that was already built. Zipped at the
      // end, so what leaves this function is immutable.
      final lectures = <OutlineLesson>[];
      final quizzes = <List<OutlineLesson>>[];

      for (final lesson in section.lessons) {
        // The final exam is a quiz lesson too, and it is NOT a lecture's quiz
        // — the gate blocks it on the whole course rather than on one lecture.
        // Nesting it would file the course's exam under whichever lecture
        // happened to precede it.
        final isExam = byId[lesson.id]?.isExam ?? false;

        // A quiz with no lecture before it in this section cannot be nested
        // under anything, so it falls through and stands on its own rather
        // than vanishing. The admin can no longer produce one; old courses can
        // still hold one.
        if (lesson.kind == 'quiz' && !isExam && lectures.isNotEmpty) {
          quizzes.last.add(toLesson(lesson));
          continue;
        }

        index += 1;
        lectures.add(toLesson(lesson));
        quizzes.add([]);
      }

      sections.add(
        OutlineSection(
          id: section.id,
          title: section.title,
          summary: section.summary,
          entries: [
            for (var i = 0; i < lectures.length; i++)
              OutlineEntry(lecture: lectures[i], quizzes: quizzes[i]),
          ],
        ),
      );
    }

    return CourseOutline(
      sections: sections,
      // Enrolment is the PRESENCE of a path row, not a percent — a student who
      // enrolled this morning and watched nothing is enrolled at 0%.
      enrolled: path != null,
      progressPercent: path?.progressPercent ?? 0,
      clearedLessons: path?.clearedLessons ?? 0,
      // Falls back to the catalogue's own count so an unenrolled student still
      // sees how long the course is.
      totalLessons: path?.totalLessons ?? course.lessonCount,
      nextLessonId: path?.nextLessonId,
    );
  }
}
