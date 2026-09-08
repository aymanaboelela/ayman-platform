import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/layout/app_section_header.dart';
import '../../domain/entities/course_outline.dart';
import 'course_unit.dart';

/// «محتوى الكورس» — the units, with the one the student is in already open.
///
/// ⚠️ Everything here is a RENDER of a decision the server already made. The
/// gate is re-derived by `/courses/:slug/lessons/:id` on every request, which
/// 404s a locked lesson — expanding a unit unlocks nothing.
class CourseOutlineView extends StatelessWidget {
  const CourseOutlineView({
    required this.outline,
    required this.onOpenLesson,
    super.key,
  });

  final CourseOutline outline;
  final void Function(OutlineLesson lesson) onOpenLesson;

  /// The section the student left off in, or the first.
  ///
  /// Matched against BOTH the lecture and its quizzes: `nextLessonId` can be a
  /// quiz, and a course whose next stop is a quiz would otherwise open the
  /// wrong unit — or, with no match at all, always the first one.
  String? get _openSectionId {
    final next = outline.nextLessonId;
    if (next != null) {
      for (final section in outline.sections) {
        for (final entry in section.entries) {
          if (entry.lecture.id == next ||
              entry.quizzes.any((quiz) => quiz.id == next)) {
            return section.id;
          }
        }
      }
    }
    return outline.sections.isEmpty ? null : outline.sections.first.id;
  }

  @override
  Widget build(BuildContext context) {
    final openId = _openSectionId;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppSectionHeader(
          title: tr(CopyKeys.libraryOutline),
          count: tr(
            CopyKeys.libraryLessonCount,
            namedArgs: {'n': '${outline.totalLessons}'},
          ),
        ),
        for (final section in outline.sections)
          CourseUnit(
            // Keyed on the section id so a refresh that reorders or renames a
            // unit does not carry the previous unit's open/closed state over
            // to whatever now sits in that slot.
            key: ValueKey(section.id),
            section: section,
            enrolled: outline.enrolled,
            initiallyOpen: section.id == openId,
            onOpenLesson: onOpenLesson,
          ),
      ],
    );
  }
}
