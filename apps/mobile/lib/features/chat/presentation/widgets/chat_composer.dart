import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../cubit/chat_cubit.dart';
import 'chat_recording_bar.dart';
import 'chat_staged_preview.dart';
import 'image_source_sheet.dart';

/// The bar at the bottom of the thread.
///
/// Three states, and only one is visible at a time: the ordinary composer, the
/// recording bar, and the staged-file preview sitting above the composer.
class ChatComposer extends StatefulWidget {
  const ChatComposer({super.key});

  @override
  State<ChatComposer> createState() => _ChatComposerState();
}

class _ChatComposerState extends State<ChatComposer> {
  final _controller = TextEditingController();
  final _focus = FocusNode();

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return BlocBuilder<ChatCubit, ChatState>(
      builder: (context, state) {
        if (state.isRecording) {
          return ChatRecordingBar(seconds: state.recordingSeconds);
        }

        return Container(
          decoration: BoxDecoration(
            color: c.surface1,
            border: Border(top: BorderSide(color: c.line, width: 0.5)),
          ),
          child: SafeArea(
            top: false,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (state.staged != null || state.composer == ComposerStatus.uploading)
                  ChatStagedPreview(
                    staged: state.staged,
                    previewPath: state.stagedPreviewPath,
                    progress: state.uploadProgress,
                    uploading: state.composer == ComposerStatus.uploading,
                    onDiscard: context.read<ChatCubit>().discardStaged,
                  ),

                Padding(
                  padding: const EdgeInsets.all(AppSpacing.x8),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    spacing: AppSpacing.x4,
                    children: [
                      // Hidden, not disabled, before a thread exists — the API
                      // has no `attachment` on the OPEN route, and a disabled
                      // button with no explanation reads as broken.
                      if (state.canAttach)
                        ChatAttachButton(
                          enabled: !state.busy,
                          onTap: () async {
                            final source = await ImageSourceSheet.ask(context);
                            if (source == null || !context.mounted) return;
                            await context.read<ChatCubit>().pickImage(source);
                          },
                        ),

                      Expanded(
                        child: TextField(
                          controller: _controller,
                          focusNode: _focus,
                          enabled: state.canReply && !state.busy,
                          // Grows to five lines then scrolls: a student
                          // explaining a problem writes a paragraph, and a
                          // one-line field makes them type blind.
                          minLines: 1,
                          maxLines: 5,
                          // 2000, the same ceiling the schema and the Postgres
                          // CHECK both enforce. Stopping the keystroke is
                          // kinder than a 400 after they press send.
                          maxLength: 2000,
                          textInputAction: TextInputAction.newline,
                          keyboardType: TextInputType.multiline,
                          style: type.body(color: c.fg),
                          decoration: InputDecoration(
                            hintText: state.canReply
                                ? tr(CopyKeys.assistantThreadReplyPlaceholder)
                                : tr(CopyKeys.assistantThreadClosed),
                            // The counter is noise until it matters — nobody
                            // writing two sentences needs to see 43/2000.
                            counterText: '',
                            filled: true,
                            fillColor: c.surface2,
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: AppSpacing.x12,
                              vertical: AppSpacing.x12,
                            ),
                            border: OutlineInputBorder(
                              borderRadius: AppRadius.lgAll,
                              borderSide: BorderSide(color: c.line),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: AppRadius.lgAll,
                              borderSide: BorderSide(color: c.line),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: AppRadius.lgAll,
                              borderSide: BorderSide(color: c.accent, width: 2),
                            ),
                          ),
                        ),
                      ),

                      ChatSendButton(controller: _controller, state: state),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// The paperclip.
class ChatAttachButton extends StatelessWidget {
  const ChatAttachButton({required this.enabled, required this.onTap, super.key});

  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);

    return Semantics(
      button: true,
      label: tr(CopyKeys.assistantThreadAttach),
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: AppRadius.fullAll,
        child: SizedBox(
          width: AppSpacing.minTap,
          height: AppSpacing.minTap,
          child: Icon(
            Icons.add_photo_alternate_outlined,
            size: 22,
            color: enabled ? c.fgMuted : c.fgFaint,
          ),
        ),
      ),
    );
  }
}

/// Send, or hold to record.
///
/// One button with two jobs, exactly as every messaging app does it: a mic
/// when the field is empty, an arrow when it is not. That is not decoration —
/// it means the student never has to find a second control, and the gesture
/// they already know (hold to talk) is the one that works.
class ChatSendButton extends StatelessWidget {
  const ChatSendButton({required this.controller, required this.state, super.key});

  final TextEditingController controller;
  final ChatState state;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final cubit = context.read<ChatCubit>();

    return ValueListenableBuilder<TextEditingValue>(
      valueListenable: controller,
      builder: (context, value, _) {
        final hasText = value.text.trim().isNotEmpty;
        final canSend = (hasText || state.staged != null) && !state.busy && state.canReply;
        final showSend = hasText || state.staged != null;

        return Semantics(
          button: true,
          label: showSend ? tr(CopyKeys.assistantThreadSend) : tr(CopyKeys.assistantThreadRecord),
          child: GestureDetector(
            onTap: showSend
                ? (canSend
                      ? () {
                          final text = controller.text;
                          controller.clear();
                          cubit.send(text);
                        }
                      : null)
                : null,
            // Hold to record, release to send — and drag away to cancel, which
            // `onLongPressEnd` cannot distinguish, so the recording bar carries
            // its own cancel button instead.
            onLongPressStart: showSend || !state.canReply
                ? null
                : (_) => cubit.startRecording(),
            onLongPressEnd: showSend ? null : (_) => cubit.stopRecording(),
            child: Container(
              width: AppSpacing.minTap,
              height: AppSpacing.minTap,
              decoration: BoxDecoration(
                color: canSend || !showSend ? c.accent : c.surface4,
                shape: BoxShape.circle,
              ),
              child: state.composer == ComposerStatus.sending
                  ? Padding(
                      padding: const EdgeInsets.all(13),
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        valueColor: AlwaysStoppedAnimation(c.accentContrast),
                      ),
                    )
                  : Icon(
                      showSend ? Icons.send_rounded : Icons.mic_rounded,
                      size: 20,
                      color: canSend || !showSend ? c.accentContrast : c.fgFaint,
                    ),
            ),
          ),
        );
      },
    );
  }
}
