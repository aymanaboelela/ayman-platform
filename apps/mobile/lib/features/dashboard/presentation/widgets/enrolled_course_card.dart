import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/extensions/navigation_extension.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/buttons/course_resume_button.dart';
import '../../../../core/presentation/widgets/feedback/app_badge.dart';
import '../../../../core/presentation/widgets/feedback/app_progress_meter.dart';
import '../../../../core/presentation/widgets/media/subject_artwork.dart';
import '../../../../core/presentation/widgets/surfaces/app_panel.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/enrolled_course.dart';

/// One of «كورساتي».
///
/// ## Why there is artwork on it
///
/// Almost no course has a `coverKey`, so the coverless case IS the normal
/// case. Four enrolled courses used to be four identical grey rectangles over
/// half the screen, and generated per-subject artwork fixed more of «شكلها وحش
/// ومصمطة» than any palette change did. [SubjectArtwork] is keyed on
/// `subjectNameAr`, so «فيزياء» is the same colour on every screen it appears.
///
/// ## Why there is a button on it
///
/// Asked for by name, repeatedly: a button on every row, «مشاهدة» and
/// «امتحن». A card that is merely tappable with a chevron reads as a list
/// item; a card with a labelled action reads as something you do.
class EnrolledCourseCard extends StatelessWidget {
  const EnrolledCourseCard({required this.course, super.key});

  final EnrolledCourse course;

  /// Where «نكمّل» goes.
  ///
  /// Resumes at the last lesson when there is one, otherwise opens the course
  /// page. It must NEVER send an enrolled student to the PUBLIC `/courses/:slug`
  /// marketing page — that is `enrolledCourseHref`'s whole reason for existing
  /// on the web.
  String get _href => course.lastLessonId != null
      ? AppRoutes.lessonOf(course.slug, course.lastLessonId!)
      : AppRoutes.courseDetailOf(course.slug);

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return AppPanel(
      padding: EdgeInsets.zero,
      clip: true,
      onTap: course.isOpenable ? () => context.open(_href) : null,
      child: Opacity(
        // An unpublished course is SHOWN, dimmed and unopenable, rather than
        // hidden. The student paid for it and needs to see that it is coming.
        opacity: course.isOpenable ? 1 : 0.6,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SubjectArtwork(
              subject: course.subjectNameAr,
              // The course id, not the subject, seeds the SHAPES: two physics
              // courses must share a hue — that is the point — but must not be
              // the same picture.
              seed: course.id,
              // Square top corners: the panel clips, and rounding the artwork
              // as well leaves four pale notches where the two radii disagree.
              borderRadius: BorderRadius.zero,
            ),
            Padding(
              padding: const EdgeInsets.all(AppSpacing.cardInset),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          course.title,
                          style: type.title4Style(color: c.fg),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (!course.isOpenable) ...[
                        const SizedBox(width: AppSpacing.x8),
                        AppBadge(
                          label: tr(CopyKeys.pathClosedBadge),
                          icon: Icons.lock_outline_rounded,
                        ),
                      ] else if (course.isComplete) ...[
                        const SizedBox(width: AppSpacing.x8),
                        AppBadge(
                          label: tr(CopyKeys.dashboardCourseDone),
                          tone: AppBadgeTone.ok,
                          icon: Icons.check_rounded,
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: AppSpacing.x12),

                  Row(
                    children: [
                      Text(
                        // «١٢ من ٣٠ درس» — the count first, because that is
                        // the thing the student is looking for.
                        '${course.completedLessons} '
                        '${tr(CopyKeys.dashboardLessonsOf)} '
                        '${course.totalLessons} ${tr(CopyKeys.dashboardLessonsWord)}',
                        style: type.bodyXs(color: c.fgMuted),
                      ),
                      const Spacer(),
                      Text(
                        '${course.progressPercent.round()}٪',
                        style: type.numeric(color: c.accentText, size: 13),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.x8),

                  // The SERVER's percent for the bar, but never for the
                  // completion test — see `EnrolledCourse.progressPercent`.
                  AppProgressMeter(value: course.progressPercent / 100),

                  if (course.isOpenable) ...[
                    const SizedBox(height: AppSpacing.x16),
                    SizedBox(
                      width: double.infinity,
                      child: CourseResumeButton(
                        // Three labels, because «نكمّل» is wrong for two of
                        // the three states and was shipped that way first:
                        // a FINISHED course said "continue" next to a badge
                        // reading «الكورس ده خلص», which contradicts itself
                        // on one line.
                        label: course.isComplete
                            ? tr(CopyKeys.libraryReview) // «مراجعة»
                            : course.lastLessonId != null
                                ? tr(CopyKeys.dashboardContinueCta) // «نكمّل»
                                : tr(CopyKeys.dashboardContinueCourse),
                        icon: course.isComplete
                            ? Icons.replay_rounded
                            : Icons.play_arrow_rounded,
                        onPressed: () => context.open(_href),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
