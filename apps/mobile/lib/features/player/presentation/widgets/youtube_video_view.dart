import 'dart:async';

import 'package:flutter/material.dart';
import 'package:youtube_player_iframe/youtube_player_iframe.dart';

import '../../../../core/services/player/heartbeat_engine.dart';

/// The fallback: YouTube's own player, when there is no mirror or the mirror
/// died.
///
/// ## The id is all we get
///
/// No signed URL, no file — the API hands over an 11-character id and nothing
/// else, so the embed is the only way to play it.
///
/// ## Why `playVideo()` is called from onReady
///
/// Constructing a player does not start one. Without this the student presses
/// one play button and is handed another, which is exactly what the poster
/// they just dismissed looked like.
class YoutubeVideoView extends StatefulWidget {
  const YoutubeVideoView({
    required this.youtubeId,
    required this.startSeconds,
    required this.onSource,
    required this.onError,
    super.key,
  });

  final String youtubeId;
  final int startSeconds;
  final void Function(PlaybackSource source) onSource;

  /// One of YouTube's numeric codes. The caller maps it to a sentence.
  final void Function(int code) onError;

  @override
  State<YoutubeVideoView> createState() => _YoutubeVideoViewState();
}

class _YoutubeVideoViewState extends State<YoutubeVideoView> {
  late final YoutubePlayerController _controller;

  /// The heartbeat engine reads the position once a second, synchronously.
  /// The iframe only reports it over a stream, so the latest value is cached
  /// here — an `await` per tick across a platform channel is a jank source on
  /// the one screen that must not stutter.
  final _source = _YoutubeSource();
  StreamSubscription<YoutubeVideoState>? _states;

  @override
  void initState() {
    super.initState();

    _controller = YoutubePlayerController.fromVideoId(
      videoId: widget.youtubeId,
      startSeconds: widget.startSeconds.toDouble(),
      // ⚠️ `autoPlay` is the whole reason the poster gesture reaches the
      // video. See the class note.
      autoPlay: true,
      params: const YoutubePlayerParams(
        // Arabic, and Arabic captions when the video has them.
        // `showFullscreenButton` because a lecture on a phone in portrait is
        // 200pt tall and unreadable.
        showFullscreenButton: true,
        showControls: true,
        strictRelatedVideos: true,
        playsInline: true,
        enableCaption: true,
        captionLanguage: 'ar',
        interfaceLanguage: 'ar',
      ),
    );

    _controller.listen((value) {
      _source.playing = value.playerState == PlayerState.playing;
      _source.duration = value.metaData.duration.inMilliseconds / 1000;

      final error = value.error;
      if (error != YoutubeError.none) widget.onError(error.code);
    });

    _states = _controller.videoStateStream.listen((state) {
      _source.seconds = state.position.inMilliseconds / 1000;
    });

    widget.onSource(_source);
  }

  @override
  void dispose() {
    _states?.cancel();
    _controller.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return YoutubePlayer(
      controller: _controller,
      aspectRatio: 16 / 9,
      enableFullScreenOnVerticalDrag: false,
    );
  }
}

/// The heartbeat engine's view of the YouTube player.
///
/// A plain cache written by the two streams above, because the iframe reports
/// position asynchronously and the engine reads it on a one-second timer.
class _YoutubeSource implements PlaybackSource {
  @override
  double seconds = 0;

  @override
  bool playing = false;

  @override
  double duration = 0;
}
