import 'package:flutter/material.dart';

import '../../../theme/app_spacing.dart';

/// Vertical space inside a [CustomScrollView].
///
/// It exists for one reason: every screen that reaches for `AppScreen.slivers`
/// otherwise writes its own `SliverToBoxAdapter(child: SizedBox(height: 24))`,
/// and once four screens have done that the numbers stop agreeing. Naming the
/// two gaps the scale actually has — the gap between stacked cards and the gap
/// between sections — is what keeps a course page and a dashboard reading like
/// the same product.
///
/// This is a [StatelessWidget] whose build returns a sliver, so it belongs in
/// a `slivers:` list and nowhere else; dropped into a [Column] it throws.
class AppSliverGap extends StatelessWidget {
  const AppSliverGap(this.height, {super.key});

  /// Between two stacked cards — 12pt.
  const AppSliverGap.stack({super.key}) : height = AppSpacing.stackGap;

  /// Between one section and the next — 24pt.
  const AppSliverGap.section({super.key}) : height = AppSpacing.sectionGap;

  final double height;

  @override
  Widget build(BuildContext context) {
    return SliverToBoxAdapter(child: SizedBox(height: height));
  }
}
