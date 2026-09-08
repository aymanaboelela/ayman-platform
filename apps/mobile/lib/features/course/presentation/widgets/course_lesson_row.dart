import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/functions/format_duration.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/media/lesson_kind_icon.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/course_outline.dart';
import 'course_lesson_action.dart';

/// One lesson in the outline: a kind glyph, a title, a meta line, one control.
///
/// ## Why the state is a WORD and not only a colour
///
/// It used to say «خلصت» on the finished rows and nothing on the rest, which
/// was survivable only while the padlock was doing the telling: a run of locks
/// with one open row at the front answered "where am I" by the shape of the
/// column. Every lecture opens the day a student enrols now, so the shape says
/// nothing and every row has to state where the student stands — «بس ابقى
/// علّم عليها إن هو ما شافهاش». A word also survives being read aloud, printed,
/// or looked at by someone who cannot separate two greys.
///
/// The locked exam is the exception: its control already reads «مقفول» two
/// columns over, and «لسه ما امتحنتش» beside it would answer a question the
/// row has already answered.
class CourseLessonRow extends StatelessWidget {
  const CourseLessonRow({
    required this.lesson,
    required this.onOpen,
    this.isQuiz = false,
    super.key,
  });

  final OutlineLesson lesson;

  /// A quiz hanging off the lecture above it — indented, and not numbered.
  final bool isQuiz;

  /// Null when the row cannot be opened — the locked exam.
  final VoidCallback? onOpen;

  /// «المحاضرة ٣ · ٣٩ دقيقة · لسه ماشوفتهاش», joined rather than laid out.
  ///
  /// A flex row of four small spans wrapped raggedly on a phone, and every
  /// part of this is short. A quiz does NOT restate «المحاضرة ٢»: it is
  /// already sitting under that lecture and its own title names it — repeating
  /// the number is what made a three-lecture course read as five.
  String _meta() {
    return [
      isQuiz
          ? tr(CopyKeys.libraryLessonQuiz)
          : tr(CopyKeys.libraryLessonIndex, namedArgs: {'n': '${lesson.index}'}),
      if (lesson.isExam) tr(CopyKeys.libraryExam),
      if (lesson.durationSeconds != null && lesson.durationSeconds! > 0)
        formatDuration(lesson.durationSeconds!),
      // No gate at all → signed in, not enrolled in THIS course. The marker is
      // suppressed for the same reason the unit counter prints «٥ محاضرات»
      // instead of «٠ / ٥» before enrolling: «لسه ماشوفتهاش» on forty rows
      // tells someone still deciding whether to start that they have failed at
      // forty things. Nothing has happened because nothing COULD have.
      if (lesson.gate != null && lesson.gate != 'locked') _stateLabel(),
    ].join(' · ');
  }

  /// Kind-aware on the one axis Arabic forces: «ماشوفتهاش» is the wrong verb
  /// for a paper, so a quiz says «لسه ما امتحنتش» instead. None of the three is
  /// an imperative — the platform never addresses a student by gender.
  String _stateLabel() => switch (lesson.mark) {
        LessonStateMark.done => tr(CopyKeys.libraryLessonDone),
        LessonStateMark.started => tr(CopyKeys.libraryLessonStarted),
        LessonStateMark.isNew => tr(
            lesson.isQuiz
                ? CopyKeys.libraryLessonQuizNew
                : CopyKeys.libraryLessonNew,
          ),
      };

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final locked = lesson.gate == 'locked';

    return Padding(
      padding: EdgeInsetsDirectional.only(
        // The indent IS the nesting. A quiz is not the next thing in the
        // course, it is the check on the thing above it.
        start: isQuiz ? AppSpacing.x24 : 0,
        bottom: AppSpacing.x8,
      ),
      child: Opacity(
        opacity: locked ? 0.65 : 1,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          spacing: AppSpacing.x12,
          children: [
            Container(
              width: 32,
              height: 32,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: c.studyTint,
                borderRadius: AppRadius.smAll,
              ),
              child: LessonKindIcon(kind: lesson.kind, size: 16),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: AppSpacing.x2,
                children: [
                  // The title WRAPS — no ellipsis. It is how a student
                  // identifies the lecture, and between the well and the chip
                  // it has about 150pt on a phone, which turns «الكورس
                  // التأسيسي لمادة البرمجة — المحاضرة الأولى» into «الكورس
                  // التأسي…».
                  Text(
                    lesson.title,
                    style: type.bodySm(
                      color: c.fg,
                      weight: AppTextStyle.medium,
                    ),
                  ),
                  // The meta keeps truncating: it is already short and nothing
                  // is lost if its tail goes.
                  Text(
                    _meta(),
                    style: type.numeric(color: c.fgMuted, size: 11),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            CourseLessonAction(lesson: lesson, onPressed: onOpen),
          ],
        ),
      ),
    );
  }
}
