import 'package:flutter/material.dart';

import '../../../theme/app_spacing.dart';
import 'app_skeleton.dart';

/// The placeholder for a list that is still loading — the rail's courses, the
/// notifications feed, an outline of lessons.
///
/// The widths cycle full → wide → narrow and then repeat, which is the web's
/// `SkeletonText`. Three identical bars read as a spinner someone drew badly;
/// three uneven ones read as the paragraph that is about to arrive.
///
/// Every row honours [AppSkeleton]'s 180ms delay independently, and they are
/// built in the same frame, so they appear together — the delay does not
/// stagger them.
class AppSkeletonList extends StatelessWidget {
  const AppSkeletonList({
    this.rows = 3,
    this.rowHeight = 16,
    this.spacing = AppSpacing.x12,
    super.key,
  }) : assert(rows > 0, 'A skeleton list with no rows is an empty box.');

  /// Match the number of rows the real list usually shows above the fold — 3
  /// for the rail, more for a full-screen feed. Fewer placeholders than
  /// content means the page grows when it loads; many more means it shrinks.
  final int rows;

  final double rowHeight;

  /// 12 — the web's `space-y-3`.
  final double spacing;

  @override
  Widget build(BuildContext context) {
    const cycle = [
      AppSkeletonWidth.full,
      AppSkeletonWidth.wide,
      AppSkeletonWidth.narrow,
    ];

    return Column(
      // Each bar is narrower than the column, so without this they would be
      // centred and the ragged edge would land on BOTH sides — which is not
      // what text does in any direction.
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      spacing: spacing,
      children: [
        for (var i = 0; i < rows; i++)
          AppSkeleton(width: cycle[i % cycle.length], height: rowHeight),
      ],
    );
  }
}
