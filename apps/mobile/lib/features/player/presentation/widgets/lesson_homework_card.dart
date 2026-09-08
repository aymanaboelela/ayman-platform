import 'dart:io';

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/buttons/app_button.dart';
import '../../../../core/presentation/widgets/feedback/app_badge.dart';
import '../../../../core/presentation/widgets/media/authenticated_image.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/services/media/image_pick_service.dart';
import '../../../../core/services/storage_service/secure_store.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/lesson_player.dart';

/// الواجب — the exercise, the pages handed in, and what came back.
///
/// ## Three states in one card
///
/// Nothing handed in → the upload box. Handed in and waiting → the pages and
/// NO upload box, because a second upload would replace pages أيمن may already
/// be reading. Accepted → no box either; the API refuses a resubmission.
/// «محتاج شغل تاني» reopens the box.
///
/// ## Gender rule, non-negotiable
///
/// The platform never asks whether the student is a boy or a girl, so every
/// imperative is banned — «ارفع» and «سلّمت» grow a ي in the feminine. The copy
/// uses nominal sentences («رفع الصور»), the passive («الواجب اتسلّم») and the
/// ـك suffix on a NOUN. Do not "fix" any of these strings into imperatives.
class LessonHomeworkCard extends StatelessWidget {
  const LessonHomeworkCard({
    required this.homework,
    required this.staged,
    required this.busy,
    required this.error,
    required this.onPick,
    required this.onRemove,
    required this.onSubmit,
    super.key,
  });

  final PlayerHomework homework;

  /// Pages picked but not yet handed in.
  final List<PickedImage> staged;

  /// An upload or a submission is in flight.
  final bool busy;

  /// Already-translated Arabic, or null.
  final String? error;

  final VoidCallback onPick;
  final void Function(PickedImage image) onRemove;
  final VoidCallback onSubmit;

  HomeworkSubmission? get _submission => homework.submission;

  /// The box is open when nothing is in, or when the work came back for more.
  bool get _canSubmit =>
      _submission == null || _submission!.canResubmit;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final submission = _submission;

    return Container(
      decoration: BoxDecoration(
        color: c.surface2,
        borderRadius: AppRadius.lgAll,
        border: Border.all(color: c.studyLine),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // The coloured band — «لو في واجب قولي واجب، يبقى أظهره بشكل كويس
          // وكبير».
          Container(
            color: c.studyTint,
            padding: const EdgeInsets.all(AppSpacing.x16),
            child: Row(
              spacing: AppSpacing.x12,
              children: [
                Icon(Icons.assignment_outlined, size: 20, color: c.study),
                Expanded(
                  child: Text(
                    tr(CopyKeys.homeworkTitle),
                    style: type.title4Style(color: c.fg),
                  ),
                ),
                if (submission != null) _StatusChip(status: submission.status),
              ],
            ),
          ),

          Padding(
            padding: const EdgeInsets.all(AppSpacing.x16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: AppSpacing.x12,
              children: [
                Text(
                  tr(CopyKeys.homeworkLead),
                  style: type.bodySm(color: c.fgMuted),
                ),
                // Newlines PRESERVED, never markup: the body is plain text the
                // instructor typed, and rendering it as HTML would both break
                // the layout and be a hole.
                Text(homework.body, style: type.body(color: c.fg)),

                if (submission != null) _SubmissionSummary(submission: submission),

                if (submission != null && submission.needsWork)
                  Text(
                    tr(CopyKeys.homeworkReopened),
                    style: type.bodySm(color: c.warn),
                  ),

                if (_canSubmit) ...[
                  Text(
                    tr(CopyKeys.homeworkUploadTitle),
                    style: type.bodySm(
                      color: c.fg,
                      weight: AppTextStyle.medium,
                    ),
                  ),
                  Text(
                    tr(
                      CopyKeys.homeworkUploadHint,
                      namedArgs: {'max': '${homework.maxImages}'},
                    ),
                    style: type.bodyXs(color: c.fgMuted),
                  ),
                  if (staged.isNotEmpty)
                    _StagedPages(staged: staged, onRemove: onRemove),
                  AppButton(
                    label: tr(
                      busy ? CopyKeys.homeworkUploading : CopyKeys.homeworkPick,
                    ),
                    icon: Icons.add_photo_alternate_outlined,
                    variant: AppButtonVariant.secondary,
                    onPressed: busy || staged.length >= homework.maxImages
                        ? null
                        : onPick,
                  ),
                  AppButton(
                    label: tr(
                      busy
                          ? CopyKeys.homeworkSubmitting
                          : submission != null
                              ? CopyKeys.homeworkResubmit
                              : CopyKeys.homeworkSubmit,
                    ),
                    icon: Icons.upload_rounded,
                    loading: busy,
                    onPressed: staged.isEmpty || busy ? null : onSubmit,
                  ),
                ],

                if (error != null)
                  Semantics(
                    liveRegion: true,
                    child: Text(error!, style: type.bodySm(color: c.err)),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// «الواجب اتسلّم» / «اتقبل» / «محتاج شغل تاني».
class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final (key, tone) = switch (status) {
      'accepted' => (CopyKeys.homeworkStatusAccepted, AppBadgeTone.ok),
      'needs_work' => (CopyKeys.homeworkStatusNeedsWork, AppBadgeTone.warn),
      _ => (CopyKeys.homeworkStatusPending, AppBadgeTone.neutral),
    };
    return AppBadge(label: tr(key), tone: tone);
  }
}

/// What was handed in, and أيمن's reply.
class _SubmissionSummary extends StatelessWidget {
  const _SubmissionSummary({required this.submission});

  final HomeworkSubmission submission;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.x8,
      children: [
        Text(
          [
            // ⚠️ `imageCount` SURVIVES the purge, and that is why it is
            // printed rather than `imageIds.length`: «ما تبينوش إنها اتمسحت».
            // A student returning in November reads «سلّمت ٣ صور · مقبول» with
            // the mark intact, not an empty card that looks like the platform
            // lost their work.
            tr(
              CopyKeys.homeworkSubmittedCount,
              namedArgs: {'n': '${submission.imageCount}'},
            ),
            if (submission.attempt > 1)
              '${tr(CopyKeys.homeworkAttempt)} ${submission.attempt}',
          ].join(' · '),
          style: type.numeric(color: c.fgMuted, size: 12),
        ),

        if (submission.imagesPurged)
          Text(
            tr(CopyKeys.homeworkImagesGone),
            style: type.bodyXs(color: c.fgMuted),
          )
        else if (submission.imageIds.isNotEmpty)
          SizedBox(
            height: 96,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: submission.imageIds.length,
              separatorBuilder: (_, _) => const SizedBox(width: AppSpacing.x8),
              itemBuilder: (context, index) => ClipRRect(
                borderRadius: AppRadius.mdAll,
                // ⚠️ Through the AUTHENTICATED loader. The route answers
                // `private, no-store` and is scoped to the uploader — handing
                // the URL to a CDN-backed image cache would publish a
                // photograph of somebody's homework.
                child: SizedBox(
                  width: 96,
                  height: 96,
                  child: AuthenticatedImage(
                    path: '/api/homework/images/${submission.imageIds[index]}',
                    store: sl<SecureStore>(),
                    borderRadius: BorderRadius.zero,
                  ),
                ),
              ),
            ),
          ),

        if (submission.reviewNote != null) ...[
          Text(
            tr(CopyKeys.homeworkNote),
            style: type.bodySm(color: c.fg, weight: AppTextStyle.medium),
          ),
          Text(submission.reviewNote!, style: type.bodySm(color: c.fgMuted)),
        ],

        if (submission.grade != null)
          Text(
            tr(
              CopyKeys.homeworkGrade,
              namedArgs: {'grade': '${submission.grade}'},
            ),
            style: type.numeric(color: c.accentText, size: 14),
          ),
      ],
    );
  }
}

/// The pages picked but not yet handed in.
class _StagedPages extends StatelessWidget {
  const _StagedPages({required this.staged, required this.onRemove});

  final List<PickedImage> staged;
  final void Function(PickedImage image) onRemove;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);

    return SizedBox(
      height: 96,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: staged.length,
        separatorBuilder: (_, _) => const SizedBox(width: AppSpacing.x8),
        itemBuilder: (context, index) {
          final image = staged[index];
          return Stack(
            children: [
              ClipRRect(
                borderRadius: AppRadius.mdAll,
                child: Image.file(
                  File(image.path),
                  width: 96,
                  height: 96,
                  fit: BoxFit.cover,
                ),
              ),
              PositionedDirectional(
                top: 0,
                end: 0,
                child: Semantics(
                  button: true,
                  label: tr(CopyKeys.homeworkRemove),
                  child: IconButton(
                    onPressed: () => onRemove(image),
                    iconSize: 16,
                    visualDensity: VisualDensity.compact,
                    style: IconButton.styleFrom(backgroundColor: c.surface1),
                    icon: Icon(Icons.close_rounded, color: c.err),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
