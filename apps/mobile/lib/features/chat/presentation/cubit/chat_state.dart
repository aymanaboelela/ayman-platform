part of 'chat_cubit.dart';

/// What the composer is doing.
enum ComposerStatus {
  /// Ready for input.
  idle,

  /// A voice note is being recorded right now.
  recording,

  /// A file is on its way up. [ChatState.uploadProgress] is populated.
  uploading,

  /// A message is being posted.
  sending,
}

@immutable
class ChatState extends Equatable {
  const ChatState({
    this.loading = true,
    this.thread,
    this.failure,
    this.composer = ComposerStatus.idle,
    this.uploadProgress = 0,
    this.staged,
    this.stagedPreviewPath,
    this.recordingSeconds = 0,
    this.sendFailure,
  });

  /// The FIRST load only. A refresh keeps the thread on screen.
  final bool loading;

  /// Null means the student has never written — a real state, and a 200 from
  /// the API, not a 404.
  final ChatThread? thread;

  /// The thread itself could not be loaded.
  final Failure? failure;

  final ComposerStatus composer;

  /// 0..1 while [ComposerStatus.uploading].
  final double uploadProgress;

  /// A file that has been uploaded and is waiting for the student to press
  /// send. Cleared when the message goes or when they discard it.
  final StagedAttachment? staged;

  /// The LOCAL path of the staged file, for the preview strip.
  ///
  /// Kept beside [staged] rather than derived from it: the staged object holds
  /// a server storage key, and rendering the preview from the network would
  /// re-download a file that is already on the phone.
  final String? stagedPreviewPath;

  /// The recorder's clock, in whole seconds, while recording.
  final int recordingSeconds;

  /// A SEND failed. Separate from [failure] because the thread is still
  /// perfectly readable — only the last action did not land.
  final Failure? sendFailure;

  bool get busy => composer != ComposerStatus.idle;
  bool get hasThread => thread != null;
  bool get canReply => thread?.canReply ?? true;
  bool get isRecording => composer == ComposerStatus.recording;

  /// ⚠️ Attaching is only possible once a thread EXISTS.
  ///
  /// `OpenConversationSchema` has no `attachment` field: the first message has
  /// to say what the student wants, and a photo with no question gives the
  /// instructor nothing to answer. The button is hidden rather than disabled,
  /// because a disabled button with no explanation reads as broken.
  bool get canAttach => hasThread && canReply;

  ChatState copyWith({
    bool? loading,
    ChatThread? thread,
    Failure? failure,
    ComposerStatus? composer,
    double? uploadProgress,
    StagedAttachment? staged,
    String? stagedPreviewPath,
    int? recordingSeconds,
    Failure? sendFailure,
    bool clearFailure = false,
    bool clearStaged = false,
    bool clearSendFailure = false,
  }) {
    return ChatState(
      loading: loading ?? this.loading,
      thread: thread ?? this.thread,
      failure: clearFailure ? null : (failure ?? this.failure),
      composer: composer ?? this.composer,
      uploadProgress: uploadProgress ?? this.uploadProgress,
      staged: clearStaged ? null : (staged ?? this.staged),
      stagedPreviewPath:
          clearStaged ? null : (stagedPreviewPath ?? this.stagedPreviewPath),
      recordingSeconds: recordingSeconds ?? this.recordingSeconds,
      sendFailure: clearSendFailure ? null : (sendFailure ?? this.sendFailure),
    );
  }

  @override
  List<Object?> get props => [
    loading,
    thread,
    failure,
    composer,
    uploadProgress,
    staged,
    stagedPreviewPath,
    recordingSeconds,
    sendFailure,
  ];
}
