import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/functions/format_price.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../../course/domain/entities/course_detail.dart';
import 'subscribe_plan_card.dart';

/// «اختار الترم» — the second choice a term purchase needs.
///
/// Only reached when there is more than one open, priced term: a course with
/// exactly one goes straight to the payment form, because a picker with a
/// single option is not a question.
class SubscribeTermStep extends StatelessWidget {
  const SubscribeTermStep({
    required this.terms,
    required this.onChoose,
    super.key,
  });

  final List<CourseTerm> terms;
  final void Function(CourseTerm term) onChoose;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.x12,
      children: [
        Text(
          tr(CopyKeys.subscribeChooseTermTitle),
          style: type.title4Style(color: c.fg),
        ),
        for (final term in terms)
          SubscribePlanCard(
            icon: Icons.bookmark_outline_rounded,
            name: term.title,
            price: tr(
              CopyKeys.subscribePriceLine,
              namedArgs: {'price': formatEgp(term.priceCents)},
            ),
            onTap: () => onChoose(term),
          ),
      ],
    );
  }
}
