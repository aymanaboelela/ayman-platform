import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

/// A file that has been UPLOADED but not yet attached to a message.
///
/// The two are separate requests on purpose — the upload can take a while on a
/// slow uplink and the student should see it finish before they decide what to
/// type. This is what the first request hands back and the second sends on.
@immutable
class StagedAttachment extends Equatable {
  const StagedAttachment({
    required this.storageKey,
    required this.filename,
    required this.sizeBytes,
    this.durationSeconds,
  });

  final String storageKey;
  final String filename;
  final int sizeBytes;

  /// ⚠️ Supplied by the RECORDER and sent back up by the client — the server
  /// does not return it, because it cannot read it off the bytes.
  final int? durationSeconds;

  factory StagedAttachment.fromJson(Map<String, dynamic> json, {int? durationSeconds}) {
    return StagedAttachment(
      storageKey: json['storageKey'] as String,
      filename: json['filename'] as String,
      sizeBytes: (json['sizeBytes'] as num).toInt(),
      durationSeconds: durationSeconds,
    );
  }

  Map<String, dynamic> toJson() => {
    'storageKey': storageKey,
    'filename': filename,
    'sizeBytes': sizeBytes,
    if (durationSeconds != null) 'durationSeconds': durationSeconds,
  };

  bool get isVoice => durationSeconds != null;

  @override
  List<Object?> get props => [storageKey, filename, sizeBytes, durationSeconds];
}
