import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/data/exception/failure.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/feedback/app_empty_state.dart';
import '../../../../core/presentation/widgets/feedback/app_error_view.dart';
import '../../../../core/presentation/widgets/feedback/app_skeleton_list.dart';
import '../../../../core/presentation/widgets/layout/app_screen.dart';
import '../../../../core/presentation/widgets/layout/app_section_header.dart';
import '../../../../core/presentation/widgets/layout/app_sliver_gap.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/library_view.dart';
import '../../domain/repositories/library_repository.dart';
import '../cubit/library_cubit.dart';
import '../widgets/library_identity_strip.dart';
import '../widgets/library_track_cell.dart';
import '../widgets/library_year_section.dart';

/// «الكورسات» — every published course, grouped by year and track, with the
/// student's own first.
///
/// ## Why this is not the marketing catalogue
///
/// They are two answers to two questions. The site's `/courses` sells the
/// catalogue to a stranger and is the page Google indexes. This one lives
/// inside the signed-in shell, because tapping «الكورسات» and being thrown out
/// of the app's own chrome is the complaint that started the work on the web.
class LibraryPage extends StatelessWidget {
  const LibraryPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => LibraryCubit(sl<LibraryRepository>())..load(),
      child: const _LibraryView(),
    );
  }
}

class _LibraryView extends StatelessWidget {
  const _LibraryView();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<LibraryCubit, LibraryState>(
      builder: (context, state) {
        return AppScreen.slivers(
          eyebrow: tr(CopyKeys.libraryEyebrow),
          title: tr(CopyKeys.libraryTitle),
          lead: tr(CopyKeys.librarySubtitle),
          onRefresh: context.read<LibraryCubit>().refresh,
          slivers: switch (state) {
            LibraryLoading() => const [_LibrarySkeleton()],
            LibraryFailed(:final failure) => [_LibraryError(failure: failure)],
            LibraryReady(:final view) => _librarySlivers(view),
          },
        );
      },
    );
  }
}

/// The loaded screen, as slivers.
///
/// ⚠️ A function returning a list of SLIVERS, not a widget-returning method.
/// The house rule bans `_buildX()` because a method that returns a widget
/// hides a rebuild boundary; this returns a *list* that the screen splices
/// into its `CustomScrollView`, and every element of it is a real widget class
/// with a file of its own. There is no other way to contribute several slivers
/// to a parent scroll view — a widget can return exactly one.
List<Widget> _librarySlivers(LibraryView view) {
  return [
    SliverToBoxAdapter(
      child: LibraryIdentityStrip(
        identity: view.identity,
        onboardingCompleted: view.onboardingCompleted,
      ),
    ),
    const AppSliverGap.section(),

    if (view.totalCourses == 0)
      SliverToBoxAdapter(
        child: AppEmptyState(
          icon: Icons.collections_bookmark_outlined,
          title: tr(CopyKeys.libraryEmpty),
        ),
      )
    else ...[
      // Null hides «كورساتك» entirely — a DIFFERENT state from empty, which
      // says "nothing for your year yet" and is only true once we know the
      // year.
      if (view.yours != null) ...[
        SliverToBoxAdapter(
          child: AppSectionHeader(
            title: tr(CopyKeys.libraryYoursTitle),
            note: tr(CopyKeys.libraryYoursLead),
            // No «٠ كورس» over the empty state directly beneath it — the panel
            // already says there is nothing, and a zero beside it is the same
            // fact in a second grammar.
            count: view.yoursCount > 0
                ? tr(
                    CopyKeys.libraryCourseCount,
                    namedArgs: {'n': '${view.yoursCount}'},
                  )
                : null,
          ),
        ),
        if (view.yours!.isEmpty)
          SliverToBoxAdapter(
            child: AppEmptyState(
              icon: Icons.school_outlined,
              title: tr(CopyKeys.libraryYoursEmpty),
              compact: true,
            ),
          )
        else
          for (final track in view.yours!)
            LibraryTrackCell(group: track, alone: view.yours!.length == 1),
        const AppSliverGap.section(),
      ],

      if (view.rest.isNotEmpty) ...[
        // One lead for the WHOLE run rather than one per year — it says the
        // same thing about every group under it, and repeating it three times
        // is how a page starts nagging.
        const SliverToBoxAdapter(child: _LibraryRestLead()),
        for (final year in view.rest) LibraryYearSection(group: year),
      ],
    ],
  ];
}

/// «مفتوحة لك تتفرّج عليها في أي وقت.»
class _LibraryRestLead extends StatelessWidget {
  const _LibraryRestLead();

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.x16),
      child: Text(
        tr(CopyKeys.libraryRestLead),
        style: type.bodySm(color: c.fgMuted),
      ),
    );
  }
}

/// What «الكورسات» looks like while it loads.
///
/// Shaped like the real page — a strip, then cards — rather than a centred
/// spinner, so the layout does not jump when the content arrives and move
/// whatever the student was about to tap.
class _LibrarySkeleton extends StatelessWidget {
  const _LibrarySkeleton();

  @override
  Widget build(BuildContext context) {
    return const SliverToBoxAdapter(
      child: Column(
        children: [
          AppSkeletonList(rows: 1, rowHeight: 72, spacing: AppSpacing.x12),
          SizedBox(height: AppSpacing.sectionGap),
          AppSkeletonList(rows: 3, rowHeight: 220, spacing: AppSpacing.stackGap),
        ],
      ),
    );
  }
}

/// The catalogue or the profile could not be read.
///
/// Only those two get here — a failed path or taxonomy read degrades in the
/// repository and never reaches this branch. See [LibraryRepository.load].
class _LibraryError extends StatelessWidget {
  const _LibraryError({required this.failure});

  final Failure failure;

  @override
  Widget build(BuildContext context) {
    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.only(top: AppSpacing.x32),
        child: AppErrorView(
          failure: failure,
          onRetry: context.read<LibraryCubit>().load,
        ),
      ),
    );
  }
}
