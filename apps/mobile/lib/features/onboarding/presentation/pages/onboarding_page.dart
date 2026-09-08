import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/di/injection_container.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/buttons/app_button.dart';
import '../../../../core/presentation/widgets/feedback/app_empty_state.dart';
import '../../../../core/presentation/widgets/surfaces/app_panel.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../../auth/presentation/cubit/auth_cubit.dart';
import '../../domain/repositories/onboarding_repository.dart';
import '../cubit/onboarding_cubit.dart';
import '../widgets/onboarding_identity_header.dart';
import '../widgets/onboarding_privacy_note.dart';
import '../widgets/onboarding_step_progress.dart';
import '../widgets/onboarding_steps.dart';

/// «نكمّل بيانات حسابك» — the four questions between signing up and the app.
///
/// ⚠️ MANDATORY, and there is no way past it: the router bounces a signed-in
/// student with an unfinished profile back here from every protected route. So
/// every dead end has to have a way out — including the one where the
/// taxonomy cannot be read, which is why that state has a retry rather than an
/// error message.
class OnboardingPage extends StatelessWidget {
  const OnboardingPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => OnboardingCubit(sl<OnboardingRepository>())
        // The name the student typed at sign-up, minutes ago. Typing it twice
        // is the kind of thing that makes a form feel like paperwork.
        ..load(knownName: sl<AuthCubit>().user?.name),
      child: const _OnboardingView(),
    );
  }
}

class _OnboardingView extends StatefulWidget {
  const _OnboardingView();

  @override
  State<_OnboardingView> createState() => _OnboardingViewState();
}

class _OnboardingViewState extends State<_OnboardingView> {
  /// ⚠️ Owned HERE and kept across steps. A controller rebuilt with the step
  /// resets the caret to the start on every keystroke, and walking back to a
  /// step would show an empty field over a filled draft.
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _school = TextEditingController();
  final _fatherPhone = TextEditingController();

  @override
  void initState() {
    super.initState();
    // The VISIBLE half of the same seed — the cubit holds the draft, this
    // holds what the field shows. Both, or the student reads a filled field
    // and gets «الاسم الكامل مطلوب».
    final user = sl<AuthCubit>().user;
    if (user != null) _name.text = user.name;
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _school.dispose();
    _fatherPhone.dispose();
    super.dispose();
  }

  static const _titles = [
    CopyKeys.onboardingStep1Title,
    CopyKeys.onboardingStep2Title,
    CopyKeys.onboardingStep3Title,
    CopyKeys.onboardingStep4Title,
  ];

  Future<void> _advance(BuildContext context) async {
    final cubit = context.read<OnboardingCubit>();
    if (!cubit.state.isLastStep) {
      cubit.next();
      return;
    }

    final saved = await cubit.submit();
    if (!saved || !context.mounted) return;

    // The session's `onboardingCompleted` has changed, and the router's
    // redirect reads it. Without this refresh the student is bounced straight
    // back to the wizard they just finished.
    await context.read<AuthCubit>().refresh();
    if (context.mounted) context.go(AppRoutes.welcome);
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return BlocBuilder<OnboardingCubit, OnboardingState>(
      builder: (context, state) {
        final cubit = context.read<OnboardingCubit>();
        final user = context.select((AuthCubit cubit) => cubit.user);

        return Scaffold(
          backgroundColor: c.surface1,
          body: SafeArea(
            child: state.loading
                ? const Center(child: CircularProgressIndicator())
                : ListView(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.screenInset,
                      AppSpacing.x24,
                      AppSpacing.screenInset,
                      AppSpacing.x32,
                    ),
                    children: [
                      Text(
                        tr(CopyKeys.onboardingTitle),
                        style: type.title1Style(color: c.fg),
                      ),
                      const SizedBox(height: AppSpacing.x8),
                      Text(
                        tr(CopyKeys.onboardingSubtitle),
                        style: type.body(color: c.fgMuted),
                      ),
                      const SizedBox(height: AppSpacing.sectionGap),

                      if (state.taxonomyUnavailable)
                        _TaxonomyUnavailable(onRetry: cubit.load)
                      else ...[
                        if (user != null) ...[
                          OnboardingIdentityHeader(
                            name: user.name,
                            identity: user.email ?? user.phoneNumber,
                            avatarUrl: user.image,
                          ),
                          const SizedBox(height: AppSpacing.x16),
                        ],

                        OnboardingStepProgress(
                          step: state.step,
                          total: _titles.length,
                          titleKey: _titles[state.step],
                        ),
                        const SizedBox(height: AppSpacing.x16),

                        AppPanel(
                          child: switch (state.step) {
                            0 => OnboardingStepWho(
                                draft: state.draft,
                                errors: state.fieldErrors,
                                onChanged: cubit.edit,
                                nameController: _name,
                                phoneController: _phone,
                              ),
                            1 => OnboardingStepWhere(
                                draft: state.draft,
                                errors: state.fieldErrors,
                                taxonomy: state.taxonomy,
                                onChanged: cubit.edit,
                                schoolController: _school,
                              ),
                            2 => OnboardingStepYear(
                                draft: state.draft,
                                errors: state.fieldErrors,
                                taxonomy: state.taxonomy,
                                onChanged: cubit.edit,
                              ),
                            _ => OnboardingStepGuardian(
                                errors: state.fieldErrors,
                                onChanged: cubit.edit,
                                controller: _fatherPhone,
                              ),
                          },
                        ),

                        if (state.formError != null) ...[
                          const SizedBox(height: AppSpacing.x12),
                          Semantics(
                            liveRegion: true,
                            child: Text(
                              state.formError!,
                              style: type.bodySm(color: c.err),
                            ),
                          ),
                        ],

                        const SizedBox(height: AppSpacing.x16),
                        Row(
                          spacing: AppSpacing.x12,
                          children: [
                            if (state.step > 0)
                              Expanded(
                                child: OutlinedButton(
                                  onPressed: cubit.back,
                                  child: Text(tr(CopyKeys.onboardingBack)),
                                ),
                              ),
                            Expanded(
                              flex: 2,
                              child: AppButton(
                                label: tr(
                                  state.submitting
                                      ? CopyKeys.onboardingSubmitPending
                                      : state.isLastStep
                                          ? CopyKeys.onboardingSubmit
                                          : CopyKeys.onboardingNext,
                                ),
                                loading: state.submitting,
                                onPressed: () => _advance(context),
                              ),
                            ),
                          ],
                        ),

                        const SizedBox(height: AppSpacing.x16),
                        const OnboardingPrivacyNote(),
                      ],
                    ],
                  ),
          ),
        );
      },
    );
  }
}

/// The taxonomy could not be read.
///
/// ⚠️ This is a DEAD END without the retry: the router keeps sending the
/// student back here, and there is nothing to choose from. The copy is
/// deliberate about whose fault it is — «المشكلة عندنا إحنا مش عندك، وحسابك
/// اتعمل تمام».
class _TaxonomyUnavailable extends StatelessWidget {
  const _TaxonomyUnavailable({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return AppEmptyState(
      icon: Icons.cloud_off_rounded,
      title: tr(CopyKeys.onboardingUnavailableTitle),
      body: tr(CopyKeys.onboardingUnavailableBody),
      actionLabel: tr(CopyKeys.commonRetry),
      onAction: onRetry,
    );
  }
}
