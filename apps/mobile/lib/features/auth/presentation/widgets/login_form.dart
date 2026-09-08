import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/buttons/app_button.dart';
import '../../../../core/presentation/widgets/inputs/app_password_field.dart';
import '../../../../core/presentation/widgets/inputs/app_text_field.dart';
import '../../../../core/theme/app_spacing.dart';
import '../cubit/login_cubit.dart';
import 'auth_error_banner.dart';

/// The identifier + password pair, and the button that submits them.
///
/// ONE identifier field, not a phone/email toggle. That is the product's
/// decision and it is load-bearing: a student who signed up by phone and later
/// added an email owns both, and a Google student owns an address they never
/// typed. Asking them to classify their own account before they are let in is
/// pushing our schema onto them — the platform already knows which is which.
class LoginForm extends StatefulWidget {
  const LoginForm({super.key});

  @override
  State<LoginForm> createState() => _LoginFormState();
}

class _LoginFormState extends State<LoginForm> {
  final _identifier = TextEditingController();
  final _password = TextEditingController();
  final _passwordFocus = FocusNode();

  @override
  void dispose() {
    _identifier.dispose();
    _password.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  void _submit() {
    // Dismiss the keyboard first. Without it the error banner appears behind
    // the keyboard on a short phone and the student sees the button stop
    // spinning with no explanation.
    FocusScope.of(context).unfocus();
    context.read<LoginCubit>().submit(
      identifier: _identifier.text,
      password: _password.text,
    );
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<LoginCubit, LoginState>(
      builder: (context, state) {
        final cubit = context.read<LoginCubit>();
        final busy = state.isBusy;

        return AutofillGroup(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AuthErrorBanner(failure: state.failure),

              AppTextField(
                label: tr(CopyKeys.authFieldsIdentifier),
                controller: _identifier,
                errorText: state.identifierError,
                enabled: !busy,
                // `emailAddress`, even though it accepts a phone. It is the
                // keyboard that offers both letters and digits without the
                // autocorrect that a plain text keyboard applies — and an
                // Egyptian number typed on a phone keypad still arrives
                // correctly because the field folds Arabic-Indic digits.
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.username],
                onChanged: (_) => cubit.onFieldChanged(),
                onSubmitted: (_) => _passwordFocus.requestFocus(),
              ),
              const SizedBox(height: AppSpacing.x16),

              AppPasswordField(
                label: tr(CopyKeys.authFieldsPassword),
                controller: _password,
                focusNode: _passwordFocus,
                errorText: state.passwordError,
                enabled: !busy,
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.password],
                onChanged: (_) => cubit.onFieldChanged(),
                onSubmitted: (_) => _submit(),
              ),
              const SizedBox(height: AppSpacing.x24),

              AppButton.block(
                label: state.isPending(LoginPending.credentials)
                    ? tr(CopyKeys.authActionsLoginPending)
                    : tr(CopyKeys.authActionsLogin),
                loading: state.isPending(LoginPending.credentials),
                // Disabled while ANY sign-in is running, including a provider
                // sheet — two concurrent sign-ins would race to write the
                // session token.
                onPressed: busy ? null : _submit,
              ),

              // ⚠️ There is deliberately NO "forgot password" link.
              //
              // There is no recovery flow to link to: `sendOTP` throws
              // `OTP_NOT_CONFIGURED` because this deployment can send no
              // messages at all — no SMS provider, no WhatsApp Business
              // credentials, no mail anywhere in the repo. The only reset path
              // is an admin calling `PATCH /api/admin/students/:id/password`.
              // A link that opens a dead end is worse than its absence.
            ],
          ),
        );
      },
    );
  }
}
