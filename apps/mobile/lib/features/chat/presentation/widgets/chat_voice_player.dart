import 'dart:async';

import 'package:audio_session/audio_session.dart';
import 'package:flutter/material.dart';
import 'package:just_audio/just_audio.dart';

import '../../../../core/config/app_environment.dart';
import '../../../../core/data/network/api_headers.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/services/storage_service/secure_store.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/chat_attachment.dart';
import 'voice_waveform.dart';

/// Plays a voice note.
///
/// ## The URL needs the session, and `just_audio` can carry it
///
/// A conversation attachment has no signed URL: access is re-checked from the
/// bearer token on every request. `AudioSource.uri` takes `headers`, so the
/// token goes on the request the same way it does for an image — which is why
/// this does not download to a temp file first.
///
/// ## Loading is LAZY
///
/// Nothing is fetched until the student presses play. A thread with fifteen
/// voice notes in it would otherwise open fifteen HTTP connections on a mobile
/// link the moment it is scrolled, and the duration is already known from the
/// message (the recorder supplied it), so there is nothing to learn from the
/// bytes before playing them.
class ChatVoicePlayer extends StatefulWidget {
  const ChatVoicePlayer({required this.attachment, super.key});

  final ChatAttachment attachment;

  @override
  State<ChatVoicePlayer> createState() => _ChatVoicePlayerState();
}

class _ChatVoicePlayerState extends State<ChatVoicePlayer> {
  AudioPlayer? _player;
  StreamSubscription<PlayerState>? _stateSub;
  StreamSubscription<Duration>? _positionSub;

  bool _preparing = false;
  bool _playing = false;
  Duration _position = Duration.zero;

  Duration get _total => Duration(seconds: widget.attachment.durationSeconds ?? 0);

  double get _progress {
    if (_total.inMilliseconds <= 0) return 0;
    return (_position.inMilliseconds / _total.inMilliseconds).clamp(0.0, 1.0);
  }

  @override
  void dispose() {
    _stateSub?.cancel();
    _positionSub?.cancel();
    // ⚠️ Not awaited, and it cannot be — `dispose` is synchronous. The player
    // holds a platform-side decoder; leaving it open keeps audio focus and the
    // next note in the thread will not start.
    unawaited(_player?.dispose());
    super.dispose();
  }

  Future<void> _toggle() async {
    if (_playing) {
      await _player?.pause();
      return;
    }

    if (_player == null) {
      setState(() => _preparing = true);

      // The session category matters on iOS: without `playback` the note is
      // silenced by the ringer switch, and a student with their phone on
      // silent — which in a classroom is all of them — hears nothing and
      // concludes the note is broken.
      final session = await AudioSession.instance;
      await session.configure(const AudioSessionConfiguration.speech());

      final token = await sl<SecureStore>().readSessionToken();
      final player = AudioPlayer();

      try {
        await player.setAudioSource(
          AudioSource.uri(
            Uri.parse('${AppEnvironment.apiOrigin}${widget.attachment.path}'),
            headers: {
              if (token != null && token.isNotEmpty)
                ApiHeaders.authorization: 'Bearer $token',
            },
          ),
        );
      } catch (_) {
        await player.dispose();
        if (mounted) setState(() => _preparing = false);
        return;
      }

      _stateSub = player.playerStateStream.listen((state) {
        if (!mounted) return;
        setState(() => _playing = state.playing);
        if (state.processingState == ProcessingState.completed) {
          // Rewind on finish, so a second tap replays instead of doing
          // nothing — `just_audio` leaves the head at the end otherwise.
          unawaited(player.seek(Duration.zero));
          unawaited(player.pause());
        }
      });
      _positionSub = player.positionStream.listen((position) {
        if (mounted) setState(() => _position = position);
      });

      _player = player;
      if (mounted) setState(() => _preparing = false);
    }

    await _player?.play();
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Container(
      constraints: const BoxConstraints(minWidth: 220),
      padding: const EdgeInsets.all(AppSpacing.x4),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        spacing: AppSpacing.x8,
        children: [
          Semantics(
            button: true,
            label: _playing ? 'إيقاف' : 'تشغيل',
            child: InkWell(
              onTap: _preparing ? null : _toggle,
              borderRadius: AppRadius.fullAll,
              child: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(color: c.accent, shape: BoxShape.circle),
                child: _preparing
                    ? Padding(
                        padding: const EdgeInsets.all(11),
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          valueColor: AlwaysStoppedAnimation(c.accentContrast),
                        ),
                      )
                    : Icon(
                        _playing ? Icons.pause_rounded : Icons.play_arrow_rounded,
                        color: c.accentContrast,
                        size: 22,
                      ),
              ),
            ),
          ),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                VoiceWaveform(progress: _progress, seed: widget.attachment.path),
                const SizedBox(height: AppSpacing.x4),
                Text(
                  // Counts UP while playing and shows the total when idle,
                  // which is what every voice note anywhere does.
                  _playing || _position > Duration.zero
                      ? _format(_position)
                      : widget.attachment.readableDuration,
                  textDirection: TextDirection.ltr,
                  style: type.numeric(color: c.fgMuted, size: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _format(Duration d) =>
      '${d.inMinutes}:${(d.inSeconds % 60).toString().padLeft(2, '0')}';
}
