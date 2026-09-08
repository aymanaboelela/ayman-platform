import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';

/// The heading over one track cell: a dot, a label, a count.
///
/// ## Why this is NOT an [AppSectionHeader]
///
/// That header is the SECTION object: an ember bar, a title-3 and a rule
/// across the column. Giving the track cell the same one would draw the year
/// and the track at identical weight, and a hierarchy whose two levels look
/// the same is not a hierarchy.
///
/// This is the quieter half of the same vocabulary — an ember DOT rather than
/// a bar, the title one step down, and the count in ember ink so the colour
/// still says "this is a grouping". Two levels is the whole structure: year,
/// then track. A third would be a subject, and the subject already lives on
/// the card.
class LibraryTrackHead extends StatelessWidget {
  const LibraryTrackHead({
    required this.label,
    required this.count,
    super.key,
  });

  final String label;

  /// Pre-formatted — «٤ كورس».
  final String count;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.x12),
      child: Row(
        spacing: AppSpacing.x8,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: c.stage, shape: BoxShape.circle),
          ),
          Expanded(
            child: Text(
              label,
              style: type.title4Style(color: c.fg),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          Text(
            count,
            style: type.numeric(color: c.study, size: type.monoLabel.$1),
          ),
        ],
      ),
    );
  }
}
