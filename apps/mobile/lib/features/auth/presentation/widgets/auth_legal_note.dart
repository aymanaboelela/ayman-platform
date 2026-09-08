import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/config/app_environment.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';

/// «بإنشاء الحساب إنت موافق على شروط الاستخدام و سياسة الخصوصية».
///
/// The two documents open in an IN-APP browser rather than being reimplemented
/// as screens, and that is deliberate on two counts: they change without an app
/// release, so a bundled copy would be the stale one at exactly the moment it
/// mattered; and a privacy policy a student can only read inside the app they
/// have not yet agreed to install is the wrong way round.
class AuthLegalNote extends StatelessWidget {
  const AuthLegalNote({super.key});

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Wrap(
      alignment: WrapAlignment.center,
      crossAxisAlignment: WrapCrossAlignment.center,
      // Wrap, not Row: at 320dp the three fragments do not fit on one line in
      // Arabic, and a Row would overflow rather than break.
      children: [
        // ⚠️ The trailing space is load-bearing. `Wrap` puts NO gap between
        // children, and `spacing:` would also open a gap on the wrapped line,
        // so the separator has to live inside the text — exactly as it does in
        // the HTML this is transcribed from.
        Text(
          '${tr(CopyKeys.authLegalBefore)} ',
          style: type.bodyXs(color: c.fgMuted),
        ),
        _LegalLink(
          label: tr(CopyKeys.legalTermsTitle),
          path: '/terms',
        ),
        Text(
          ' ${tr(CopyKeys.authLegalAnd)} ',
          style: type.bodyXs(color: c.fgMuted),
        ),
        _LegalLink(
          label: tr(CopyKeys.legalPrivacyTitle),
          path: '/privacy',
        ),
      ],
    );
  }
}

/// One underlined link with a real 44pt hit box.
class _LegalLink extends StatelessWidget {
  const _LegalLink({required this.label, required this.path});

  final String label;
  final String path;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Semantics(
      link: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => launchUrl(
          Uri.parse('${AppEnvironment.siteUrl}$path'),
          // `inAppBrowserView`, not `externalApplication`: sending the student
          // out to Chrome to read the terms means they come back to a
          // half-filled form, and on iOS the app is suspended in between.
          mode: LaunchMode.inAppBrowserView,
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.x8),
          child: Text(
            label,
            style: type
                .bodyXs(color: c.accentText, weight: AppTextStyle.medium)
                .copyWith(decoration: TextDecoration.underline),
          ),
        ),
      ),
    );
  }
}
