import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/functions/format_price.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../../course/domain/entities/course_detail.dart';
import '../../domain/entities/payment_submission.dart';
import 'subscribe_plan_card.dart';

/// «اختار الباقة» — the plans this course actually sells.
///
/// A plan whose price is null is NOT on sale and is not drawn. That is the
/// ordinary case: most courses sell one or two of the four.
class SubscribePlanStep extends StatelessWidget {
  const SubscribePlanStep({
    required this.course,
    required this.onChoose,
    this.rejectionReason,
    this.previouslyLapsed = false,
    super.key,
  });

  final CourseDetail course;
  final void Function(PaymentPlan plan) onChoose;

  /// Why the LAST attempt was refused, in the admin's own words.
  final String? rejectionReason;

  /// They were subscribed before and it ran out.
  final bool previouslyLapsed;

  /// The cheapest open term's price — the only number a course selling
  /// SEVERAL terms can show before the student picks one.
  int? get _cheapestTermCents {
    if (course.terms.isEmpty) return null;
    return course.terms
        .map((term) => term.priceCents)
        .reduce((a, b) => a < b ? a : b);
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final termCents = _cheapestTermCents;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.x12,
      children: [
        if (previouslyLapsed)
          _Notice(
            text: tr(CopyKeys.subscribePreviouslySubscribedLapsed),
            colour: c.fgMuted,
          ),
        if (rejectionReason != null)
          _Notice(
            // The heading first, then the admin's own words — «اتراجع طلبك»
            // alone leaves the student with nothing to fix.
            text: '${tr(CopyKeys.subscribeRejectedStatus)}\n$rejectionReason',
            colour: c.err,
          ),

        Text(
          tr(CopyKeys.subscribeChoosePlan),
          style: type.title4Style(color: c.fg),
        ),

        if (course.monthlyPriceCents != null)
          SubscribePlanCard(
            icon: Icons.calendar_today_outlined,
            name: tr(CopyKeys.subscribePlanMonthlyLabel),
            price: tr(
              CopyKeys.subscribePriceLine,
              namedArgs: {'price': formatEgp(course.monthlyPriceCents!)},
            ),
            onTap: () => onChoose(PaymentPlan.monthly),
          ),
        if (course.quarterlyPriceCents != null)
          SubscribePlanCard(
            icon: Icons.date_range_outlined,
            name: tr(CopyKeys.subscribePlanQuarterlyLabel),
            price: tr(
              CopyKeys.subscribePriceLine,
              namedArgs: {'price': formatEgp(course.quarterlyPriceCents!)},
            ),
            onTap: () => onChoose(PaymentPlan.quarterly),
          ),
        if (course.yearlyPriceCents != null)
          SubscribePlanCard(
            icon: Icons.event_available_outlined,
            name: tr(CopyKeys.subscribePlanYearlyLabel),
            price: tr(
              CopyKeys.subscribePriceLine,
              namedArgs: {'price': formatEgp(course.yearlyPriceCents!)},
            ),
            onTap: () => onChoose(PaymentPlan.yearly),
          ),
        if (termCents != null)
          SubscribePlanCard(
            icon: Icons.menu_book_outlined,
            name: tr(CopyKeys.subscribePlanTermLabel),
            // «من ٢٥٠ جنيه» when there are several to pick between, the flat
            // price when there is one — a «من» over a single option is a
            // hedge about a number that cannot change.
            price: course.terms.length > 1
                ? tr(
                    CopyKeys.subscribePlanTermFromPrice,
                    namedArgs: {'price': formatEgp(termCents)},
                  )
                : tr(
                    CopyKeys.subscribePriceLine,
                    namedArgs: {'price': formatEgp(termCents)},
                  ),
            onTap: () => onChoose(PaymentPlan.term),
          ),
      ],
    );
  }
}

/// A line of context above the picker — a lapsed subscription, a refusal.
class _Notice extends StatelessWidget {
  const _Notice({required this.text, required this.colour});

  final String text;
  final Color colour;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Container(
      padding: const EdgeInsets.all(AppSpacing.x12),
      decoration: BoxDecoration(
        color: c.surface3,
        borderRadius: AppRadius.mdAll,
        border: Border.all(color: c.line),
      ),
      child: Text(text, style: type.bodySm(color: colour)),
    );
  }
}
