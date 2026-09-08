import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/buttons/app_button.dart';
import '../../../../core/presentation/widgets/inputs/app_password_field.dart';
import '../../../../core/presentation/widgets/inputs/app_phone_field.dart';
import '../../../../core/presentation/widgets/inputs/app_text_field.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_spacing.dart';
import '../cubit/register_cubit.dart';
import 'auth_error_banner.dart';
import 'auth_legal_note.dart';

/// The five fields «إنشاء حسابك» asks for, in the order the web asks them.
///
/// The EMAIL is optional and says so in its own label, with a hint explaining
/// why: the platform sends no email at all — no verification, no reset, no
/// notifications — and demanding an address cost registrations from students
/// who do not have one.
class RegisterForm extends StatefulWidget {
  const RegisterForm({super.key});

  @override
  State<RegisterForm> createState() => _RegisterFormState();
}

class _RegisterFormState extends State<RegisterForm> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();

  final _phoneFocus = FocusNode();
  final _emailFocus = FocusNode();
  final _passwordFocus = FocusNode();
  final _confirmFocus = FocusNode();

  @override
  void dispose() {
    for (final c in [_name, _phone, _email, _password, _confirm]) {
      c.dispose();
    }
    for (final f in [_phoneFocus, _emailFocus, _passwordFocus, _confirmFocus]) {
      f.dispose();
    }
    super.dispose();
  }

  void _submit() {
    FocusScope.of(context).unfocus();
    context.read<RegisterCubit>().submit(
      name: _name.text,
      phone: _phone.text,
      email: _email.text,
      password: _password.text,
      confirmPassword: _confirm.text,
    );
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<RegisterCubit, RegisterState>(
      builder: (context, state) {
        final cubit = context.read<RegisterCubit>();
        final errors = state.fieldErrors;
        final busy = state.submitting;

        return AutofillGroup(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AuthErrorBanner(
                failure: state.failure,
                // «ادخل بالرقم ده» — the only failure with a way forward.
                onAction: () => context.go(AppRoutes.login),
              ),

              AppTextField(
                label: tr(CopyKeys.authFieldsName),
                isRequired: true,
                controller: _name,
                errorText: errors.name,
                enabled: !busy,
                textCapitalization: TextCapitalization.words,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.name],
                onChanged: (_) => cubit.onFieldChanged(),
                onSubmitted: (_) => _phoneFocus.requestFocus(),
              ),
              const SizedBox(height: AppSpacing.x16),

              AppPhoneField(
                label: tr(CopyKeys.authFieldsPhone),
                isRequired: true,
                controller: _phone,
                focusNode: _phoneFocus,
                hintText: tr(CopyKeys.authFieldsPhonePlaceholder),
                errorText: errors.phone,
                enabled: !busy,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.telephoneNumber],
                onChanged: (_) => cubit.onFieldChanged(),
                onSubmitted: (_) => _emailFocus.requestFocus(),
              ),
              const SizedBox(height: AppSpacing.x16),

              AppTextField(
                label: tr(CopyKeys.authFieldsEmailOptional),
                controller: _email,
                focusNode: _emailFocus,
                helperText: tr(CopyKeys.authFieldsEmailOptionalHint),
                errorText: errors.email,
                enabled: !busy,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.email],
                onChanged: (_) => cubit.onFieldChanged(),
                onSubmitted: (_) => _passwordFocus.requestFocus(),
              ),
              const SizedBox(height: AppSpacing.x16),

              AppPasswordField(
                label: tr(CopyKeys.authFieldsPassword),
                isRequired: true,
                controller: _password,
                focusNode: _passwordFocus,
                errorText: errors.password,
                enabled: !busy,
                textInputAction: TextInputAction.next,
                // `newPassword`, not `password`: it is what makes iOS and
                // Android offer to GENERATE and save one, instead of offering
                // an existing credential that cannot apply to a new account.
                autofillHints: const [AutofillHints.newPassword],
                onChanged: (_) => cubit.onFieldChanged(),
                onSubmitted: (_) => _confirmFocus.requestFocus(),
              ),
              const SizedBox(height: AppSpacing.x16),

              AppPasswordField(
                label: tr(CopyKeys.authFieldsConfirmPassword),
                isRequired: true,
                controller: _confirm,
                focusNode: _confirmFocus,
                errorText: errors.confirmPassword,
                enabled: !busy,
                textInputAction: TextInputAction.done,
                onChanged: (_) => cubit.onFieldChanged(),
                onSubmitted: (_) => _submit(),
              ),
              const SizedBox(height: AppSpacing.x24),

              AppButton.block(
                label: busy
                    ? tr(CopyKeys.authActionsRegisterPending)
                    : tr(CopyKeys.authActionsRegister),
                loading: busy,
                onPressed: busy ? null : _submit,
              ),
              const SizedBox(height: AppSpacing.x16),

              const AuthLegalNote(),
            ],
          ),
        );
      },
    );
  }
}
