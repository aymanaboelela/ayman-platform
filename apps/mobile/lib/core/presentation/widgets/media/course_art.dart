import 'package:flutter/material.dart';

import '../../../config/app_environment.dart';
import '../../../theme/app_radius.dart';
import 'app_network_image.dart';
import 'subject_artwork.dart';

/// A course's artwork: the uploaded cover when there is one, a generated scene
/// when there is not.
///
/// ## One widget, four screens
///
/// The dashboard card, the library card, the course header and the store's
/// book jacket each want "cover, or else something that is not a grey box".
/// They are the same object — the same course has to look like the same course
/// on all four — so it is written once, exactly as `CourseArt` is on the web.
///
/// ## The caller owns the box
///
/// [aspectRatio] shapes the GENERATED scene, which has no intrinsic height. An
/// uploaded cover is cropped to the same ratio rather than bringing its own,
/// because a grid row mixing the two has to line up at the bottom.
class CourseArt extends StatelessWidget {
  const CourseArt({
    required this.subjectNameAr,
    this.coverKey,
    this.seed,
    this.aspectRatio = 16 / 9,
    this.borderRadius = AppRadius.lgAll,
    super.key,
  });

  /// Picks the hue and the glyph of the generated scene. Two «فيزياء» courses
  /// share a colour on purpose — that is what makes the subject legible at a
  /// glance across the whole app.
  final String subjectNameAr;

  /// The storage key of an uploaded cover, or null — which is the ORDINARY
  /// case. Almost no course has one.
  final String? coverKey;

  /// Varies the SHAPES within a subject's hue, so two physics courses are the
  /// same colour and not the same picture. The course id or slug.
  final String? seed;

  final double aspectRatio;
  final BorderRadius borderRadius;

  @override
  Widget build(BuildContext context) {
    final artwork = SubjectArtwork(
      subject: subjectNameAr,
      seed: seed,
      aspectRatio: aspectRatio,
      borderRadius: borderRadius,
    );

    // No cover: no request, no skeleton, straight to the scene. The generated
    // art is the design, not a placeholder for one.
    if (coverKey == null || coverKey!.isEmpty) return artwork;

    return AppNetworkImage(
      url: AppEnvironment.mediaUrl(coverKey!),
      aspectRatio: aspectRatio,
      borderRadius: borderRadius,
      // A cover that 404s — a deleted object, a stale CDN entry — lands on the
      // same artwork as a course that never had one. A student must never be
      // shown a broken-image glyph for something they did not break.
      fallback: artwork,
    );
  }
}
