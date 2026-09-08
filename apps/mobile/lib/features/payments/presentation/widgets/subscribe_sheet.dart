import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../core/data/settings/settings_repository.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/layout/app_bottom_sheet.dart';
import '../../../../core/services/media/image_pick_service.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../course/domain/entities/course_detail.dart';
import '../../domain/repositories/payments_repository.dart';
import '../cubit/subscribe_cubit.dart';
import 'subscribe_form_step.dart';
import 'subscribe_notice_step.dart';
import 'subscribe_plan_step.dart';
import 'subscribe_term_step.dart';

/// «اشتراك الكورس» — plan, transfer, proof, done.
///
/// ## Why a sheet and not an inline panel
///
/// The flow has its own steps and its own back button. Inline it pushed the
/// rest of the course page down and competed with everything below it for
/// attention; a sheet takes the screen's focus for as long as the student is
/// paying and hands it straight back.
///
/// ⚠️ Opened only on a 403 from the enrolment call — never on prices read at
/// render. Whether this student needs to pay is the server's answer, and the
/// prices on the payload only decide which options the picker shows.
class SubscribeSheet extends StatelessWidget {
  const SubscribeSheet({super.key});

  /// Resolves to true when a submission was filed, so the caller can refresh.
  static Future<bool> show(BuildContext context, CourseDetail course) async {
    final filed = await AppBottomSheet.show<bool>(
      context,
      title: tr(CopyKeys.subscribeTitle),
      builder: (_) => BlocProvider(
        create: (_) => SubscribeCubit(
          payments: sl<PaymentsRepository>(),
          settings: sl<SettingsRepository>(),
          course: course,
        )..start(),
        child: const SubscribeSheet(),
      ),
    );
    return filed ?? false;
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<SubscribeCubit, SubscribeState>(
      builder: (context, state) {
        final cubit = context.read<SubscribeCubit>();

        // The system back gesture walks the STEPS before it closes the sheet.
        // A student on the payment form who taps back means "wrong plan", not
        // "forget the whole thing" — and losing a typed phone number to a
        // stray edge swipe is how a half-finished payment gets abandoned.
        return PopScope(
          canPop: !cubit.back(),
          child: Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.x8),
            child: switch (state.step) {
              SubscribeStep.checking => const SubscribeNoticeStep(
                  messageKey: CopyKeys.subscribeChecking,
                  busy: true,
                ),
              SubscribeStep.unavailable => const SubscribeNoticeStep(
                  messageKey: CopyKeys.subscribeNoNumber,
                  tone: SubscribeNoticeTone.warn,
                ),
              SubscribeStep.pending => const SubscribeNoticeStep(
                  messageKey: CopyKeys.subscribePendingStatus,
                  tone: SubscribeNoticeTone.warn,
                ),
              SubscribeStep.success => const SubscribeNoticeStep(
                  messageKey: CopyKeys.subscribeSuccess,
                  tone: SubscribeNoticeTone.ok,
                ),
              SubscribeStep.choosePlan => SubscribePlanStep(
                  course: cubit.course,
                  rejectionReason: state.rejectionReason,
                  previouslyLapsed: state.previouslyLapsed,
                  onChoose: cubit.choosePlan,
                ),
              SubscribeStep.chooseTerm => SubscribeTermStep(
                  terms: cubit.course.terms,
                  onChoose: cubit.chooseTerm,
                ),
              SubscribeStep.form ||
              SubscribeStep.submitting =>
                SubscribeFormStep(
                  state: state,
                  course: cubit.course,
                  onPickScreenshot: () => _pickScreenshot(context),
                  onSubmit: () => _submit(context),
                ),
            },
          ),
        );
      },
    );
  }

  /// ⚠️ A LOCAL picker, disposed with this sheet.
  ///
  /// The one in the locator would hold a platform channel open for the whole
  /// app; the chat screen builds its own for the same reason.
  Future<void> _pickScreenshot(BuildContext context) async {
    final cubit = context.read<SubscribeCubit>();
    final service = ImagePickService();

    // GALLERY only, no camera sheet. The proof is a screenshot of the
    // student's own InstaPay app — there is nothing to photograph, and
    // offering a camera on this step is an invitation to a blurry picture of
    // another phone.
    final result = await service.pick(ImageSource.gallery);
    if (!context.mounted) return;

    result.fold(
      (_) {},
      (image) {
        if (image != null) cubit.setScreenshot(image);
      },
    );
  }

  Future<void> _submit(BuildContext context) async {
    final filed = await context.read<SubscribeCubit>().submit();
    if (!filed || !context.mounted) return;

    // The success panel is shown INSIDE the sheet and the sheet stays open —
    // a student who has just sent money needs to read that it arrived, not
    // watch the screen they paid on disappear. The pop happens on their tap.
  }
}
