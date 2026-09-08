import 'package:flutter/material.dart';

import '../../../theme/app_colors.dart';

/// WHAT a lesson row is — video, quiz, reading, attachment.
///
/// Structural, so it is drawn in EMBER. The chip beside it is what you can DO
/// about the row, so that one is amber. Keeping the two colours on their two
/// jobs is what teaches a student that orange is what you press.
class LessonKindIcon extends StatelessWidget {
  const LessonKindIcon({required this.kind, this.size = 16, this.color, super.key});

  /// `video` | `quiz` | `attachment` | `text`.
  final String kind;

  final double size;

  /// Defaults to [AppColors.study], the ember ink.
  final Color? color;

  /// An unknown kind gets the generic glyph rather than nothing: the API is on
  /// a rolling release and a blank well reads as a broken row.
  static IconData glyphFor(String kind) => switch (kind) {
        'video' => Icons.play_circle_outline_rounded,
        'quiz' => Icons.fact_check_outlined,
        'attachment' => Icons.attach_file_rounded,
        'text' => Icons.article_outlined,
        _ => Icons.circle_outlined,
      };

  @override
  Widget build(BuildContext context) {
    return Icon(
      glyphFor(kind),
      size: size,
      color: color ?? AppColors.of(context).study,
    );
  }
}
