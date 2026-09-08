import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';

/// The bar chart beside a voice note's play button.
///
/// ## It is not the real waveform, and it cannot be
///
/// Reading actual amplitudes means downloading and decoding the audio, which
/// is exactly what the player refuses to do until the student presses play —
/// a thread with fifteen notes would otherwise open fifteen connections on a
/// mobile link the moment it scrolled into view.
///
/// So the bars are DETERMINISTIC NOISE, seeded on the attachment's own path.
/// The same note always draws the same shape, two different notes look
/// different, and the thing it actually communicates — how far through you are
/// — is true, because that comes from the player's position.
///
/// The alternative was a plain progress bar. This is the same information in a
/// shape a student already recognises from every messaging app they use, and
/// it costs one `CustomPaint` with no I/O at all.
class VoiceWaveform extends StatelessWidget {
  const VoiceWaveform({
    required this.progress,
    required this.seed,
    this.height = 24,
    super.key,
  });

  /// 0..1.
  final double progress;

  /// Anything stable and unique per note — the attachment path is both.
  final String seed;

  final double height;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);

    return SizedBox(
      height: height,
      child: CustomPaint(
        painter: _WaveformPainter(
          progress: progress.clamp(0.0, 1.0),
          seed: seed,
          played: c.accent,
          remaining: c.surface4,
          // RTL: a voice note fills from the same side the language reads
          // from, or the progress appears to run backwards.
          rightToLeft: Directionality.of(context) == TextDirection.rtl,
        ),
        size: Size.infinite,
      ),
    );
  }
}

class _WaveformPainter extends CustomPainter {
  const _WaveformPainter({
    required this.progress,
    required this.seed,
    required this.played,
    required this.remaining,
    required this.rightToLeft,
  });

  final double progress;
  final String seed;
  final Color played;
  final Color remaining;
  final bool rightToLeft;

  static const _barWidth = 3.0;
  static const _gap = 2.0;

  @override
  void paint(Canvas canvas, Size size) {
    final count = (size.width / (_barWidth + _gap)).floor();
    if (count <= 0) return;

    // FNV-1a over the seed, then a xorshift per bar. Not cryptographic and
    // does not need to be — it needs to be STABLE, so the same note draws the
    // same shape on every rebuild and after a scroll.
    var hash = 0x811c9dc5;
    for (final unit in seed.codeUnits) {
      hash = ((hash ^ unit) * 0x01000193) & 0xffffffff;
    }

    final paint = Paint()..strokeCap = StrokeCap.round..strokeWidth = _barWidth;
    final playedBars = (count * progress).round();

    for (var i = 0; i < count; i++) {
      hash ^= (hash << 13) & 0xffffffff;
      hash ^= hash >> 17;
      hash ^= (hash << 5) & 0xffffffff;

      // 0.28..1.0 of the height. The floor stops a bar disappearing entirely,
      // which reads as a gap in the recording rather than as a quiet moment.
      final amplitude = 0.28 + (hash % 1000) / 1000 * 0.72;
      final barHeight = size.height * amplitude;
      final centre = size.height / 2;

      final index = rightToLeft ? count - 1 - i : i;
      final x = index * (_barWidth + _gap) + _barWidth / 2;

      paint.color = i < playedBars ? played : remaining;
      canvas.drawLine(
        Offset(x, centre - barHeight / 2),
        Offset(x, centre + barHeight / 2),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(_WaveformPainter old) =>
      old.progress != progress ||
      old.seed != seed ||
      old.played != played ||
      old.remaining != remaining ||
      old.rightToLeft != rightToLeft;
}
