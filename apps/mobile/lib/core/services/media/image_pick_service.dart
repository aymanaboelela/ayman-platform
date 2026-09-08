import 'dart:io';

import 'package:dartz/dartz.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/services.dart' show PlatformException;
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:http_parser/http_parser.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../data/exception/failure.dart';
import '../../localization/copy_keys.dart';

/// A photo the student picked, already compressed and ready to upload.
class PickedImage {
  const PickedImage({
    required this.path,
    required this.filename,
    required this.contentType,
    required this.sizeBytes,
  });

  final String path;
  final String filename;
  final MediaType contentType;
  final int sizeBytes;
}

/// Picks a photo from the camera or the gallery and SHRINKS IT before it goes
/// anywhere near the network.
///
/// ## Why the compression is not optional
///
/// A modern phone camera produces an 8–12 MB JPEG. The upload ceiling for a
/// student attachment is 20 MiB, so most would technically fit — and on
/// Egyptian mobile data most would also take a minute or time out, and the
/// student would conclude the app is broken. The web hit exactly this and
/// added browser-side compression before upload for the same reason.
///
/// The server re-encodes to WebP regardless (that is what strips EXIF and
/// destroys polyglots), so nothing here is a security control. It is purely
/// about the bytes that cross a slow link.
class ImagePickService {
  ImagePickService() : _picker = ImagePicker();

  final ImagePicker _picker;

  /// 1600px on the long edge. A page of handwriting is completely legible at
  /// that size, and it is roughly a tenth of the pixels of a 12 MP original.
  static const _maxDimension = 1600;

  /// 78%. Above ~85 the file grows fast for no visible gain on a photograph;
  /// below ~70 the compression starts showing on pencil strokes, which is
  /// exactly what these photos are of.
  static const _quality = 78;

  Future<Either<Failure, PickedImage?>> pick(ImageSource source) async {
    final XFile? raw;
    try {
      raw = await _picker.pickImage(
        source: source,
        // A first pass in the picker itself, so the decode below is working on
        // a smaller bitmap and a low-memory phone does not OOM on a 50 MP
        // original before compression ever runs.
        maxWidth: _maxDimension.toDouble(),
        maxHeight: _maxDimension.toDouble(),
        imageQuality: 90,
        requestFullMetadata: false,
      );
    } on PlatformException catch (error) {
      // The only PlatformException worth distinguishing: everything else is a
      // transient picker failure, and this one needs a trip to Settings.
      if (error.code == 'camera_access_denied' || error.code == 'photo_access_denied') {
        return Left(PermissionFailure(tr(CopyKeys.commonError), permanentlyDenied: true));
      }
      return Left(ServerFailure(tr(CopyKeys.commonError), code: error.code));
    }

    // Null means the student backed out of the picker. Not an error, and
    // reporting one would put «حصلت مشكلة» on screen for a deliberate act.
    if (raw == null) return const Right(null);

    final directory = await getTemporaryDirectory();
    final target = p.join(
      directory.path,
      'photo-${DateTime.now().millisecondsSinceEpoch}.jpg',
    );

    final compressed = await FlutterImageCompress.compressAndGetFile(
      raw.path,
      target,
      quality: _quality,
      minWidth: _maxDimension,
      minHeight: _maxDimension,
      // ⚠️ `keepExif: false`. The server strips it too, but a photo that never
      // leaves the phone carrying GPS coordinates is one fewer thing to be
      // careful about — and these are photographs taken by children at home.
      keepExif: false,
      format: CompressFormat.jpeg,
    );

    // A compression that fails is not fatal: the original is already within
    // the ceiling and the server will re-encode it anyway. Falling back beats
    // refusing to send a photo the student has already framed.
    final file = File(compressed?.path ?? raw.path);
    if (!file.existsSync()) {
      return Left(ServerFailure(tr(CopyKeys.commonError), code: 'compress'));
    }

    return Right(
      PickedImage(
        path: file.path,
        // The extension is what the server picks its pipeline from — the
        // ORIGINAL name is display-only and may have none at all on iOS.
        filename: p.basename(file.path),
        contentType: MediaType('image', 'jpeg'),
        sizeBytes: file.lengthSync(),
      ),
    );
  }
}
