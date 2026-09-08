import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/data/exception/failure.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/extensions/navigation_extension.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/feedback/app_error_view.dart';
import '../../../../core/presentation/widgets/feedback/app_skeleton_list.dart';
import '../../../../core/presentation/widgets/feedback/app_snack.dart';
import '../../../../core/presentation/widgets/layout/app_screen.dart';
import '../../../../core/presentation/widgets/media/app_rich_text.dart';
import '../../../../core/presentation/widgets/surfaces/course_group_card.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../../payments/presentation/widgets/subscribe_sheet.dart';
import '../../domain/entities/course_outline.dart';
import '../../domain/repositories/course_repository.dart';
import '../cubit/course_cubit.dart';
import '../widgets/course_empty_panel.dart';
import '../widgets/course_outline_view.dart';
import '../widgets/course_progress_panel.dart';
import '../widgets/course_stage.dart';
import '../widgets/course_start_panel.dart';
import '../widgets/locked_exam_sheet.dart';

/// A course, as the student studying it sees it: the outline with every lesson
/// in the state the gate actually enforces, and a lock that says what it is
/// waiting for.
///
/// ## Why this is not the public course page
///
/// Same reason «الكورسات» is not the marketing catalogue. The public page
/// renders one document for every visitor — that is what makes its start
/// button branch on CLICK rather than on render. This one is different for
/// every student on every request, because that is what a gate means.
class CoursePage extends StatelessWidget {
  const CoursePage({required this.slug, super.key});

  final String slug;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => CourseCubit(sl<CourseRepository>(), slug)..load(),
      child: const _CourseView(),
    );
  }
}

class _CourseView extends StatelessWidget {
  const _CourseView();

  /// Opens a lesson, or explains the lock.
  ///
  /// The locked exam is the ONE row the gate can still close, and it gets a
  /// sheet rather than a navigation: `/courses/:slug/lessons/:id` re-derives
  /// the gate and 404s it, so following the link would replace an explanation
  /// with an error page.
  void _openLesson(BuildContext context, CourseReady state, OutlineLesson lesson) {
    final view = state.view;
    if (lesson.gate == 'locked') {
      LockedExamSheet.show(
        context,
        remaining:
            (view.outline.totalLessons - view.outline.clearedLessons).clamp(0, 1 << 30),
        total: view.outline.totalLessons,
        left: view.outline.remainingLectures,
        onOpenLecture: (lecture) => context.open(
          AppRoutes.lessonOf(view.course.slug, lecture.id),
        ),
      );
      return;
    }

    context.open(AppRoutes.lessonOf(view.course.slug, lesson.id));
  }

  /// «نبدأ الكورس» — enrol, then go where the server says.
  Future<void> _start(BuildContext context) async {
    final outcome = await context.read<CourseCubit>().enroll();
    if (!context.mounted) return;

    switch (outcome) {
      case CourseEnrollStarted(:final lessonId):
        final state = context.read<CourseCubit>().state;
        if (state is CourseReady) {
          context.open(AppRoutes.lessonOf(state.view.course.slug, lessonId));
        }
      case CourseEnrollNeedsSubscription():
        // ⚠️ The sheet opens on the SERVER's 403, never on prices read at
        // render — a course can be priced and this student already entitled,
        // and only the enrolment call knows which.
        final state = context.read<CourseCubit>().state;
        if (state is! CourseReady) return;
        final filed = await SubscribeSheet.show(context, state.view.course);
        // A filed submission does not grant access — it goes to review — but
        // it does change what this page should say, so the page re-reads
        // rather than sitting on a state the student has just acted on.
        if (filed && context.mounted) {
          await context.read<CourseCubit>().refresh();
        }
      case CourseEnrollFailed(:final message):
        AppSnack.show(context, message, tone: AppSnackTone.err);
      case CourseEnrollBusy():
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<CourseCubit, CourseState>(
      builder: (context, state) {
        return AppScreen.slivers(
          title: switch (state) {
            CourseReady(:final view) => view.course.title,
            _ => tr(CopyKeys.libraryTitle),
          },
          // ⚠️ No head block: the ember STAGE band below is this screen's
          // header and it carries the title. Drawn as well, the course name
          // appeared twice — once as the page heading and again in the band
          // four lines under it.
          showHead: false,
          // ⚠️ NO `onBack`, and therefore no app bar. This route renders
          // inside the tab shell, which already draws a top bar; a second one
          // under it was two bands of chrome over a page whose own header is
          // the stage band. The way back is a link INSIDE that band, exactly
          // as on the web.
          onRefresh: context.read<CourseCubit>().refresh,
          slivers: switch (state) {
            CourseLoading() => const [_CourseSkeleton()],
            CourseFailed(:final failure) => [_CourseError(failure: failure)],
            CourseReady() => _courseSlivers(context, state),
          },
        );
      },
    );
  }

  /// ⚠️ A list of SLIVERS, not a widget-returning method — see the same note
  /// on the library page. A widget can contribute exactly one sliver, and the
  /// outline has to stay lazy.
  List<Widget> _courseSlivers(BuildContext context, CourseReady state) {
    final view = state.view;
    final course = view.course;
    final outline = view.outline;

    return [
      SliverToBoxAdapter(
        child: CourseStage(course: course, lessonCount: outline.totalLessons),
      ),
      const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.sectionGap)),

      SliverToBoxAdapter(
        // ⚠️ The EMPTY case is checked before the enrolled/not-enrolled split,
        // because the answer is the same either way: there is nothing to enrol
        // in and nothing to resume.
        child: outline.isEmpty
            ? CourseEmptyPanel(
                comingSoonNote: course.comingSoonNote,
                onBrowse: () => context.open(AppRoutes.library),
              )
            : outline.enrolled
                ? CourseProgressPanel(
                    outline: outline,
                    contentComplete: course.contentComplete,
                    onResume: outline.nextLessonId == null
                        ? null
                        : () => context.open(
                              AppRoutes.lessonOf(
                                course.slug,
                                outline.nextLessonId!,
                              ),
                            ),
                  )
                : CourseStartPanel(
                    isPriced: course.isPriced,
                    pending: state.enrolling,
                    onStart: () => _start(context),
                  ),
      ),

      // «جروب الدفعة» sits ABOVE the description and the outline: a student
      // arriving at their own course page is more often looking for «فين
      // الجروب» than for the syllabus they have already read.
      if (view.whatsappGroupUrl != null) ...[
        const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.sectionGap)),
        SliverToBoxAdapter(child: CourseGroupCard(url: view.whatsappGroupUrl)),
      ],

      if (course.description != null && course.description!.isNotEmpty) ...[
        const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.sectionGap)),
        SliverToBoxAdapter(child: AppRichText(html: course.description!)),
      ],

      // Skipped outright when the course is empty — the panel above already
      // says it once, in words, and «محتوى الكورس» over «٠ محاضرة» over nothing
      // is the same fact told badly three times.
      //
      // Also skipped for a PRICED course this student has not subscribed to:
      // every row would offer a button that 403s the same generic way. Free
      // courses are unaffected — nothing in them opens until «نبدأ» is pressed
      // anyway, and the outline is what a student decides on.
      if (!outline.isEmpty && (outline.enrolled || !course.isPriced)) ...[
        const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.sectionGap)),
        SliverToBoxAdapter(
          child: CourseOutlineView(
            outline: outline,
            onOpenLesson: (lesson) => _openLesson(context, state, lesson),
          ),
        ),
      ] else if (!outline.isEmpty) ...[
        const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.sectionGap)),
        const SliverToBoxAdapter(child: _OutlineLockedNote()),
      ],
    ];
  }
}

/// «محتوى الدروس بيظهر بعد ما تشترك.» — why a priced course shows no outline.
///
/// Said out loud rather than left as an absence: a page that simply stops
/// after the price reads as one that failed to load the rest.
class _OutlineLockedNote extends StatelessWidget {
  const _OutlineLockedNote();

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Text(
      tr(CopyKeys.courseLessonsLockedNote),
      style: type.bodySm(color: c.fgMuted),
    );
  }
}

/// Shaped like the real page — a band, a panel, then units.
class _CourseSkeleton extends StatelessWidget {
  const _CourseSkeleton();

  @override
  Widget build(BuildContext context) {
    return const SliverToBoxAdapter(
      child: Column(
        children: [
          AppSkeletonList(rows: 1, rowHeight: 220, spacing: AppSpacing.x12),
          SizedBox(height: AppSpacing.sectionGap),
          AppSkeletonList(rows: 1, rowHeight: 120, spacing: AppSpacing.x12),
          SizedBox(height: AppSpacing.sectionGap),
          AppSkeletonList(rows: 3, rowHeight: 72, spacing: AppSpacing.stackGap),
        ],
      ),
    );
  }
}

/// The catalogue could not be read — including a slug that matches nothing.
class _CourseError extends StatelessWidget {
  const _CourseError({required this.failure});

  final Failure failure;

  @override
  Widget build(BuildContext context) {
    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.only(top: AppSpacing.x32),
        child: AppErrorView(
          failure: failure,
          onRetry: context.read<CourseCubit>().load,
        ),
      ),
    );
  }
}
