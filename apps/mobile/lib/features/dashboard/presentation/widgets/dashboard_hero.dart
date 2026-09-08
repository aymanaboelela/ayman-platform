import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/media/app_avatar.dart';
import '../../../../core/presentation/widgets/surfaces/app_stage_band.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../../auth/domain/entities/session_user.dart';
import '../../domain/entities/dashboard.dart';
import 'dashboard_stat.dart';

/// The ember band at the top of «حسابي».
///
/// ## Why the student's own face is on it
///
/// Reported directly about this exact screen: «صور، أشكال… شكلها وحش ومصمطة،
/// مافيش روح». The lever that fixed it was not the palette — it was that the
/// student was NOWHERE on their own home screen, and that every block on the
/// page listed what was LEFT rather than what they had done.
///
/// So this band greets them by name, shows their avatar, and states three
/// numbers they earned. It is the only place on the home screen that
/// congratulates rather than instructs.
class DashboardHero extends StatelessWidget {
  const DashboardHero({required this.user, required this.dashboard, super.key});

  final SessionUser? user;
  final Dashboard dashboard;

  @override
  Widget build(BuildContext context) {
    final type = AppTextStyle.of(context);
    // «أهلًا أحمد» — the FIRST name only, the way a person is greeted out
    // loud. `greetingFallback` covers an account with no name at all, which
    // exists: a Google account created before onboarding collected one.
    final firstName = _firstName(user?.name);
    final greeting = firstName == null
        ? tr(CopyKeys.dashboardGreetingFallback)
        : tr(CopyKeys.dashboardGreeting, namedArgs: {'name': firstName});

    // Fixed light-on-dark: the band is `--e-stage`, which carries white text
    // in BOTH themes (measured 7.3:1 light, 10.0:1 dark). Taking these from
    // the theme would invert them along with the page and put dark text on a
    // dark band.
    const onStage = Color(0xFFFFFFFF);
    final onStageMuted = onStage.withValues(alpha: 0.72);

    return AppStageBand(
      padding: const EdgeInsets.all(AppSpacing.x20),
      spacing: AppSpacing.x20,
      children: [
        Row(
          children: [
            AppAvatar(
              name: user?.name ?? '',
              imageUrl: user?.image,
              size: AppAvatarSize.profile,
            ),
            const SizedBox(width: AppSpacing.x12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    tr(CopyKeys.dashboardEyebrow),
                    style: type.label(color: onStageMuted),
                  ),
                  const SizedBox(height: AppSpacing.x4),
                  Text(
                    greeting,
                    style: type.title2Style(color: onStage),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
          ],
        ),

        // Three numbers, side by side. `IntrinsicHeight` is deliberately NOT
        // used to equalise them — it forces an intrinsic pass, and the
        // dividers between them are fixed-height instead.
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: DashboardStat(
                value: '${dashboard.overallPercent}٪',
                label: tr(CopyKeys.dashboardStatOverall),
                onStage: true,
              ),
            ),
            _StageDivider(colour: onStage.withValues(alpha: 0.22)),
            Expanded(
              child: DashboardStat(
                value: '${dashboard.completedLessons}',
                label: tr(CopyKeys.dashboardStatLessonsDone),
                onStage: true,
              ),
            ),
            _StageDivider(colour: onStage.withValues(alpha: 0.22)),
            Expanded(
              child: DashboardStat(
                // Null is «لسه», not «٠٪». A zero average in front of a
                // student who has never sat an exam reads as a failing grade
                // rather than as an absence.
                value: dashboard.averageScore == null
                    ? tr(CopyKeys.dashboardStatNoScores)
                    : '${dashboard.averageScore}٪',
                label: tr(CopyKeys.dashboardStatAverage),
                onStage: true,
              ),
            ),
          ],
        ),
      ],
    );
  }

  /// The first whitespace-separated token, or null.
  ///
  /// Matches `firstName()` in `apps/web/lib/dashboard-view.ts` — including
  /// returning null rather than an empty string for a blank name, which is
  /// what selects the fallback greeting.
  static String? _firstName(String? fullName) {
    if (fullName == null) return null;
    final parts = fullName.trim().split(RegExp(r'\s+'));
    final first = parts.isEmpty ? '' : parts.first;
    return first.isEmpty ? null : first;
  }
}

/// A hairline between two stats on the band.
class _StageDivider extends StatelessWidget {
  const _StageDivider({required this.colour});

  final Color colour;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 0.5,
      height: 36,
      margin: const EdgeInsets.symmetric(horizontal: AppSpacing.x8),
      color: colour,
    );
  }
}
