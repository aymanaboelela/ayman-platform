import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/data/settings/settings_repository.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/buttons/app_button.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../../auth/presentation/cubit/auth_cubit.dart';

/// «أهلاً وسهلاً» — the one screen between finishing the wizard and the app.
///
/// ## Why it exists at all
///
/// It offers the WhatsApp channel ONCE, at the only moment a student is
/// guaranteed to be paying attention and has nothing else to do. Asking later,
/// from inside a lecture, is an interruption; asking here is the last step of
/// a thing they were already finishing.
///
/// ⚠️ It passes straight through when no channel is configured. A celebration
/// screen with nothing to offer is a tap between the student and the app.
class WelcomePage extends StatefulWidget {
  const WelcomePage({super.key});

  @override
  State<WelcomePage> createState() => _WelcomePageState();
}

class _WelcomePageState extends State<WelcomePage> {
  String? _channel;
  bool _checked = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final settings = await sl<SettingsRepository>().load();
    if (!mounted) return;

    final channel = settings.contact.whatsappChannel;
    // Nothing to offer — do not make them tap past an empty page.
    if (channel == null || channel.isEmpty) {
      context.go(AppRoutes.dashboard);
      return;
    }
    setState(() {
      _channel = channel;
      _checked = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final name = context.select((AuthCubit cubit) => cubit.user?.name);

    if (!_checked) {
      return Scaffold(
        backgroundColor: c.surface1,
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      backgroundColor: c.surface1,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.screenInset),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              Text(
                tr(CopyKeys.welcomeEyebrow),
                style: type.label(color: c.accentText),
              ),
              const SizedBox(height: AppSpacing.x8),
              Text(
                name == null
                    ? tr(CopyKeys.welcomeTitle)
                    : tr(CopyKeys.welcomeTitleNamed, namedArgs: {'name': name}),
                style: type.title1Style(color: c.fg),
              ),
              const SizedBox(height: AppSpacing.x8),
              Text(
                tr(CopyKeys.welcomeBody),
                style: type.body(color: c.fgMuted),
              ),
              const SizedBox(height: AppSpacing.sectionGap),

              // The three steps, with the first two already done. Seeing them
              // ticked is the receipt for the form they just filled in.
              _WelcomeSteps(),

              const Spacer(),

              AppButton(
                label: tr(CopyKeys.dashboardWhatsappChannelCta),
                icon: Icons.campaign_outlined,
                onPressed: () => launchUrl(
                  Uri.parse(_channel!),
                  mode: LaunchMode.externalApplication,
                ),
              ),
              const SizedBox(height: AppSpacing.x12),
              OutlinedButton(
                onPressed: () => context.go(AppRoutes.dashboard),
                child: Text(tr(CopyKeys.welcomeContinue)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// «الحساب اتعمل · بياناتك اتحفظت · نبدأ الدراسة» — two done, one waiting.
class _WelcomeSteps extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    const steps = [
      (CopyKeys.welcomeStepAccount, true),
      (CopyKeys.welcomeStepProfile, true),
      (CopyKeys.welcomeStepStart, false),
    ];

    return Semantics(
      label: tr(CopyKeys.welcomeStepsLabel),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppSpacing.x8,
        children: [
          for (final (key, done) in steps)
            Container(
              padding: const EdgeInsets.all(AppSpacing.x12),
              decoration: BoxDecoration(
                color: c.surface2,
                borderRadius: AppRadius.mdAll,
                border: Border.all(color: done ? c.ok.withValues(alpha: 0.4) : c.line),
              ),
              child: Row(
                spacing: AppSpacing.x12,
                children: [
                  Icon(
                    done ? Icons.check_circle_rounded : Icons.circle_outlined,
                    size: 20,
                    color: done ? c.ok : c.fgMuted,
                  ),
                  Text(
                    tr(key),
                    style: type.bodySm(color: done ? c.fg : c.fgMuted),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
