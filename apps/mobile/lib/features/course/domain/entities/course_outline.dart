import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

/// What a row says about the student, once nothing on it is hidden.
enum LessonStateMark { done, started, isNew }

/// One lesson in the outline: the catalogue's row joined to the gate the
/// server enforces and to what this student has done with it.
@immutable
class OutlineLesson extends Equatable {
  const OutlineLesson({
    required this.id,
    required this.title,
    required this.kind,
    required this.isExam,
    required this.index,
    this.durationSeconds,
    this.gate,
    this.state,
  });

  final String id;
  final String title;

  /// `video` | `quiz` | `attachment` | `text`.
  final String kind;

  final int? durationSeconds;

  /// The course's final exam.
  final bool isExam;

  /// `cleared` | `available` | `locked`, or null when the student is not
  /// enrolled — nothing has a state yet.
  final String? gate;

  /// 1-based place in the WHOLE course, so «المحاضرة ٧» keeps counting across
  /// sections. ⚠️ Counts LECTURES only — a quiz takes its lecture's number.
  final int index;

  /// `LessonProgress.state`, or null before enrolment.
  ///
  /// The gate alone cannot tell «لسه ما امتحنتش» from «امتحنت ورسبت»: both are
  /// `available`. A lecture quiz allows ONE sitting, so offering «امتحن» to a
  /// student who has already sat it is an invitation to an act they cannot
  /// perform.
  final String? state;

  bool get isQuiz => kind == 'quiz';

  /// Whether this row is OVER — nothing the student can do will change it.
  ///
  /// ## Why this is not simply `gate == 'cleared'`
  ///
  /// A quiz has a way of ending that a lecture does not. `cleared` means the
  /// state is `completed` or `passed`, so a lecture quiz sat and FAILED stays
  /// `available` forever — and every outline drew it as unfinished: no tick,
  /// and the amber chip that means "this is the thing that moves you forward".
  /// It is not. A lecture quiz allows exactly ONE sitting, so once it is sat
  /// there is nothing left to do with the row but read the result.
  ///
  /// ⚠️ PRESENTATION ONLY. Every COUNT still uses the gate — `clearedLessons`,
  /// the section fraction and the progress bar all count `cleared`, because a
  /// failed quiz is not a pass.
  ///
  /// ## The exam is excluded on purpose
  ///
  /// A course exam can offer a second, IMPROVEMENT sitting, and this payload
  /// carries nothing that says whether it is still there. Ticking it would
  /// tell a student who can still raise their grade that they are done — the
  /// expensive direction of this mistake — so the exam ticks only on a pass.
  bool get isFinished {
    if (gate == 'cleared' || state == 'completed' || state == 'passed') {
      return true;
    }
    return isQuiz && !isExam && state == 'failed';
  }

  /// Has the student been here — and why this is a THIRD state rather than the
  /// negation of [isFinished].
  ///
  /// `in_progress` is written by the video heartbeat and by dwell on a
  /// reading, so it means the student genuinely opened the lesson and did not
  /// finish it. Telling them «لسه ماشوفتهاش» about a lecture they watched half
  /// of is a small lie that costs the marker its credibility on the rows that
  /// matter — and the half-watched lecture is exactly the row a student is
  /// looking for when they come back.
  LessonStateMark get mark {
    if (isFinished) return LessonStateMark.done;
    return state == 'in_progress'
        ? LessonStateMark.started
        : LessonStateMark.isNew;
  }

  @override
  List<Object?> get props => [id, title, kind, gate, state, index, isExam];
}

/// A lecture, with the quiz that belongs to it.
///
/// The database stores the quiz as its own lesson row — its own id, its own
/// gate, its own progress — but it is not a STEP of the course. It is the
/// check on the lecture above it, and the outline draws it that way: indented
/// under its lecture, sharing its number, and never counted.
///
/// Ownership is ADJACENCY in reading order: a quiz belongs to the nearest
/// lecture before it in the same section. That is exactly the relationship the
/// server's gate uses to decide when the quiz opens, so the two cannot
/// disagree about which lecture a quiz hangs off.
@immutable
class OutlineEntry extends Equatable {
  const OutlineEntry({required this.lecture, required this.quizzes});

  final OutlineLesson lecture;
  final List<OutlineLesson> quizzes;

  @override
  List<Object?> get props => [lecture, quizzes];
}

@immutable
class OutlineSection extends Equatable {
  const OutlineSection({
    required this.id,
    required this.title,
    required this.entries,
    this.summary,
  });

  final String id;
  final String title;
  final String? summary;

  /// Lectures, each carrying its own quizzes. Quizzes are never top-level.
  final List<OutlineEntry> entries;

  /// «٢ / ٣» beside the unit title. Counts the GATE, never [OutlineLesson.mark]
  /// — see the note on [OutlineLesson.isFinished].
  int get clearedCount =>
      entries.where((entry) => entry.lecture.gate == 'cleared').length;

  @override
  List<Object?> get props => [id, title, summary, entries];
}

/// A lecture the final exam is still waiting on.
@immutable
class RemainingLecture extends Equatable {
  const RemainingLecture({
    required this.id,
    required this.title,
    required this.index,
    required this.started,
  });

  final String id;
  final String title;

  /// 1-based place in the WHOLE course — the number the row itself shows.
  final int index;

  /// Opened and not finished, vs never opened. Different words, same list.
  final bool started;

  @override
  List<Object?> get props => [id, title, index, started];
}

/// The course outline a signed-in student sees.
@immutable
class CourseOutline extends Equatable {
  const CourseOutline({
    required this.sections,
    required this.enrolled,
    required this.progressPercent,
    required this.clearedLessons,
    required this.totalLessons,
    this.nextLessonId,
  });

  final List<OutlineSection> sections;
  final bool enrolled;
  final double progressPercent;
  final int clearedLessons;
  final int totalLessons;
  final String? nextLessonId;

  bool get isEmpty => totalLessons == 0;

  /// Everything published has been cleared.
  bool get isDone => progressPercent == 100;

  /// The lectures the final exam is still waiting on, in course order.
  ///
  /// The locked-exam dialog used to state a COUNT and nothing else, on the
  /// reasoning that a student four lectures from the end needs the number, not
  /// four titles. That was reported wrong by the person it was written for —
  /// «متسيبش حاجة مشفتهاش»: the count says how many are left but not WHICH, so
  /// a student with three outstanding somewhere in a forty-row outline has to
  /// walk the whole page to find them.
  ///
  /// LECTURES only, exactly like [clearedLessons] and like the gate's own
  /// prerequisite set: quizzes hang off a lecture and are not steps, so a list
  /// that included them would disagree with the number printed beside it in
  /// the same sentence.
  List<RemainingLecture> get remainingLectures {
    return [
      for (final section in sections)
        for (final entry in section.entries)
          if (!entry.lecture.isQuiz && !entry.lecture.isFinished)
            RemainingLecture(
              id: entry.lecture.id,
              title: entry.lecture.title,
              index: entry.lecture.index,
              started: entry.lecture.state == 'in_progress',
            ),
    ];
  }

  @override
  List<Object?> get props => [
    sections,
    enrolled,
    progressPercent,
    clearedLessons,
    totalLessons,
    nextLessonId,
  ];
}
