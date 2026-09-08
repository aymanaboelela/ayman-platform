import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';

/// One number with its label — «٤٢٪ / إجمالي تقدّمك».
///
/// The value uses the MONO face with tabular figures. Two reasons, and the
/// second is the load-bearing one: three of these sit side by side, and
/// proportional digits make «100٪» and «42٪» different widths, so the columns
/// stop lining up as the numbers change.
class DashboardStat extends StatelessWidget {
  const DashboardStat({
    required this.value,
    required this.label,
    this.onStage = false,
    super.key,
  });

  final String value;
  final String label;

  /// Whether this sits on the ember band, which carries fixed light-on-dark
  /// text in BOTH themes rather than the page's own foreground.
  final bool onStage;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    const onStageFg = Color(0xFFFFFFFF);
    final valueColour = onStage ? onStageFg : c.fg;
    final labelColour = onStage ? onStageFg.withValues(alpha: 0.72) : c.fgMuted;

    return Semantics(
      // Read as one thing: "42 percent, overall progress" rather than two
      // unrelated fragments in whatever order the traversal happens to take.
      label: '$value — $label',
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: type.numeric(color: valueColour, size: 22, weight: AppTextStyle.semibold),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: AppSpacing.x2),
          Text(
            label,
            style: type.bodyXs(color: labelColour),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}
