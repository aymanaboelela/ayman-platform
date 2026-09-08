import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/services/player/heartbeat_engine.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/lesson_player.dart';
import 'lesson_video_poster.dart';
import 'mirror_video_view.dart';
import 'youtube_video_view.dart';

/// The video, in whichever way it can be played.
///
/// ## The source order is the feature
///
/// ```
/// mirror != null && !mirrorFailed  → our own copy, plain HLS
/// otherwise                        → YouTube
/// ```
///
/// ⚠️ Never the other way round. The ministry tablets block YouTube, and a
/// blocked network does not report an error — it hangs. A fallback only runs
/// after something SAYS it failed, so YouTube-first leaves those students on a
/// dead frame indefinitely.
class LessonVideo extends StatelessWidget {
  const LessonVideo({
    required this.video,
    required this.activated,
    required this.mirrorFailed,
    required this.startSeconds,
    required this.onPlay,
    required this.onRestart,
    required this.onSource,
    required this.onMirrorFailed,
    required this.onYoutubeError,
    this.youtubeErrorCode,
    super.key,
  });

  /// Null is a REAL state: a video lesson whose video row was never filled in.
  /// The rest of the lesson — materials, homework, the finish button — has to
  /// keep working.
  final PlayerVideo? video;

  final bool activated;
  final bool mirrorFailed;
  final int startSeconds;

  final VoidCallback onPlay;
  final VoidCallback onRestart;
  final void Function(PlaybackSource source) onSource;
  final VoidCallback onMirrorFailed;
  final void Function(int code) onYoutubeError;

  /// Set once YouTube has refused. Drives the failure overlay.
  final int? youtubeErrorCode;

  @override
  Widget build(BuildContext context) {
    final current = video;
    if (current == null) return const _VideoMissing();

    if (youtubeErrorCode != null) {
      return _VideoFailed(
        code: youtubeErrorCode!,
        youtubeId: current.youtubeId,
      );
    }

    if (!activated) {
      return LessonVideoPoster(
        posterUrl: current.posterUrl,
        resumeSeconds: startSeconds,
        durationSeconds: current.durationSeconds,
        onPlay: onPlay,
        onRestart: onRestart,
      );
    }

    if (current.prefersMirror && !mirrorFailed) {
      return MirrorVideoView(
        // Keyed on the URL so a different lecture never reuses the controller
        // of the one before it — the classic "second video plays the first
        // video's audio" bug.
        key: ValueKey(current.mirror!.hlsUrl),
        hlsUrl: current.mirror!.hlsUrl,
        startSeconds: startSeconds,
        onSource: onSource,
        onFatalError: onMirrorFailed,
      );
    }

    return YoutubeVideoView(
      key: ValueKey(current.youtubeId),
      youtubeId: current.youtubeId,
      startSeconds: startSeconds,
      onSource: onSource,
      onError: onYoutubeError,
    );
  }
}

/// «المحاضرة دي لسه مافيهاش فيديو.»
///
/// A 16/9 box rather than nothing, so the page does not jump when a video
/// eventually arrives, and so the state reads as a fact rather than a failure.
class _VideoMissing extends StatelessWidget {
  const _VideoMissing();

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return AspectRatio(
      aspectRatio: 16 / 9,
      child: ColoredBox(
        color: c.surface2,
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.x24),
            child: Text(
              tr(CopyKeys.playerVideoMissing),
              textAlign: TextAlign.center,
              style: type.bodySm(color: c.fgMuted),
            ),
          ),
        ),
      ),
    );
  }
}

/// YouTube refused, with the reason it gave.
class _VideoFailed extends StatelessWidget {
  const _VideoFailed({required this.code, required this.youtubeId});

  final int code;
  final String youtubeId;

  /// The three sentences worth telling apart. Anything else is «مش متاح».
  String get _messageKey => switch (code) {
        // The owner disabled embedding — it plays, just not in here.
        101 || 150 => CopyKeys.playerVideoEmbedBlocked,
        // Removed or made private.
        100 => CopyKeys.playerVideoRemoved,
        _ => CopyKeys.playerVideoUnavailable,
      };

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return AspectRatio(
      aspectRatio: 16 / 9,
      child: Container(
        color: c.surface2,
        padding: const EdgeInsets.all(AppSpacing.x24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          spacing: AppSpacing.x12,
          children: [
            Icon(Icons.videocam_off_outlined, size: 32, color: c.fgMuted),
            Semantics(
              liveRegion: true,
              child: Text(
                tr(_messageKey),
                textAlign: TextAlign.center,
                style: type.bodySm(color: c.fg),
              ),
            ),
            // Always offered, whatever the reason: every one of these states
            // is one the student can get past by watching it on YouTube.
            TextButton.icon(
              onPressed: () => launchUrl(
                Uri.parse('https://www.youtube.com/watch?v=$youtubeId'),
                mode: LaunchMode.externalApplication,
              ),
              icon: Icon(Icons.open_in_new_rounded, size: 16, color: c.accentText),
              label: Text(
                tr(CopyKeys.playerVideoOpenOnYouTube),
                style: type.bodySm(color: c.accentText),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
