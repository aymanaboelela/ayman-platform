import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/course_outline.dart';
import 'course_lesson_row.dart';

/// One unit of the course, collapsible.
///
/// ## Why a section collapses at all
///
/// A forty-lesson course was one uninterrupted column of rows: correct, and
/// unreadable. A real container with a filled header and its own counter, with
/// all but one collapsed, turns the page into something a student can hold in
/// their head.
///
/// Which one opens is not a preference: the section holding the next lesson is
/// where the student left off, so that is the one already open when the page
/// paints. Nothing in progress → the first section, because that is where a
/// new student starts.
class CourseUnit extends StatefulWidget {
  const CourseUnit({
    required this.section,
    required this.enrolled,
    required this.initiallyOpen,
    required this.onOpenLesson,
    super.key,
  });

  final OutlineSection section;

  /// Before enrolling the counter states the SIZE rather than the progress.
  final bool enrolled;

  final bool initiallyOpen;

  /// Null for a row the gate has closed.
  final void Function(OutlineLesson lesson) onOpenLesson;

  @override
  State<CourseUnit> createState() => _CourseUnitState();
}

class _CourseUnitState extends State<CourseUnit>
    with SingleTickerProviderStateMixin {
  late bool _open = widget.initiallyOpen;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final section = widget.section;

    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.stackGap),
      decoration: BoxDecoration(
        color: c.surface2,
        borderRadius: AppRadius.lgAll,
        border: Border.all(color: c.studyLine),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ⚠️ The header is EMBER and it IS pressable — the one deliberate
          // exception to "ember is never a control". A disclosure is not an
          // action on the course, it is a way of looking at it, and the
          // chevron is what says so. Nothing else in this container may be
          // ember and tappable.
          Material(
            color: c.studyTint,
            child: InkWell(
              onTap: () => setState(() => _open = !_open),
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.x16),
                child: Row(
                  spacing: AppSpacing.x12,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        spacing: AppSpacing.x2,
                        children: [
                          Text(
                            section.title,
                            style: type.title4Style(color: c.fg),
                          ),
                          if (section.summary != null)
                            Text(
                              section.summary!,
                              style: type.bodyXs(color: c.fgMuted),
                            ),
                        ],
                      ),
                    ),
                    Text(
                      // «٣ / ٥» only means something once there is progress to
                      // count. Before enrolling every section would read
                      // «٠ / ٥», which says "you have failed at nothing yet",
                      // so it states the size instead.
                      widget.enrolled
                          ? '${section.clearedCount} / ${section.entries.length}'
                          : tr(
                              CopyKeys.libraryLessonCount,
                              namedArgs: {'n': '${section.entries.length}'},
                            ),
                      style: type.numeric(color: c.study, size: 12),
                    ),
                    AnimatedRotation(
                      turns: _open ? 0.5 : 0,
                      duration: const Duration(milliseconds: 160),
                      child: Icon(
                        Icons.keyboard_arrow_down_rounded,
                        size: 20,
                        color: c.fgMuted,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          // Built only while open. A forty-lesson course with six units would
          // otherwise construct every row on first paint just to hide five
          // sixths of them.
          if (_open)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.x12,
                AppSpacing.x12,
                AppSpacing.x12,
                AppSpacing.x4,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final entry in section.entries) ...[
                    CourseLessonRow(
                      lesson: entry.lecture,
                      onOpen: entry.lecture.gate == 'locked'
                          ? null
                          : () => widget.onOpenLesson(entry.lecture),
                    ),
                    for (final quiz in entry.quizzes)
                      CourseLessonRow(
                        lesson: quiz,
                        isQuiz: true,
                        onOpen: quiz.gate == 'locked'
                            ? null
                            : () => widget.onOpenLesson(quiz),
                      ),
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }
}
