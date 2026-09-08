import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/surfaces/app_tint_panel.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/library_identity.dart';
import 'library_identity_prompt.dart';

/// «إنت في الصف الثاني بكالوريا · لغات» — the line that explains why the
/// courses below are the ones on screen.
///
/// Without it the filtering is invisible: a student looking at four courses
/// under «كورساتك» has no way to tell whether that is everything published, or
/// everything published FOR THEM. Naming the cut is what turns a filtered list
/// into an understandable one.
///
/// ## Why it is ember and not a panel
///
/// A panel would make it the same object as the course cards below it — a
/// raised rectangle in the same fill, first in a column of them. That reads as
/// "here is a card, and here are some more cards", when what it says is
/// "everything under here is filtered by this". The ember tint is the study
/// surface's word for chrome, and against it the cards are plainly the content.
class LibraryIdentityStrip extends StatelessWidget {
  const LibraryIdentityStrip({
    required this.identity,
    required this.onboardingCompleted,
    super.key,
  });

  /// Null when there is no year to filter by, or when the taxonomy could not
  /// be read. Both land on [LibraryIdentityPrompt].
  final LibraryIdentity? identity;

  final bool onboardingCompleted;

  @override
  Widget build(BuildContext context) {
    final current = identity;
    if (current == null) {
      return LibraryIdentityPrompt(onboardingCompleted: onboardingCompleted);
    }

    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    // «{year} · {track}», or the year alone. A year-1 student has no track at
    // all — tracks are chosen at the start of year 2 — so the empty half is
    // correct there, not missing, and «الصف الأول · —» would be a lie.
    final label = current.trackLabelAr == null
        ? current.yearLabelAr
        : tr(
            CopyKeys.libraryIdentity,
            namedArgs: {
              'year': current.yearLabelAr,
              'track': current.trackLabelAr!,
            },
          );

    return AppTintPanel(
      child: Row(
        spacing: AppSpacing.x12,
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: c.stage, shape: BoxShape.circle),
            // `inkFg` — the study surface's "text on an ember fill" step. A
            // bare white inverts wrong in light mode.
            child: Icon(Icons.school_outlined, size: 20, color: c.inkFg),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: AppSpacing.x2,
              children: [
                Text(
                  tr(CopyKeys.libraryIdentityLabel),
                  style: type.label(color: c.fgMuted),
                ),
                Text(
                  label,
                  style: type.title4Style(color: c.fg),
                  // TWO lines, where the web truncates to one. «الصف الثالث
                  // بكالوريا · علمي علوم» is 30 characters and the strip also
                  // carries an avatar and a button, so one line on a 360pt
                  // phone ellipsises the TRACK away — which is half of what
                  // the strip exists to say.
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                // Rendered only when there IS one: a profile from before the
                // question filters by year and track alone, and printing a
                // stream label would claim a filter that is not being applied.
                if (current.schoolStreamLabelAr != null)
                  Text(
                    current.schoolStreamLabelAr!,
                    style: type.bodySm(color: c.fgMuted),
                  ),
              ],
            ),
          ),
          // Quiet, not accent: a link a student takes once a term. The accent
          // on this screen belongs to «نكمّل» on the course they are part-way
          // through, and two amber things is none.
          TextButton(
            onPressed: () => context.go(AppRoutes.section),
            child: Text(
              tr(CopyKeys.libraryIdentityEdit),
              style: type.bodySm(
                color: c.accentText,
                weight: AppTextStyle.medium,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
