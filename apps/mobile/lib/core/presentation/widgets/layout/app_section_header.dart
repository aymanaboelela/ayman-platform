// `hide TextDirection`: easy_localization re-exports package:intl, which
// declares a TextDirection of its own. Without the hide, every
// `TextDirection.rtl` in this file silently resolves to intl's class — which
// has no `rtl` — instead of dart:ui's.
import 'package:easy_localization/easy_localization.dart' hide TextDirection;
import 'package:flutter/material.dart';

import '../../../localization/copy_keys.dart';
import '../../../theme/app_colors.dart';
import '../../../theme/app_radius.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_text_style.dart';
import 'app_divider.dart';

/// The rule-and-label that opens a group of cards — the web's `.group-head`.
///
/// This is what turns a dashboard from a stack of panels into a page with
/// parts. It matters more here than the CSS suggests: a screen read without
/// visible section objects gets called unfinished, so a list of blocks with no
/// header between them is a bug in this product even when every block is
/// correct.
///
/// The header carries four things, in this order along the inline axis:
///
/// * the ember MARK — a 4×20 pill in [AppColors.stage]. Ember is STRUCTURE and
///   is never pressable; this is the whole reason the mark is ember and the
///   action beside it is amber. Do not "improve" it to the accent.
/// * the optional mono [eyebrow] over the [title].
/// * the optional [count], mono and tabular so a column of section counts
///   lines up.
/// * the optional trailing action — «الكل».
///
/// ## Why the action is a [TextButton] and not an [AppButton]
///
/// «الكل» is a link, not the screen's action. The palette rule is that amber
/// is the one thing you press and `--a-9` is never text, so the link takes
/// `accentText` (`--a-11`, the sanctioned amber ink) rather than a filled
/// amber chip that would compete with the «مشاهدة» button on every row below
/// it. The theme's `textButtonTheme` already supplies that colour and the 44pt
/// minimum height.
class AppSectionHeader extends StatelessWidget {
  const AppSectionHeader({
    required this.title,
    this.eyebrow,
    this.note,
    this.count,
    this.actionLabel,
    this.onAction,
    super.key,
  });

  final String title;

  /// The mono label above the title. Latin-ish by nature — the mono face and
  /// its open tracking are what separate a marker from the prose under it.
  final String? eyebrow;

  /// One muted line under the title, when the section needs to explain itself.
  final String? note;

  /// A pre-formatted count («١٢»). A String rather than an int because Arabic
  /// digits are formatted by the caller, not guessed here.
  final String? count;

  /// Defaults to «الكل» when [onAction] is given without one.
  final String? actionLabel;

  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final isRtl = Directionality.of(context) == TextDirection.rtl;

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.x16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            spacing: AppSpacing.x12,
            children: [
              Container(
                width: 4,
                height: 20,
                decoration: BoxDecoration(
                  color: c.stage,
                  borderRadius: AppRadius.fullAll,
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: AppSpacing.x2,
                  children: [
                    if (eyebrow != null)
                      Text(
                        eyebrow!,
                        style: type.label(color: c.fgFaint),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    Text(
                      title,
                      style: type.title3Style(color: c.fg),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (note != null)
                      Text(note!, style: type.bodySm(color: c.fgMuted)),
                  ],
                ),
              ),
              if (count != null)
                Text(
                  count!,
                  // Tabular mono in ember ink, per `.group-head__count`. The
                  // number is a marker on the structure, not an action, so it
                  // takes the ember colour and not the accent.
                  style: type
                      .numeric(size: type.monoLabel.$1, color: c.study)
                      .copyWith(height: type.monoLabel.$2),
                ),
              if (onAction != null)
                TextButton(
                  onPressed: onAction,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    spacing: AppSpacing.x4,
                    children: [
                      Text(
                        actionLabel ?? tr(CopyKeys.notificationsSeeAll),
                        style: type.bodySm(
                          color: c.accentText,
                          weight: AppTextStyle.medium,
                        ),
                      ),
                      Icon(
                        // «forward» is the inline end, which is the LEFT under
                        // RTL. Picking the glyph by direction rather than
                        // flipping one keeps the arrowhead's optical weight
                        // where the type designer put it.
                        isRtl ? Icons.chevron_left : Icons.chevron_right,
                        size: 18,
                        color: c.accentText,
                      ),
                    ],
                  ),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.x8),
          const AppDivider(),
        ],
      ),
    );
  }
}
