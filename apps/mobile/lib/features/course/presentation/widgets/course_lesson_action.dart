import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/course_outline.dart';

/// The one control on a lesson row.
///
/// ⚠️ Exactly ONE per row. The row itself is never also tappable — two
/// gestures on one row puts every lesson in the accessibility tree twice and
/// reads it twice.
///
/// ## Why «امتحن» and «مشاهدة» are different words
///
/// They are different acts with different stakes: one is a graded, timed
/// sitting that goes on a record, the other is a video that can be closed. A
/// single «فتح» on both is how a student starts an exam by accident.
///
/// ## And why a sat quiz says «نتيجتك»
///
/// «امتحن» is an invitation to START something, and a lecture quiz has exactly
/// one sitting — so offering it to a student who has already sat the quiz asks
/// for a thing the server will refuse: «أقول امتحن، امتحن إزاي، وأنا أصلاً
/// ممتحن». A quiz already taken — passed OR failed — offers the only thing
/// left, which is the result.
class CourseLessonAction extends StatelessWidget {
  const CourseLessonAction({
    required this.lesson,
    required this.onPressed,
    super.key,
  });

  final OutlineLesson lesson;

  /// Null disables the control. The locked exam passes null and shows its own
  /// «مقفول» word.
  final VoidCallback? onPressed;

  String get _label {
    if (lesson.gate == 'locked') return CopyKeys.libraryLessonLocked;
    // A CLEARED row is a revisit, whatever kind it is.
    if (lesson.gate == 'cleared') return CopyKeys.libraryReview;
    if (!lesson.isQuiz) return CopyKeys.libraryWatch;
    final sat = lesson.state == 'failed' || lesson.state == 'passed';
    return sat ? CopyKeys.libraryQuizDone : CopyKeys.libraryTakeQuiz;
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final locked = lesson.gate == 'locked';

    // The amber solid goes on the ONE class of thing that moves a student
    // forward. A finished lesson is a revisit, so it wears the completion
    // green instead — otherwise a finished course is a wall of accent buttons
    // and none of them mean anything.
    final (background, foreground) = switch (lesson) {
      _ when locked => (c.surface3, c.fgMuted),
      _ when lesson.isFinished => (c.ok.withValues(alpha: 0.16), c.ok),
      _ => (c.accent, c.accentContrast),
    };

    return Semantics(
      button: true,
      // The visible word is «مشاهدة» on forty rows; a screen-reader user
      // pulling up the controls list would get forty identical entries. The
      // title is APPENDED, never substituted, so the label still reads first.
      label: '${tr(_label)} — ${lesson.title}',
      child: ExcludeSemantics(
        child: Material(
          color: background,
          borderRadius: AppRadius.smAll,
          child: InkWell(
            onTap: onPressed,
            borderRadius: AppRadius.smAll,
            child: Container(
              height: AppSpacing.minTap,
              constraints: const BoxConstraints(minWidth: 84),
              alignment: Alignment.center,
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.x12),
              child: Text(
                tr(_label),
                style: type.bodySm(
                  color: foreground,
                  weight: AppTextStyle.semibold,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
