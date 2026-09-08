import 'package:chewie/chewie.dart';
import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../../../../core/services/player/heartbeat_engine.dart';
import '../../../../core/theme/app_colors.dart';

/// Our own copy of the lecture, over plain HLS.
///
/// ## Why this is the FIRST source and not a fallback
///
/// The ministry tablets block YouTube, and a blocked network does not report a
/// failure — it hangs. A YouTube-first player with the mirror behind it leaves
/// those students staring at a dead frame forever, because the fallback only
/// runs after something says it failed.
///
/// ## Plain HLS, no library
///
/// ExoPlayer handles `.m3u8` natively on Android and AVPlayer does on iOS, so
/// `video_player` is enough. There is no hls.js equivalent to install and
/// nothing to configure.
class MirrorVideoView extends StatefulWidget {
  const MirrorVideoView({
    required this.hlsUrl,
    required this.startSeconds,
    required this.onSource,
    required this.onFatalError,
    super.key,
  });

  final String hlsUrl;

  /// Seeked to ONCE, on the first ready event only.
  final int startSeconds;

  /// Hands the heartbeat engine its adapter, once the controller exists.
  final void Function(PlaybackSource source) onSource;

  /// A fatal error — fall through to YouTube from the same second.
  final VoidCallback onFatalError;

  @override
  State<MirrorVideoView> createState() => _MirrorVideoViewState();
}

class _MirrorVideoViewState extends State<MirrorVideoView> {
  VideoPlayerController? _controller;
  ChewieController? _chewie;

  /// ⚠️ The seek happens ONCE.
  ///
  /// A ready event fires again on every quality change on the native path, and
  /// re-seeking would drag the student backwards every time their connection
  /// improves.
  bool _seeked = false;

  @override
  void initState() {
    super.initState();
    _open();
  }

  Future<void> _open() async {
    final controller = VideoPlayerController.networkUrl(
      Uri.parse(widget.hlsUrl),
      videoPlayerOptions: VideoPlayerOptions(mixWithOthers: false),
    );
    _controller = controller;

    try {
      await controller.initialize();
    } catch (_) {
      // A source that will not open at all is fatal. YouTube is next.
      if (mounted) widget.onFatalError();
      return;
    }

    if (!mounted) return;

    if (!_seeked && widget.startSeconds > 0) {
      _seeked = true;
      await controller.seekTo(Duration(seconds: widget.startSeconds));
    }

    // The screen must not sleep mid-lecture. Released in dispose, and on every
    // route away from here — a wakelock left on is a flat battery by lunchtime.
    await WakelockPlus.enable();

    widget.onSource(_ControllerSource(controller));

    setState(() {
      _chewie = ChewieController(
        videoPlayerController: controller,
        autoPlay: true,
        allowFullScreen: true,
        allowPlaybackSpeedChanging: true,
        // The scrubber, the timer and the speed control are the whole point of
        // playing our own copy: a student revising skips and repeats far more
        // than they watch straight through.
        materialProgressColors: ChewieProgressColors(
          playedColor: AppColors.of(context).accent,
          handleColor: AppColors.of(context).accent,
          backgroundColor: AppColors.of(context).line,
          bufferedColor: AppColors.of(context).lineStrong,
        ),
      );
    });
  }

  @override
  void dispose() {
    // ⚠️ Order matters: Chewie holds the controller, so it goes first.
    _chewie?.dispose();
    _controller?.dispose();
    WakelockPlus.disable();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final chewie = _chewie;
    if (chewie == null) {
      return const AspectRatio(
        aspectRatio: 16 / 9,
        child: ColoredBox(
          color: Colors.black,
          child: Center(child: CircularProgressIndicator()),
        ),
      );
    }

    return AspectRatio(aspectRatio: 16 / 9, child: Chewie(controller: chewie));
  }
}

/// The heartbeat engine's view of a [VideoPlayerController].
class _ControllerSource implements PlaybackSource {
  const _ControllerSource(this._controller);

  final VideoPlayerController _controller;

  @override
  double get seconds => _controller.value.position.inMilliseconds / 1000;

  @override
  bool get playing => _controller.value.isPlaying;

  @override
  double get duration => _controller.value.duration.inMilliseconds / 1000;
}
