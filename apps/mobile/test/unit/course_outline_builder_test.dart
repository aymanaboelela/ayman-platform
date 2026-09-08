import 'package:ayman_mobile/core/data/path/learning_path.dart';
import 'package:ayman_mobile/features/course/domain/course_outline_builder.dart';
import 'package:ayman_mobile/features/course/domain/entities/course_detail.dart';
import 'package:ayman_mobile/features/course/domain/entities/course_outline.dart';
import 'package:flutter_test/flutter_test.dart';

/// The join behind the course page.
///
/// A port of the web's `buildCourseOutline`, and the parity rule says the two
/// must not drift. Every case here is a rule stated in that file's comments:
/// a quiz takes its lecture's number, the exam is never nested, a failed quiz
/// is finished but not cleared.
void main() {
  CourseLesson lesson(String id, {String kind = 'video', int? seconds = 600}) {
    return CourseLesson(
      id: id,
      title: 'Lesson $id',
      kind: kind,
      estimatedSeconds: 600,
      isFreePreview: false,
      durationSeconds: seconds,
      forGeneral: true,
      forLanguages: true,
    );
  }

  CourseDetail course(List<CourseSection> sections, {int? lessonCount}) {
    return CourseDetail(
      id: 'course-1',
      slug: 'course-1',
      title: 'Course',
      systemNameAr: 'البكالوريا',
      subjectNameAr: 'البرمجة',
      year: 2,
      lessonCount: lessonCount ??
          sections.fold(0, (n, s) => n + s.lessons.length),
      totalSeconds: 3600,
      contentComplete: false,
      sections: sections,
      terms: const [],
    );
  }

  PathNode node(
    String id, {
    String kind = 'video',
    String state = 'not_started',
    String gate = 'available',
    bool isExam = false,
    String? lessonId,
  }) {
    return PathNode(
      id: id,
      lessonId: lessonId ?? id,
      title: 'Lesson $id',
      kind: kind,
      state: state,
      gate: gate,
      isExam: isExam,
    );
  }

  PathCourse enrolment(
    List<PathNode> nodes, {
    double percent = 0,
    int cleared = 0,
    int total = 0,
    String? nextLessonId,
  }) {
    return PathCourse(
      id: 'course-1',
      slug: 'course-1',
      title: 'Course',
      subjectNameAr: 'البرمجة',
      published: true,
      progressPercent: percent,
      clearedLessons: cleared,
      totalLessons: total,
      contentComplete: false,
      nextLessonId: nextLessonId,
      nodes: nodes,
    );
  }

  group('not enrolled', () {
    test('every row has a NULL gate — nothing has happened yet', () {
      final outline = CourseOutlineBuilder.build(
        course: course([
          CourseSection(id: 's1', title: 'Unit 1', lessons: [lesson('a')]),
        ]),
        path: null,
      );

      expect(outline.enrolled, isFalse);
      final row = outline.sections.single.entries.single.lecture;
      expect(row.gate, isNull);
      expect(row.state, isNull);
      // A null gate must not read as finished — that is the difference between
      // «لسه ماشوفتهاش» and a tick on forty rows nobody has opened.
      expect(row.isFinished, isFalse);
      expect(row.mark, LessonStateMark.isNew);
    });

    test('the total falls back to the catalogue count', () {
      final outline = CourseOutlineBuilder.build(
        course: course(
          [CourseSection(id: 's1', title: 'Unit 1', lessons: [lesson('a')])],
          lessonCount: 7,
        ),
        path: null,
      );

      expect(outline.totalLessons, 7);
    });
  });

  group('numbering', () {
    test('counts LECTURES — a quiz takes its lecture number', () {
      final outline = CourseOutlineBuilder.build(
        course: course([
          CourseSection(
            id: 's1',
            title: 'Unit 1',
            lessons: [
              lesson('l1'),
              lesson('q1', kind: 'quiz'),
              lesson('l2'),
              lesson('q2', kind: 'quiz'),
              lesson('l3'),
            ],
          ),
        ]),
        path: enrolment([node('l1'), node('q1', kind: 'quiz'), node('l2'),
            node('q2', kind: 'quiz'), node('l3')]),
      );

      final entries = outline.sections.single.entries;
      // Three LECTURES, not five rows.
      expect(entries.length, 3);
      expect(entries.map((e) => e.lecture.index), [1, 2, 3]);
      // The quiz shares its lecture's number.
      expect(entries[0].quizzes.single.index, 1);
      expect(entries[1].quizzes.single.index, 2);
    });

    test('keeps counting across sections', () {
      final outline = CourseOutlineBuilder.build(
        course: course([
          CourseSection(id: 's1', title: 'U1', lessons: [lesson('a'), lesson('b')]),
          CourseSection(id: 's2', title: 'U2', lessons: [lesson('c')]),
        ]),
        path: null,
      );

      expect(outline.sections[1].entries.single.lecture.index, 3);
    });
  });

  group('nesting', () {
    test('a quiz belongs to the nearest lecture BEFORE it', () {
      final outline = CourseOutlineBuilder.build(
        course: course([
          CourseSection(
            id: 's1',
            title: 'U1',
            lessons: [lesson('l1'), lesson('l2'), lesson('q', kind: 'quiz')],
          ),
        ]),
        path: null,
      );

      final entries = outline.sections.single.entries;
      expect(entries[0].quizzes, isEmpty);
      expect(entries[1].quizzes.single.id, 'q');
    });

    test('the final EXAM is never nested', () {
      // It is gated on the whole course, not on one lecture. Nesting it would
      // file the course's exam under whichever lecture happened to precede it.
      final outline = CourseOutlineBuilder.build(
        course: course([
          CourseSection(
            id: 's1',
            title: 'U1',
            lessons: [lesson('l1'), lesson('exam', kind: 'quiz')],
          ),
        ]),
        path: enrolment([
          node('l1'),
          node('exam', kind: 'quiz', gate: 'locked', isExam: true),
        ]),
      );

      final entries = outline.sections.single.entries;
      expect(entries.length, 2);
      expect(entries[1].lecture.id, 'exam');
      expect(entries[1].lecture.isExam, isTrue);
      expect(entries[0].quizzes, isEmpty);
    });

    test('an orphan quiz stands on its own rather than vanishing', () {
      // The admin can no longer produce one; old courses can still hold one.
      final outline = CourseOutlineBuilder.build(
        course: course([
          CourseSection(
            id: 's1',
            title: 'U1',
            lessons: [lesson('q', kind: 'quiz'), lesson('l1')],
          ),
        ]),
        path: null,
      );

      final entries = outline.sections.single.entries;
      expect(entries.map((e) => e.lecture.id), ['q', 'l1']);
    });

    test('a quiz does not carry over into the next section', () {
      final outline = CourseOutlineBuilder.build(
        course: course([
          CourseSection(id: 's1', title: 'U1', lessons: [lesson('l1')]),
          CourseSection(
            id: 's2',
            title: 'U2',
            lessons: [lesson('q', kind: 'quiz'), lesson('l2')],
          ),
        ]),
        path: null,
      );

      expect(outline.sections[0].entries.single.quizzes, isEmpty);
      // Nothing before it IN ITS OWN SECTION, so it stands alone.
      expect(outline.sections[1].entries.map((e) => e.lecture.id), ['q', 'l2']);
    });
  });

  group('finished vs cleared', () {
    test('a FAILED lecture quiz is finished but not cleared', () {
      // One sitting, spent. It keeps «نتيجتك» as its word and wears the
      // finished chip, and the section counter still does not count it.
      final outline = CourseOutlineBuilder.build(
        course: course([
          CourseSection(
            id: 's1',
            title: 'U1',
            lessons: [lesson('l1'), lesson('q', kind: 'quiz')],
          ),
        ]),
        path: enrolment([
          node('l1', gate: 'available'),
          node('q', kind: 'quiz', gate: 'available', state: 'failed'),
        ]),
      );

      final quiz = outline.sections.single.entries.single.quizzes.single;
      expect(quiz.isFinished, isTrue);
      expect(quiz.gate, isNot('cleared'));
      expect(outline.sections.single.clearedCount, 0);
    });

    test('a failed EXAM is NOT finished — an improvement sitting may remain', () {
      final outline = CourseOutlineBuilder.build(
        course: course([
          CourseSection(id: 's1', title: 'U1', lessons: [lesson('e', kind: 'quiz')]),
        ]),
        path: enrolment([
          node('e', kind: 'quiz', state: 'failed', isExam: true),
        ]),
      );

      expect(outline.sections.single.entries.single.lecture.isFinished, isFalse);
    });

    test('the section counter counts the GATE, and lectures only', () {
      final outline = CourseOutlineBuilder.build(
        course: course([
          CourseSection(
            id: 's1',
            title: 'U1',
            lessons: [
              lesson('l1'),
              lesson('q1', kind: 'quiz'),
              lesson('l2'),
            ],
          ),
        ]),
        path: enrolment([
          node('l1', gate: 'cleared', state: 'completed'),
          node('q1', kind: 'quiz', gate: 'cleared', state: 'passed'),
          node('l2', gate: 'available'),
        ]),
      );

      // Two lectures in the unit, one cleared. The cleared QUIZ is not a step
      // and must not turn «١ / ٢» into «٢ / ٣».
      final section = outline.sections.single;
      expect(section.entries.length, 2);
      expect(section.clearedCount, 1);
    });

    test('in_progress is a third state, not the absence of finished', () {
      final outline = CourseOutlineBuilder.build(
        course: course([
          CourseSection(id: 's1', title: 'U1', lessons: [lesson('a')]),
        ]),
        path: enrolment([node('a', state: 'in_progress')]),
      );

      expect(
        outline.sections.single.entries.single.lecture.mark,
        LessonStateMark.started,
      );
    });
  });

  group('remaining lectures', () {
    test('names the unfinished LECTURES in course order, quizzes excluded', () {
      final outline = CourseOutlineBuilder.build(
        course: course([
          CourseSection(
            id: 's1',
            title: 'U1',
            lessons: [
              lesson('l1'),
              lesson('q1', kind: 'quiz'),
              lesson('l2'),
              lesson('l3'),
            ],
          ),
        ]),
        path: enrolment([
          node('l1', gate: 'cleared', state: 'completed'),
          node('q1', kind: 'quiz', state: 'not_started'),
          node('l2', state: 'in_progress'),
          node('l3', state: 'not_started'),
        ]),
      );

      final left = outline.remainingLectures;
      expect(left.map((l) => l.id), ['l2', 'l3']);
      // The number each row shows, so the sheet and the outline agree.
      expect(left.map((l) => l.index), [2, 3]);
      expect(left.first.started, isTrue);
      expect(left.last.started, isFalse);
    });
  });

  test('an unmatched path node changes nothing', () {
    // A quiz hanging off a video lecture emits a node whose id is the QUIZ's,
    // and the catalogue has no row for it. The join must simply not find it.
    final outline = CourseOutlineBuilder.build(
      course: course([
        CourseSection(id: 's1', title: 'U1', lessons: [lesson('l1')]),
      ]),
      path: enrolment([
        node('l1', gate: 'cleared', state: 'completed'),
        node('attached-quiz', kind: 'quiz', lessonId: 'l1'),
      ]),
    );

    expect(outline.sections.single.entries.length, 1);
    expect(outline.sections.single.entries.single.quizzes, isEmpty);
  });
}
