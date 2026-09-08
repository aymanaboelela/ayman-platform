import 'dart:async';
import 'dart:io';

import 'package:dartz/dartz.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:http_parser/http_parser.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

import '../../data/exception/failure.dart';
import '../../localization/copy_keys.dart';

/// A finished recording, ready to upload.
class VoiceRecording {
  const VoiceRecording({
    required this.path,
    required this.filename,
    required this.contentType,
    required this.durationSeconds,
    required this.sizeBytes,
  });

  final String path;
  final String filename;
  final MediaType contentType;

  /// Whole seconds, from the recorder's own clock.
  ///
  /// ⚠️ This is the ONLY source of the duration. A live WebM header carries no
  /// duration field, so nothing downstream — not the server, not the player —
  /// can read it back off the bytes. If it is wrong here it is wrong forever.
  final int durationSeconds;

  final int sizeBytes;
}

/// Records a voice note, and nothing else.
///
/// ## The format is chosen by the SERVER's allowlist, not by the platform
///
/// `ALLOWED_VOICE_EXT` is `webm` and `m4a`, and the server sniffs the first
/// bytes to confirm — a `.webm` that is really an MP4 is refused. Android
/// records Opus-in-WebM natively; iOS cannot, and records AAC-in-MP4 (`.m4a`).
/// Both are on the list, so each platform uses its own container and neither
/// needs a transcode.
class VoiceRecorderService {
  VoiceRecorderService() : _recorder = AudioRecorder();

  final AudioRecorder _recorder;

  DateTime? _startedAt;
  String? _path;

  /// 10 minutes, matching `MAX_VOICE_SECONDS` and the Postgres CHECK.
  ///
  /// Enforced HERE as well as server-side, because a recording that is refused
  /// after it finishes has already cost the student the whole ten minutes and
  /// the upload.
  static const maxDuration = Duration(seconds: 600);

  /// Below this a tap is a slip, not a message.
  ///
  /// A quarter-second of silence sent to the instructor is noise he has to
  /// open to discard. The UI cancels rather than uploading.
  static const minDuration = Duration(milliseconds: 700);

  bool get isRecording => _startedAt != null;

  /// How long the current recording has been running.
  Duration get elapsed =>
      _startedAt == null ? Duration.zero : DateTime.now().difference(_startedAt!);

  /// Asks for the microphone and starts.
  ///
  /// The permission prompt is fired by `hasPermission()` — `record` requests
  /// it rather than only reporting it, which is why `permission_handler` is
  /// not involved here. A refusal comes back as a [PermissionFailure] with
  /// `permanentlyDenied` unset, because the plugin cannot tell "not yet" from
  /// "never again" and guessing wrong sends the student to Settings for
  /// nothing.
  Future<Either<Failure, Unit>> start() async {
    if (isRecording) return const Right(unit);

    if (!await _recorder.hasPermission()) {
      return Left(PermissionFailure(tr(CopyKeys.commonError)));
    }

    final directory = await getTemporaryDirectory();
    // The extension is load-bearing: the server picks its pipeline from it.
    final extension = Platform.isIOS ? 'm4a' : 'webm';
    final path = p.join(
      directory.path,
      'voice-${DateTime.now().millisecondsSinceEpoch}.$extension',
    );

    await _recorder.start(
      RecordConfig(
        // Opus on Android, AAC on iOS — the two the server accepts.
        encoder: Platform.isIOS ? AudioEncoder.aacLc : AudioEncoder.opus,
        // 32 kbps mono at 24 kHz. Speech, not music: it is indistinguishable
        // from 128 kbps for a voice and it is a quarter of the bytes, which on
        // Egyptian mobile data is the difference between a note that uploads
        // and one that times out.
        bitRate: 32000,
        sampleRate: 24000,
        numChannels: 1,
      ),
      path: path,
    );

    _path = path;
    _startedAt = DateTime.now();
    return const Right(unit);
  }

  /// Stops and returns the file, or null when it was too short to send.
  Future<VoiceRecording?> stop() async {
    if (!isRecording) return null;

    final startedAt = _startedAt!;
    _startedAt = null;

    final path = await _recorder.stop() ?? _path;
    _path = null;
    if (path == null) return null;

    final elapsed = DateTime.now().difference(startedAt);
    final file = File(path);

    if (elapsed < minDuration) {
      await _deleteQuietly(file);
      return null;
    }

    if (!file.existsSync()) return null;

    return VoiceRecording(
      path: path,
      filename: p.basename(path),
      contentType: Platform.isIOS
          ? MediaType('audio', 'mp4')
          : MediaType('audio', 'webm'),
      // Rounded UP and floored at 1: the CHECK constraint refuses 0, and a
      // note that really did last 900ms is «0:01», not «0:00».
      durationSeconds: elapsed.inMilliseconds < 1000 ? 1 : (elapsed.inMilliseconds / 1000).ceil(),
      sizeBytes: file.lengthSync(),
    );
  }

  /// Abandons the recording and removes the file.
  Future<void> cancel() async {
    if (!isRecording) return;
    _startedAt = null;
    final path = await _recorder.stop() ?? _path;
    _path = null;
    if (path != null) await _deleteQuietly(File(path));
  }

  Future<void> dispose() async {
    await _recorder.dispose();
  }

  /// A temp file that will not delete is not worth an error path: the OS
  /// clears the directory on its own schedule.
  Future<void> _deleteQuietly(File file) async {
    try {
      if (file.existsSync()) await file.delete();
    } catch (_) {}
  }
}
