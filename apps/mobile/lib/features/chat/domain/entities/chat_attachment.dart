import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

/// What kind of file is on a message. Decides how the bubble renders it.
enum ChatAttachmentKind {
  /// Renders inline in the bubble.
  image,

  /// Renders as a file card. The instructor sends these (a lecture PDF); a
  /// student cannot — see the upload route.
  document,

  /// Renders as a player with a waveform and a duration.
  voice;

  /// Anything the app has not heard of falls back to [document], which renders
  /// a filename and a download button and is always safe. Throwing here would
  /// take the whole thread down over one message.
  static ChatAttachmentKind parse(String raw) => switch (raw) {
    'image' => ChatAttachmentKind.image,
    'voice' => ChatAttachmentKind.voice,
    _ => ChatAttachmentKind.document,
  };
}

/// A file hanging off a message.
@immutable
class ChatAttachment extends Equatable {
  const ChatAttachment({
    required this.kind,
    required this.filename,
    required this.sizeBytes,
    required this.path,
    required this.downloadPath,
    this.durationSeconds,
  });

  final ChatAttachmentKind kind;

  /// Display only. NEVER used to build a path — the server picks the stored
  /// name and this is whatever the uploader called it.
  final String filename;

  final int sizeBytes;

  /// Whole seconds, non-null ONLY for [ChatAttachmentKind.voice]. It comes
  /// from the recorder, not the bytes: a live WebM header carries no duration.
  final int? durationSeconds;

  /// ⚠️ An API PATH, not a URL, and it needs the session.
  ///
  /// There is no signed URL and no TTL here — access is re-checked from the
  /// bearer token on every single request, and the response carries
  /// `Cache-Control: private, no-store`. So it cannot be handed to a plain
  /// `Image.network`: it has to go through the authenticated client, and the
  /// bytes must not land in a shared cache afterwards.
  final String path;

  /// The same bytes with `Content-Disposition: attachment`.
  final String downloadPath;

  /// «1.2 ميجا» / «340 كيلو». Rounded to one decimal above a megabyte, whole
  /// kilobytes below it — a file size with three decimals is noise.
  String get readableSize {
    const kb = 1024;
    const mb = kb * 1024;
    if (sizeBytes >= mb) {
      final value = sizeBytes / mb;
      return '${value.toStringAsFixed(value >= 10 ? 0 : 1)} MB';
    }
    return '${(sizeBytes / kb).round()} KB';
  }

  /// `m:ss`, the way every voice note anywhere is labelled.
  String get readableDuration {
    final total = durationSeconds ?? 0;
    final minutes = total ~/ 60;
    final seconds = (total % 60).toString().padLeft(2, '0');
    return '$minutes:$seconds';
  }

  @override
  List<Object?> get props => [kind, filename, sizeBytes, durationSeconds, path, downloadPath];
}
