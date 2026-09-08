import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../localization/copy_keys.dart';
import '../../../theme/app_colors.dart';
import '../../../theme/app_radius.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_text_style.dart';
import '../buttons/app_button.dart';

/// «جروب الدفعة» — the WhatsApp group for THIS course's students.
///
/// ## Three WhatsApp entry points on this platform, and they are not the same
///
/// The dashboard's channel card is the one broadcast CHANNEL, which nobody can
/// reply into. The help card is a DM to أيمن about a course. This is the
/// COHORT — the people sitting the same lectures — and it is the only one of
/// the three that is per-course: «كل كورس بيبقى ليه جروب غير الجروب الأساسي
/// الكبير الرسمي».
///
/// ## It disappears rather than falling back
///
/// The URL is null for most courses and that is the intended steady state —
/// «أوقات برضه ممكن أنا ما أعملش جروب أصلاً». Falling back to the platform's
/// official group would put every course's students in one room, which is
/// exactly the situation this field exists to end.
///
/// ## Green from the PALETTE, not from WhatsApp
///
/// The glyph is [AppColors.ok] and not `#25D366`. A raw brand hex is one value
/// for two themes and reads as a sticker on the dark one; the token is already
/// tuned for both and carries the same "this is the friendly one" reading,
/// which is all the colour is doing — saying where the button goes before the
/// sentence is read.
class CourseGroupCard extends StatelessWidget {
  const CourseGroupCard({required this.url, this.courseTitle, super.key});

  /// Null renders NOTHING. See the class note.
  final String? url;

  /// Which course's cohort this is.
  ///
  /// Omitted on the course page and in the player: the surrounding screen is
  /// already about one course and repeating its name is noise. Passed on the
  /// DASHBOARD, where a student in عربي and لغات would otherwise get two
  /// identical «جروب الدفعة» buttons with nothing to say which room each opens.
  final String? courseTitle;

  @override
  Widget build(BuildContext context) {
    final link = url;
    if (link == null || link.isEmpty) return const SizedBox.shrink();

    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Semantics(
      container: true,
      label: tr(CopyKeys.playerGroupTitle),
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.cardInset),
        decoration: BoxDecoration(
          color: c.surface2,
          borderRadius: AppRadius.lgAll,
          border: Border.all(color: c.line),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: AppSpacing.x12,
          children: [
            Row(
              spacing: AppSpacing.x12,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: c.ok.withValues(alpha: 0.14),
                    borderRadius: AppRadius.mdAll,
                  ),
                  child: Icon(Icons.groups_rounded, size: 20, color: c.ok),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: AppSpacing.x2,
                    children: [
                      Text(
                        tr(CopyKeys.playerGroupTitle),
                        style: type.body(
                          color: c.fg,
                          weight: AppTextStyle.semibold,
                        ),
                      ),
                      Text(
                        courseTitle ?? tr(CopyKeys.playerGroupLead),
                        style: type.bodySm(color: c.fgMuted),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            AppButton(
              label: tr(CopyKeys.playerGroupCta),
              icon: Icons.open_in_new_rounded,
              // `externalApplication`, so the tap lands in WhatsApp itself
              // rather than an in-app browser that cannot join a group.
              onPressed: () => launchUrl(
                Uri.parse(link),
                mode: LaunchMode.externalApplication,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
