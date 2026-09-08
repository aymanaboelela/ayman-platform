import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/layout/app_bottom_sheet.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/course_outline.dart';

/// WHY the final exam is shut, and what is left to do about it.
///
/// ## It is the only padlock left
///
/// This once explained any locked lesson and named the exact one standing in
/// the way. That explanation existed for a sequential chain, and the chain is
/// gone: every lecture and every lecture quiz opens the day a student enrols.
/// The gate can return `locked` for exactly one row in a course, so this has
/// exactly one thing to say.
///
/// ## And it carries NO way out
///
/// It used to offer «نفتحها دلوقتي», linking to the nearest unfinished lesson
/// above the locked one — which, in the ordinary case, is the page the student
/// is already on. Pressing it navigated to the current route, so nothing moved
/// and nothing was said. Reported exactly that way: «الـ٢ بتن دول مش شغالين».
///
/// So: a sheet that explains a block carries no control that lands the student
/// where they already are. What is left is a dismiss, the count, and the names
/// — because «متسيبش حاجة مشفتهاش»: a student with three lectures outstanding
/// in a forty-row outline can read «باقي ٣» and still not know where they are.
///
/// ⚠️ Nothing here grants or denies access. The gate is re-derived by
/// `/courses/:slug/lessons/:id` on every request, which 404s the locked exam.
class LockedExamSheet extends StatelessWidget {
  const LockedExamSheet({
    required this.remaining,
    required this.total,
    required this.left,
    required this.onOpenLecture,
    super.key,
  });

  /// Lectures still to clear, and how many there are in all.
  ///
  /// LECTURES, not rows: quizzes are in neither number and are not in the
  /// exam's prerequisite set either. Both come from the same cleared/total
  /// pair the progress bar on the same screen is drawn from, so the sheet and
  /// the bar cannot disagree about what is left.
  final int remaining;
  final int total;

  /// Which lectures, in course order.
  final List<RemainingLecture> left;

  final void Function(RemainingLecture lecture) onOpenLecture;

  /// Long courses: the point is to name what is left, not to reprint the
  /// outline the student is already looking at. Past this the sheet says how
  /// many more there are and lets the page itself do the rest.
  static const _maxShown = 8;

  static Future<void> show(
    BuildContext context, {
    required int remaining,
    required int total,
    required List<RemainingLecture> left,
    required void Function(RemainingLecture lecture) onOpenLecture,
  }) {
    return AppBottomSheet.show<void>(
      context,
      title: tr(CopyKeys.libraryLockedExamTitle),
      builder: (context) => LockedExamSheet(
        remaining: remaining,
        total: total,
        left: left,
        onOpenLecture: onOpenLecture,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final shown = left.take(_maxShown).toList();
    final hidden = left.length - shown.length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.x16,
      children: [
        Text(
          // The count is the headline — but only when there IS one. A screen
          // that does not hold the numbers states the rule without them rather
          // than printing a wrong count.
          remaining > 0 && total > 0
              ? tr(
                  CopyKeys.libraryLockedExamBody,
                  namedArgs: {'remaining': '$remaining', 'total': '$total'},
                )
              : tr(CopyKeys.libraryLockedExamBodyPlain),
          style: type.body(color: c.fgMuted),
        ),

        if (shown.isNotEmpty) ...[
          Text(
            tr(CopyKeys.libraryLockedExamLeftTitle),
            style: type.bodySm(color: c.fgMuted),
          ),
          for (final lecture in shown)
            _RemainingLectureRow(
              lecture: lecture,
              onTap: () {
                Navigator.of(context).pop();
                onOpenLecture(lecture);
              },
            ),
          if (hidden > 0)
            Text(
              tr(CopyKeys.libraryLockedExamLeftMore, namedArgs: {'n': '$hidden'}),
              style: type.bodySm(color: c.fgMuted),
            ),
        ],

        SizedBox(
          height: AppSpacing.minTap,
          child: OutlinedButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(tr(CopyKeys.libraryLockedClose)),
          ),
        ),
      ],
    );
  }
}

/// One lecture the exam is waiting on — its title, its number, and whether it
/// was ever opened.
class _RemainingLectureRow extends StatelessWidget {
  const _RemainingLectureRow({required this.lecture, required this.onTap});

  final RemainingLecture lecture;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Material(
      color: c.surface3,
      borderRadius: AppRadius.mdAll,
      child: InkWell(
        onTap: onTap,
        borderRadius: AppRadius.mdAll,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.x12,
            vertical: AppSpacing.x8,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            spacing: AppSpacing.x2,
            children: [
              Text(
                lecture.title,
                style: type.bodySm(color: c.fg),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              Text(
                '${tr(CopyKeys.libraryLessonIndex, namedArgs: {'n': '${lecture.index}'})}'
                ' · '
                '${tr(lecture.started ? CopyKeys.libraryLessonStarted : CopyKeys.libraryLessonNew)}',
                style: type.numeric(color: c.fgMuted, size: 11),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
