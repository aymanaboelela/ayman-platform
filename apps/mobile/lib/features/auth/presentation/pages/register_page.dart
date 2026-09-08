import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/di/injection_container.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/media/brand_lockup.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/repositories/auth_repository.dart';
import '../cubit/auth_cubit.dart';
import '../cubit/register_cubit.dart';
import '../widgets/auth_switch_link.dart';
import '../widgets/register_form.dart';

/// «إنشاء حسابك».
class RegisterPage extends StatelessWidget {
  const RegisterPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => RegisterCubit(sl<AuthRepository>()),
      child: const _RegisterView(),
    );
  }
}

class _RegisterView extends StatelessWidget {
  const _RegisterView();

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Scaffold(
      backgroundColor: c.surface1,
      resizeToAvoidBottomInset: true,
      body: SafeArea(
        child: BlocListener<RegisterCubit, RegisterState>(
          listenWhen: (previous, current) =>
              previous.signedIn == null && current.signedIn != null,
          listener: (context, state) {
            // A brand-new account has never onboarded, so the router's
            // redirect will send them straight to `/onboarding` — no
            // round-trip needed to find that out, which is what the web's
            // register form does too.
            context.read<AuthCubit>().adopt(state.signedIn!);
          },
          // Plain scroll, no `spaceBetween` fill: this form is tall enough to
          // scroll on every phone, so pinning the switch link to the bottom
          // would only ever push it further off screen.
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.screenInset,
              vertical: AppSpacing.x24,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Center(child: BrandLockup(showTagline: false)),
                const SizedBox(height: AppSpacing.x32),

                Text(
                  tr(CopyKeys.authRegisterTitle),
                  style: type.title2Style(color: c.fg),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: AppSpacing.x8),
                Text(
                  tr(CopyKeys.authRegisterSubtitle),
                  style: type.bodySm(color: c.fgMuted),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: AppSpacing.x32),

                const RegisterForm(),
                const SizedBox(height: AppSpacing.x24),

                AuthSwitchLink(
                  prompt: tr(CopyKeys.authSwitchHaveAccount),
                  actionLabel: tr(CopyKeys.authSwitchLogin),
                  onTap: () => context.go(AppRoutes.login),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
