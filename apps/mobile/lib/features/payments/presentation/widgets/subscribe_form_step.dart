import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/functions/format_price.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/buttons/app_button.dart';
import '../../../../core/presentation/widgets/inputs/app_phone_field.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../../course/domain/entities/course_detail.dart';
import '../../domain/entities/payment_submission.dart';
import '../cubit/subscribe_cubit.dart';
import 'subscribe_instapay_row.dart';
import 'subscribe_screenshot_field.dart';

/// The payment form: where to send the money, who sent it, and the proof.
///
/// ## The order of the three is deliberate
///
/// The NUMBER comes first, because the student is here to make a transfer and
/// everything else is what happens after. Asking for their phone before
/// showing them where to pay is asking for a detail about an act they have not
/// performed.
class SubscribeFormStep extends StatefulWidget {
  const SubscribeFormStep({
    required this.state,
    required this.course,
    required this.onPickScreenshot,
    required this.onSubmit,
    super.key,
  });

  final SubscribeState state;
  final CourseDetail course;
  final VoidCallback onPickScreenshot;
  final VoidCallback onSubmit;

  @override
  State<SubscribeFormStep> createState() => _SubscribeFormStepState();
}

class _SubscribeFormStepState extends State<SubscribeFormStep> {
  /// Owned HERE rather than seeded from the state on every build.
  ///
  /// The cubit is the source of truth for the VALUE, but rebuilding the field
  /// from it would reset the caret to the start on every keystroke — the
  /// classic controlled-input bug, and on a phone number it makes the field
  /// unusable after the third digit.
  late final _phone = TextEditingController(text: widget.state.senderPhone);

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  SubscribeState get state => widget.state;
  CourseDetail get course => widget.course;

  bool get _submitting => state.step == SubscribeStep.submitting;

  /// What THIS screen is about — chosen a step ago, so it is a lookup and
  /// never a guess.
  int? get _amountCents => switch (state.plan) {
        PaymentPlan.monthly => course.monthlyPriceCents,
        PaymentPlan.quarterly => course.quarterlyPriceCents,
        PaymentPlan.yearly => course.yearlyPriceCents,
        PaymentPlan.term => _termPrice,
        null => null,
      };

  int? get _termPrice {
    for (final term in course.terms) {
      if (term.id == state.termId) return term.priceCents;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final amount = _amountCents;
    final instapay = state.instapay;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.x16,
      children: [
        if (amount != null)
          Text(
            tr(
              CopyKeys.subscribePriceLine,
              namedArgs: {'price': formatEgp(amount)},
            ),
            style: type.title3Style(color: c.accentText),
          ),

        Text(
          tr(
            CopyKeys.subscribeInstructions,
            namedArgs: {
              'number': instapay == null
                  ? ''
                  : SubscribeInstapayRow.localDigits(instapay),
            },
          ),
          style: type.bodySm(color: c.fgMuted),
        ),

        if (instapay != null) SubscribeInstapayRow(instapay: instapay),

        AppPhoneField(
          label: tr(CopyKeys.subscribeSenderPhoneLabel),
          controller: _phone,
          isRequired: true,
          enabled: !_submitting,
          onChanged: context.read<SubscribeCubit>().setSenderPhone,
        ),

        SubscribeScreenshotField(
          image: state.screenshot,
          onPick: _submitting ? () {} : widget.onPickScreenshot,
        ),

        if (state.error != null)
          Text(state.error!, style: type.bodySm(color: c.err)),

        // The progress figure is real, not a spinner: a student on mobile data
        // has just moved money and «بنرفع الصورة…» with nothing moving under
        // it is indistinguishable from a stalled request.
        if (_submitting && state.uploadProgress != null)
          LinearProgressIndicator(value: state.uploadProgress),

        AppButton(
          label: tr(
            _submitting ? CopyKeys.subscribeSubmitting : CopyKeys.subscribeSubmit,
          ),
          loading: _submitting,
          onPressed: widget.onSubmit,
        ),
      ],
    );
  }
}
