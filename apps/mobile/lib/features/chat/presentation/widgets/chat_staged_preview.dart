import 'dart:io';

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../data/models/staged_attachment.dart';

/// The strip above the composer showing a file that is uploaded but not sent.
///
/// The upload and the send are two requests on purpose — the upload can take a
/// while on a slow uplink, and the student should see it finish before they
/// decide what to type. This is what makes that visible instead of the app
/// appearing to hang on the attach button.
///
/// The preview is drawn from the LOCAL file, not from the server: the bytes
/// are already on the phone, and re-downloading a photo the student just took
/// would cost the upload twice.
class ChatStagedPreview extends StatelessWidget {
  const ChatStagedPreview({
    required this.staged,
    required this.previewPath,
    required this.progress,
    required this.uploading,
    required this.onDiscard,
    super.key,
  });

  final StagedAttachment? staged;
  final String? previewPath;
  final double progress;
  final bool uploading;
  final VoidCallback onDiscard;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final isVoice = staged?.isVoice ?? false;

    return Container(
      margin: const EdgeInsets.fromLTRB(
        AppSpacing.x8,
        AppSpacing.x8,
        AppSpacing.x8,
        0,
      ),
      padding: const EdgeInsets.all(AppSpacing.x8),
      decoration: BoxDecoration(
        color: c.surface2,
        borderRadius: AppRadius.mdAll,
        border: Border.all(color: c.line, width: 0.5),
      ),
      child: Row(
        spacing: AppSpacing.x8,
        children: [
          ClipRRect(
            borderRadius: AppRadius.smAll,
            child: SizedBox(
              width: 44,
              height: 44,
              child: isVoice || previewPath == null
                  ? ColoredBox(
                      color: c.surface3,
                      child: Icon(
                        isVoice ? Icons.mic_rounded : Icons.image_outlined,
                        color: c.fgMuted,
                        size: 20,
                      ),
                    )
                  : Image.file(File(previewPath!), fit: BoxFit.cover),
            ),
          ),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  uploading
                      ? tr(CopyKeys.assistantThreadUploading)
                      : isVoice
                          ? tr(CopyKeys.assistantThreadStagedVoice)
                          : tr(CopyKeys.assistantThreadStagedImage),
                  style: type.bodySm(color: c.fg, weight: AppTextStyle.medium),
                ),
                if (uploading) ...[
                  const SizedBox(height: AppSpacing.x4),
                  ClipRRect(
                    borderRadius: AppRadius.fullAll,
                    child: LinearProgressIndicator(
                      // `value`, not an indeterminate bar: Dio reports real
                      // progress, and on a slow uplink an indeterminate spinner
                      // for forty seconds is indistinguishable from a hang.
                      value: progress,
                      minHeight: 3,
                      color: c.accent,
                      backgroundColor: c.surface4,
                    ),
                  ),
                ],
              ],
            ),
          ),

          Semantics(
            button: true,
            label: tr(CopyKeys.assistantThreadStagedDiscard),
            child: InkWell(
              onTap: uploading ? null : onDiscard,
              borderRadius: AppRadius.fullAll,
              child: SizedBox(
                width: AppSpacing.minTap,
                height: AppSpacing.minTap,
                child: Icon(
                  Icons.close_rounded,
                  size: 18,
                  color: uploading ? c.fgFaint : c.fgMuted,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
