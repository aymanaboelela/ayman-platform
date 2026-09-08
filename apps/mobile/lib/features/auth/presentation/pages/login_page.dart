import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/di/injection_container.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/services/social_auth/social_auth_service.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../../../core/presentation/widgets/media/brand_lockup.dart';
import '../../domain/repositories/auth_repository.dart';
import '../cubit/auth_cubit.dart';
import '../cubit/login_cubit.dart';
import '../widgets/auth_switch_link.dart';
import '../widgets/login_form.dart';
import '../widgets/social_sign_in_section.dart';

/// «تسجيل الدخول».
///
/// Not built on `AppScreen`: that widget is for the signed-in product surface
/// and applies `.product-type` (one rung larger) plus a back button and a
/// drawer. Sign-in is a public route on the base type scale with nothing
/// behind it to go back to.
///
/// The web pairs this form with a dark showcase panel on the right. There is
/// no room for it on a phone and it is deliberately dropped — the panel exists
/// to fill a 1440px column, and a screenshot of it stacked above the form on a
/// 360px screen pushes the password field below the fold.
class LoginPage extends StatelessWidget {
  const LoginPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => LoginCubit(sl<AuthRepository>()),
      child: const _LoginView(),
    );
  }
}

class _LoginView extends StatelessWidget {
  const _LoginView();

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Scaffold(
      backgroundColor: c.surface1,
      // The keyboard must push the form, not cover it: at 360×640 the password
      // field sits exactly where an Android keyboard's top edge lands.
      resizeToAvoidBottomInset: true,
      body: SafeArea(
        child: BlocListener<LoginCubit, LoginState>(
          // `listenWhen` on the identity of the user rather than on the whole
          // state: without it the listener fires again on every subsequent
          // rebuild and pushes a second navigation.
          listenWhen: (previous, current) =>
              previous.signedIn == null && current.signedIn != null,
          listener: (context, state) {
            // Handing the user to AuthCubit is what moves the router — the
            // redirect sees `AuthSignedIn` and leaves `/login` on its own.
            // Navigating from here as well would race it.
            context.read<AuthCubit>().adopt(state.signedIn!);
          },
          // ⚠️ NOT `SliverFillRemaining(hasScrollBody: false)` + `Spacer`.
          //
          // That combination measures the child's INTRINSIC height, and the
          // subtree contains `LayoutBuilder`s (inside the text fields and the
          // animated error banner) which cannot report one — Flutter throws
          // "LayoutBuilder does not support returning intrinsic dimensions"
          // and the whole page renders blank, with the real message buried
          // under 150 frames of paint stack.
          //
          // `ConstrainedBox(minHeight:)` + `spaceBetween` gets the same
          // layout — content at the top, the switch link pinned to the bottom
          // on a tall screen, everything scrolling on a short one — using only
          // the incoming constraint, which is already known.
          child: LayoutBuilder(
            builder: (context, constraints) => SingleChildScrollView(
              // `always`, so the student can dismiss the keyboard by dragging
              // even when the content already fits.
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.screenInset,
                vertical: AppSpacing.x24,
              ),
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  minHeight: constraints.maxHeight - AppSpacing.x48,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const SizedBox(height: AppSpacing.x24),
                        const Center(child: BrandLockup(showTagline: false)),
                        const SizedBox(height: AppSpacing.x32),

                        Text(
                          tr(CopyKeys.authLoginTitle),
                          style: type.title2Style(color: c.fg),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: AppSpacing.x8),
                        Text(
                          tr(CopyKeys.authLoginSubtitle),
                          style: type.bodySm(color: c.fgMuted),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: AppSpacing.x32),

                        const LoginForm(),

                        BlocBuilder<LoginCubit, LoginState>(
                          builder: (context, state) => SocialSignInSection(
                            service: sl<SocialAuthService>(),
                            pending: state.pending,
                            busy: state.isBusy,
                            onGoogle: context.read<LoginCubit>().withGoogle,
                            onApple: context.read<LoginCubit>().withApple,
                          ),
                        ),
                      ],
                    ),

                    Padding(
                      padding: const EdgeInsets.only(top: AppSpacing.x24),
                      child: AuthSwitchLink(
                        prompt: tr(CopyKeys.authSwitchNoAccount),
                        actionLabel: tr(CopyKeys.authSwitchCreateAccount),
                        onTap: () => context.go(AppRoutes.register),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
