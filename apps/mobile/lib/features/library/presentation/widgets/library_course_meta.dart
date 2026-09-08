import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';

/// «١٢ محاضرة · ٣ ساعة ١٠ دقيقة» — the two facts under a course title.
///
/// The GLYPHS are ember and the figures stay muted: the icon is the category
/// marker, the number is the fact. Amber on either would put a second thing on
/// the card claiming to be the thing to press.
class LibraryCourseMeta extends StatelessWidget {
  const LibraryCourseMeta({
    required this.lessonCount,
    required this.duration,
    super.key,
  });

  final int lessonCount;

  /// Pre-formatted by `formatDuration`, so the card and the site's card cannot
  /// disagree about how long a course is.
  final String duration;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final style = type.numeric(color: c.fgMuted, size: type.monoLabel.$1);

    return Wrap(
      spacing: AppSpacing.x16,
      runSpacing: AppSpacing.x4,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        _MetaItem(
          icon: Icons.layers_outlined,
          label: tr(CopyKeys.libraryLessonCount, namedArgs: {'n': '$lessonCount'}),
          style: style,
          iconColor: c.study,
        ),
        _MetaItem(
          icon: Icons.schedule_outlined,
          label: duration,
          style: style,
          iconColor: c.study,
        ),
      ],
    );
  }
}

/// One glyph-and-figure pair.
class _MetaItem extends StatelessWidget {
  const _MetaItem({
    required this.icon,
    required this.label,
    required this.style,
    required this.iconColor,
  });

  final IconData icon;
  final String label;
  final TextStyle style;
  final Color iconColor;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      spacing: AppSpacing.x4,
      children: [
        Icon(icon, size: 14, color: iconColor),
        Text(label, style: style),
      ],
    );
  }
}
