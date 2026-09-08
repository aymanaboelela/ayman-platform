import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/functions/format_duration.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/media/app_network_image.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';

/// The video before it is playing: the poster, a play disc, and either the
/// resume row or the total length.
///
/// ## Why nothing loads until this is pressed
///
/// A lecture page that starts fetching video on mount costs a student on
/// mobile data megabytes they did not ask for, and on a slow link it delays
/// everything else on the screen. The poster is the whole first frame.
///
/// The scrim over the artwork is `black/45` and the picture stays at full
/// opacity: fading the poster to make the disc legible made both the picture
/// AND the contrast worse.
class LessonVideoPoster extends StatelessWidget {
  const LessonVideoPoster({
    required this.onPlay,
    required this.onRestart,
    required this.resumeSeconds,
    required this.durationSeconds,
    this.posterUrl,
    super.key,
  });

  final String? posterUrl;

  /// Where playback would resume. 0 means there is nothing to resume.
  final int resumeSeconds;

  final int durationSeconds;

  final VoidCallback onPlay;
  final VoidCallback onRestart;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return AspectRatio(
      aspectRatio: 16 / 9,
      child: Stack(
        fit: StackFit.expand,
        children: [
          ColoredBox(color: c.surface2),
          if (posterUrl != null)
            AppNetworkImage(
              url: posterUrl,
              borderRadius: BorderRadius.zero,
              fit: BoxFit.cover,
            ),
          const ColoredBox(color: Color(0x73000000)),

          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onPlay,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                spacing: AppSpacing.x12,
                children: [
                  Container(
                    width: 80,
                    height: 80,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: c.accent,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      Icons.play_arrow_rounded,
                      size: 44,
                      color: c.accentContrast,
                    ),
                  ),
                  Text(
                    tr(CopyKeys.playerPlay),
                    style: type.body(
                      color: Colors.white,
                      weight: AppTextStyle.semibold,
                    ),
                  ),

                  // ⚠️ The resume row REPLACES the duration. There is not room
                  // for both on a 360pt phone, and «أكمل من» is the more
                  // useful of the two by a distance.
                  if (resumeSeconds > 0)
                    _ResumeRow(
                      resumeSeconds: resumeSeconds,
                      onRestart: onRestart,
                    )
                  else if (durationSeconds > 0)
                    Text(
                      formatDuration(durationSeconds),
                      style: type.numeric(color: Colors.white70, size: 13),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// «أكمل من ١٢:٣٠ · من الأول».
class _ResumeRow extends StatelessWidget {
  const _ResumeRow({required this.resumeSeconds, required this.onRestart});

  final int resumeSeconds;
  final VoidCallback onRestart;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Row(
      mainAxisSize: MainAxisSize.min,
      spacing: AppSpacing.x8,
      children: [
        Text(
          tr(CopyKeys.playerResumeFrom),
          style: type.bodySm(color: Colors.white70),
        ),
        Text(
          formatDuration(resumeSeconds),
          style: type.numeric(color: Colors.white, size: 13),
        ),
        TextButton(
          onPressed: onRestart,
          child: Text(
            tr(CopyKeys.playerRestart),
            style: type.bodySm(
              color: c.accentText,
              weight: AppTextStyle.medium,
            ),
          ),
        ),
      ],
    );
  }
}
