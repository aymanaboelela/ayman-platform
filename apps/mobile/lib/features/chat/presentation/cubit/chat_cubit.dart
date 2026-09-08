import 'dart:async';

import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:http_parser/http_parser.dart';
import 'package:image_picker/image_picker.dart';
import 'package:meta/meta.dart';

import '../../../../core/data/exception/failure.dart';
import '../../../../core/services/media/image_pick_service.dart';
import '../../../../core/services/voice/voice_recorder_service.dart';
import '../../data/models/staged_attachment.dart';
import '../../domain/entities/chat_thread.dart';
import '../../domain/repositories/chat_repository.dart';

part 'chat_state.dart';

/// Drives the conversation with أيمن.
class ChatCubit extends Cubit<ChatState> {
  ChatCubit({
    required ChatRepository repository,
    required VoiceRecorderService recorder,
    required ImagePickService images,
  })  : _repository = repository,
        _recorder = recorder,
        _images = images,
        super(const ChatState());

  final ChatRepository _repository;
  final VoiceRecorderService _recorder;
  final ImagePickService _images;

  Timer? _recordingTicker;
  Timer? _poll;

  Future<void> load() async {
    final result = await _repository.myThread();
    result.fold(
      (failure) => emit(state.copyWith(loading: false, failure: failure)),
      (thread) {
        emit(state.copyWith(loading: false, thread: thread, clearFailure: true));
        _markReadIfNeeded(thread);
      },
    );
  }

  /// ⚠️ POLLING, because there is no realtime transport on this path.
  ///
  /// The thread has no SSE and no WebSocket — the only streaming endpoint in
  /// the assistant module is the AI ask route, which is a different feature.
  /// So a reply from أيمن arrives either on the next poll or on the push
  /// notification that is emitted alongside it.
  ///
  /// 20 seconds, and ONLY while the screen is on top. The API's medium
  /// throttle is 60 requests a minute per session; a 5-second poll would spend
  /// a fifth of a student's whole allowance on a screen they are looking at
  /// rather than using. It stops the moment the screen is left.
  void startPolling() {
    _poll?.cancel();
    _poll = Timer.periodic(const Duration(seconds: 20), (_) => _refreshQuietly());
  }

  void stopPolling() {
    _poll?.cancel();
    _poll = null;
  }

  /// A refresh that never disturbs what is on screen.
  ///
  /// No loading state, and a failure is DROPPED: the student is reading a
  /// thread they already have, and an error banner because one poll timed out
  /// would be the app interrupting them to report nothing.
  Future<void> _refreshQuietly() async {
    if (state.busy) return;
    final result = await _repository.myThread();
    result.fold((_) {}, (thread) {
      if (thread == null) return;
      emit(state.copyWith(thread: thread));
      _markReadIfNeeded(thread);
    });
  }

  Future<void> refresh() => _refreshQuietly();

  /// Clears the unread dot when the thread is on screen and there is one.
  void _markReadIfNeeded(ChatThread? thread) {
    if (thread == null || thread.unreadForVisitor == 0) return;
    // Fire and forget — the route answers 204 for any id, so the only failure
    // is the network and the dot clears on the next load.
    unawaited(_repository.markRead(thread.id));
    emit(state.copyWith(thread: thread.copyWith(unreadForVisitor: 0)));
  }

  // ── sending ─────────────────────────────────────────────────────────────

  Future<void> send(String message) async {
    final text = message.trim();
    final staged = state.staged;

    // The same rule the schema and the DB CHECK both enforce: words or a file.
    if (text.isEmpty && staged == null) return;
    if (state.busy) return;

    emit(state.copyWith(composer: ComposerStatus.sending, clearSendFailure: true));

    final result = await _repository.send(
      thread: state.thread,
      message: text,
      attachment: staged,
    );

    result.fold(
      (failure) => emit(
        state.copyWith(composer: ComposerStatus.idle, sendFailure: failure),
      ),
      (thread) {
        emit(
          state.copyWith(
            composer: ComposerStatus.idle,
            thread: thread,
            clearStaged: true,
            clearSendFailure: true,
          ),
        );
      },
    );
  }

  // ── attachments ─────────────────────────────────────────────────────────

  Future<void> pickImage(ImageSource source) async {
    if (state.busy) return;

    final picked = await _images.pick(source);
    await picked.fold(
      (failure) async => emit(state.copyWith(sendFailure: failure)),
      (image) async {
        // Null means they backed out of the picker. Silent.
        if (image == null) return;
        await _upload(
          filePath: image.path,
          filename: image.filename,
          mime: image.contentType,
          previewPath: image.path,
        );
      },
    );
  }

  Future<void> startRecording() async {
    if (state.busy) return;

    final started = await _recorder.start();
    started.fold(
      (failure) => emit(state.copyWith(sendFailure: failure)),
      (_) {
        emit(
          state.copyWith(
            composer: ComposerStatus.recording,
            recordingSeconds: 0,
            clearSendFailure: true,
          ),
        );
        _recordingTicker?.cancel();
        _recordingTicker = Timer.periodic(const Duration(seconds: 1), (_) {
          final seconds = _recorder.elapsed.inSeconds;
          emit(state.copyWith(recordingSeconds: seconds));
          // Stop AT the ceiling rather than letting the server refuse it: the
          // student has already spoken for ten minutes at that point.
          if (seconds >= VoiceRecorderService.maxDuration.inSeconds) {
            unawaited(stopRecording());
          }
        });
      },
    );
  }

  /// Finishes the recording and uploads it.
  ///
  /// A recording under [VoiceRecorderService.minDuration] is DISCARDED without
  /// a word: it is a slipped finger, and uploading a quarter-second of silence
  /// gives the instructor something to open and throw away.
  Future<void> stopRecording() async {
    if (!state.isRecording) return;
    _recordingTicker?.cancel();
    _recordingTicker = null;

    final recording = await _recorder.stop();
    if (recording == null) {
      emit(state.copyWith(composer: ComposerStatus.idle, recordingSeconds: 0));
      return;
    }

    await _upload(
      filePath: recording.path,
      filename: recording.filename,
      mime: recording.contentType,
      durationSeconds: recording.durationSeconds,
      previewPath: recording.path,
    );
  }

  Future<void> cancelRecording() async {
    _recordingTicker?.cancel();
    _recordingTicker = null;
    await _recorder.cancel();
    emit(state.copyWith(composer: ComposerStatus.idle, recordingSeconds: 0));
  }

  /// Throws away a staged file before it is sent.
  void discardStaged() {
    if (state.staged == null) return;
    emit(state.copyWith(clearStaged: true));
  }

  Future<void> _upload({
    required String filePath,
    required String filename,
    required MediaType mime,
    String? previewPath,
    int? durationSeconds,
  }) async {
    emit(
      state.copyWith(
        composer: ComposerStatus.uploading,
        uploadProgress: 0,
        clearSendFailure: true,
      ),
    );

    final result = await _repository.upload(
      filePath: filePath,
      filename: filename,
      contentType: mime,
      durationSeconds: durationSeconds,
      onProgress: (sent, total) {
        if (total <= 0) return;
        emit(state.copyWith(uploadProgress: sent / total));
      },
    );

    result.fold(
      (failure) => emit(
        state.copyWith(composer: ComposerStatus.idle, sendFailure: failure),
      ),
      (staged) => emit(
        state.copyWith(
          composer: ComposerStatus.idle,
          staged: staged,
          stagedPreviewPath: previewPath,
          uploadProgress: 1,
        ),
      ),
    );
  }

  void dismissSendFailure() => emit(state.copyWith(clearSendFailure: true));

  @override
  Future<void> close() {
    _recordingTicker?.cancel();
    _poll?.cancel();
    // The recorder holds a platform channel and a file handle; leaving it open
    // keeps the microphone indicator on after the screen is gone, which reads
    // to a student as the app listening to them.
    unawaited(_recorder.cancel());
    return super.close();
  }
}
