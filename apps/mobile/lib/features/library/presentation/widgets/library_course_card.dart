import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/functions/format_duration.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/feedback/app_progress_meter.dart';
import '../../../../core/presentation/widgets/media/course_art.dart';
import '../../../../core/presentation/widgets/surfaces/app_panel.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/library_course.dart';
import 'library_course_cta.dart';
import 'library_course_meta.dart';

/// One course, as the signed-in student sees it.
///
/// Deliberately NOT the marketing catalogue card. That one sells a course to a
/// stranger — a price, a free badge, an outline CTA. This one answers a
/// different question: how far am I through this, and what is the one thing to
/// press. Sharing a component would mean a card that does neither job well,
/// which is exactly how the product and the landing page drifted apart in the
/// first place.
///
/// ## The one state that changes the card
///
/// Enrolment. An enrolled course carries a progress bar and resumes at the
/// next lesson; an unenrolled one carries neither and points at the course
/// page, which is where enrolling happens. Everything else — art, title, meta
/// — is identical, so a column of both still reads as one set.
class LibraryCourseCard extends StatelessWidget {
  const LibraryCourseCard({required this.course, super.key});

  final LibraryCourse course;

  /// Both destinations stay INSIDE the shell: the player for a course already
  /// under way, the in-shell course page otherwise.
  ///
  /// ⚠️ Never the public `/courses/:slug`. That is the page for someone
  /// arriving from Google, and sending a signed-in student to it is the whole
  /// bug the in-shell library exists to fix.
  String get _href => course.nextLessonId != null
      ? AppRoutes.lessonOf(course.slug, course.nextLessonId!)
      : AppRoutes.courseDetailOf(course.slug);

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return AppPanel(
      padding: EdgeInsets.zero,
      clip: true,
      onTap: () => context.go(_href),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          CourseArt(
            subjectNameAr: course.subjectNameAr,
            coverKey: course.coverKey,
            // The SLUG seeds the shapes, matching the web. Two «برمجة» courses
            // must share a hue — that is what makes the subject legible — and
            // must not be the same picture.
            seed: course.slug,
            aspectRatio: 16 / 8,
            // Square: the panel already clips, and rounding the art as well
            // leaves four pale notches where the two radii disagree.
            borderRadius: BorderRadius.zero,
          ),
          Padding(
            padding: const EdgeInsets.all(AppSpacing.cardInset),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: AppSpacing.x12,
              children: [
                Text(
                  course.title,
                  style: type.title4Style(color: c.fg),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                LibraryCourseMeta(
                  lessonCount: course.lessonCount,
                  duration: formatDuration(course.totalSeconds),
                ),
                if (course.isEnrolled)
                  _LibraryCourseProgress(course: course)
                else
                  Text(
                    tr(CopyKeys.libraryNotStarted),
                    style: type.bodySm(color: c.fgMuted),
                  ),
                LibraryCourseCta(course: course, onPressed: () => context.go(_href)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// The progress line on an enrolled card: a word, a fraction and a bar.
class _LibraryCourseProgress extends StatelessWidget {
  const _LibraryCourseProgress({required this.course});

  final LibraryCourse course;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final percent = course.progressPercent ?? 0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.x8,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: Text(
                // ⚠️ Two different "finished" states, and the words differ.
                //
                // A course still being recorded says «خلّصت اللي نزل»; only a
                // course whose content is complete says «خلصت الكورس». Saying
                // the second when the first is true tells a student a course is
                // over while three lectures are still to come.
                course.isDone
                    ? tr(
                        course.contentComplete
                            ? CopyKeys.libraryCourseDone
                            : CopyKeys.libraryCourseUpToDate,
                      )
                    : tr(
                        CopyKeys.libraryPercentDone,
                        namedArgs: {'percent': '${percent.round()}'},
                      ),
                style: course.isDone
                    // The ONE place green is spent on this screen. Every other
                    // state stays neutral so «خلصت» is the only word that
                    // turns.
                    ? type.bodySm(color: c.ok, weight: AppTextStyle.medium)
                    : type.bodySm(color: c.fgMuted),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: AppSpacing.x8),
            Text(
              '${course.clearedLessons} / ${course.lessonCount}',
              style: type.numeric(color: c.accentText, size: 13),
            ),
          ],
        ),
        AppProgressMeter(value: percent / 100),
      ],
    );
  }
}
