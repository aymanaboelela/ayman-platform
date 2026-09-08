import 'package:easy_localization/easy_localization.dart' hide TextDirection;
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/services/voice/voice_recorder_service.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../cubit/chat_cubit.dart';

/// Replaces the composer while a voice note is being recorded.
///
/// It carries its OWN cancel button rather than relying on "drag away to
/// cancel": a long-press gesture cannot tell a deliberate drag from a finger
/// shifting on a bus, and losing thirty seconds of a spoken question to a
/// wobble is worse than one extra button.
class ChatRecordingBar extends StatelessWidget {
  const ChatRecordingBar({required this.seconds, super.key});

  final int seconds;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final cubit = context.read<ChatCubit>();

    final remaining = VoiceRecorderService.maxDuration.inSeconds - seconds;
    // The countdown only appears in the last thirty seconds. Showing «فاضل
    // ٩:٤٢» from the start turns a voice note into a timed exercise.
    final nearLimit = remaining <= 30;

    return Container(
      decoration: BoxDecoration(
        color: c.surface1,
        border: Border(top: BorderSide(color: c.line, width: 0.5)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.x8),
          child: Row(
            spacing: AppSpacing.x8,
            children: [
              Semantics(
                button: true,
                label: tr(CopyKeys.assistantThreadRecordCancel),
                child: InkWell(
                  onTap: cubit.cancelRecording,
                  borderRadius: AppRadius.fullAll,
                  child: SizedBox(
                    width: AppSpacing.minTap,
                    height: AppSpacing.minTap,
                    child: Icon(Icons.delete_outline_rounded, size: 22, color: c.err),
                  ),
                ),
              ),

              const RecordingPulse(),

              Text(
                _format(seconds),
                textDirection: TextDirection.ltr,
                style: type.numeric(color: c.fg, size: 15),
              ),

              const Spacer(),

              if (nearLimit)
                Text(
                  _format(remaining < 0 ? 0 : remaining),
                  textDirection: TextDirection.ltr,
                  style: type.numeric(color: c.err, size: 13),
                ),

              Semantics(
                button: true,
                label: tr(CopyKeys.assistantThreadRecordSend),
                child: InkWell(
                  onTap: cubit.stopRecording,
                  borderRadius: AppRadius.fullAll,
                  child: Container(
                    width: AppSpacing.minTap,
                    height: AppSpacing.minTap,
                    decoration: BoxDecoration(color: c.accent, shape: BoxShape.circle),
                    child: Icon(Icons.send_rounded, size: 20, color: c.accentContrast),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _format(int total) =>
      '${total ~/ 60}:${(total % 60).toString().padLeft(2, '0')}';
}

/// The pulsing red dot that says the microphone is live.
///
/// Not decoration: it is the only thing on screen that distinguishes "armed"
/// from "recording", and a student who cannot tell the difference records
/// silence and sends it.
class RecordingPulse extends StatefulWidget {
  const RecordingPulse({super.key});

  @override
  State<RecordingPulse> createState() => _RecordingPulseState();
}

class _RecordingPulseState extends State<RecordingPulse>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);

    // Honours reduced motion by holding at full opacity rather than stopping
    // dead — an invisible dot would remove the signal entirely.
    final reduceMotion = MediaQuery.disableAnimationsOf(context);

    return FadeTransition(
      opacity: reduceMotion
          ? const AlwaysStoppedAnimation(1)
          : Tween<double>(begin: 0.35, end: 1).animate(_controller),
      child: Container(
        width: 10,
        height: 10,
        decoration: BoxDecoration(color: c.err, shape: BoxShape.circle),
      ),
    );
  }
}
