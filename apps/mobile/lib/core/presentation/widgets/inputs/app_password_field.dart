import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../localization/copy_keys.dart';
import '../../../theme/app_colors.dart';
import '../../../theme/app_spacing.dart';
import 'app_text_field.dart';

/// [AppTextField] with a show/hide toggle.
///
/// There is no password reset in this product — `auth.md` §4.7, "There is NO
/// account recovery": a student who mistypes their password at sign-up and
/// does not notice has no way back in on their own, and an admin has to set a
/// new one by hand. That is the whole case for the toggle. It is not a
/// convenience; it is the only proofreading the student gets.
///
/// The field never autocorrects and never offers suggestions, because a
/// keyboard that has learned a password and offers it above the keys has
/// leaked it to the next person who borrows the phone.
class AppPasswordField extends StatefulWidget {
  const AppPasswordField({
    this.label,
    this.isRequired = false,
    this.controller,
    this.focusNode,
    this.hintText,
    this.helperText,
    this.errorText,
    this.textInputAction,
    this.enabled = true,
    this.autofocus = false,
    this.autofillHints = const [AutofillHints.password],
    this.onChanged,
    this.onSubmitted,
    super.key,
  });

  /// Defaults to «كلمة المرور». Pass one for the confirm field
  /// ([CopyKeys.authFieldsConfirmPassword]) or the admin's "set a new
  /// password" dialog.
  final String? label;

  final bool isRequired;
  final TextEditingController? controller;
  final FocusNode? focusNode;
  final String? hintText;
  final String? helperText;
  final String? errorText;
  final TextInputAction? textInputAction;
  final bool enabled;
  final bool autofocus;

  /// [AutofillHints.password] by default. A REGISTRATION form should pass
  /// [AutofillHints.newPassword] instead — that is the hint that makes iOS and
  /// Android offer to generate and save one, and getting it wrong on /register
  /// means the keychain silently never stores the account.
  final Iterable<String>? autofillHints;

  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;

  @override
  State<AppPasswordField> createState() => _AppPasswordFieldState();
}

class _AppPasswordFieldState extends State<AppPasswordField> {
  bool _obscured = true;

  @override
  Widget build(BuildContext context) {
    return AppTextField(
      label: widget.label ?? tr(CopyKeys.authFieldsPassword),
      isRequired: widget.isRequired,
      controller: widget.controller,
      focusNode: widget.focusNode,
      hintText: widget.hintText,
      helperText: widget.helperText,
      errorText: widget.errorText,
      textInputAction: widget.textInputAction,
      enabled: widget.enabled,
      autofocus: widget.autofocus,
      autofillHints: widget.autofillHints,
      onChanged: widget.onChanged,
      onSubmitted: widget.onSubmitted,
      obscureText: _obscured,
      // A password is not prose. Left on, the keyboard capitalises the first
      // letter of an entry the student then cannot see, and the suggestion
      // strip caches it.
      autocorrect: false,
      enableSuggestions: false,
      textCapitalization: TextCapitalization.none,
      keyboardType: TextInputType.visiblePassword,
      suffix: PasswordVisibilityToggle(
        obscured: _obscured,
        enabled: widget.enabled,
        onToggle: () => setState(() => _obscured = !_obscured),
      ),
    );
  }
}

/// The eye in the field's trailing slot.
///
/// It lives beside [AppPasswordField] rather than in its own file because the
/// inputs folder is a fixed, enumerated set; nothing else in the app has a use
/// for it.
///
/// 44 × 44, which is the point of it being a widget at all — as an `IconData`
/// handed to a decoration it would have been an 18px tap, and this is a
/// control students reach for with a thumb while typing.
class PasswordVisibilityToggle extends StatelessWidget {
  const PasswordVisibilityToggle({
    required this.obscured,
    required this.onToggle,
    this.enabled = true,
    super.key,
  });

  final bool obscured;
  final VoidCallback onToggle;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);

    return Semantics(
      button: true,
      enabled: enabled,
      // The label has to change with the state or the control announces the
      // same thing in both, which tells a screen-reader user nothing about
      // what pressing it will do.
      //
      // ⚠️ Borrowed keys: «اعرضه» / «اخفيه» are authored for the book
      // catalogue's visibility action (`admin.books.catalogShow` / `Hide`).
      // They read correctly here, but there is no auth-owned pair — the web
      // has no password toggle at all. Add one to
      // `packages/contracts/src/copy/` and swap these two lines.
      label: obscured
          ? tr(CopyKeys.adminBooksCatalogShow)
          : tr(CopyKeys.adminBooksCatalogHide),
      // GestureDetector rather than `InkResponse`: this design has no ripple
      // anywhere (see AppButton and AppPanel, which both press by changing a
      // colour), and an ink splash inside a decoration also needs a Material
      // ancestor the field does not guarantee — a bottom sheet built straight
      // onto a `Container` throws "No Material widget found" at the moment the
      // student taps the eye.
      //
      // No pressed state, because there is one already: the glyph swaps.
      child: GestureDetector(
        onTap: enabled ? onToggle : null,
        behavior: HitTestBehavior.opaque,
        child: SizedBox(
          width: AppSpacing.minTap,
          height: AppSpacing.minTap,
          child: Icon(
            obscured
                ? Icons.visibility_outlined
                : Icons.visibility_off_outlined,
            size: 18,
            // `--n-11`, not the accent: the eye is a utility, and an amber
            // glyph inside the field competes with the one primary action at
            // the bottom of the form.
            color: c.fgMuted,
          ),
        ),
      ),
    );
  }
}
