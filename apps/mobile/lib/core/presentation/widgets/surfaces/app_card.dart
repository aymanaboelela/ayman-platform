import 'package:flutter/material.dart';

import '../../../theme/app_colors.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_text_style.dart';
import 'app_panel.dart';

/// The web's `Card` — an [AppPanel] with a titled header ruled off from its
/// body.
///
/// The difference between this and a bare [AppPanel] is one hairline, and it
/// carries real meaning: a card has a NAME, and everything under the rule
/// belongs to that name. A settings section, an admin form group, a
/// «آخر الامتحانات» block. A panel with no header is just a surface, and
/// reaching for [AppCard] with `title` left null gets you a panel with two
/// different paddings for no reason — use [AppPanel] directly there instead.
///
/// ## The two paddings are not the same number
///
/// `packages/ui/src/components/card.tsx` is `px-5 py-4` on BOTH header and
/// body — 20 inline, 16 block, not the 16/16 an [AppPanel] uses. That extra 4
/// inline is what stops a card title from sitting flush against the rule's
/// endpoints, which reads as a rendering error rather than as a design.
///
/// ## The rule is `lineSubtle`, not `line`
///
/// `--border-subtle` at 7.8% black / 7.1% white — deliberately one step
/// fainter than the card's own outer border. A divider at the same weight as
/// the frame turns one object into two stacked ones, and a list of five cards
/// then reads as ten.
class AppCard extends StatelessWidget {
  const AppCard({
    required this.child,
    this.title,
    this.subtitle,
    this.trailing,
    this.onTap,
    this.margin,
    this.background,
    this.semanticLabel,
    super.key,
  });

  /// The card's body. Rendered under the rule, at [_blockInset].
  final Widget child;

  /// The card's name. Null renders no header at all — not an empty one.
  final String? title;

  /// A single line of context under the title: a count, a date, a hint.
  final String? subtitle;

  /// The header's inline-end slot — a button, a badge, a menu trigger.
  ///
  /// Sized by its own intrinsic width, so the title column takes whatever is
  /// left. A trailing widget that wants half the header should be given a
  /// width by its caller rather than by this class guessing one.
  final Widget? trailing;

  /// Makes the whole card a target. Inherited from [AppPanel], including its
  /// «nothing moves» press treatment.
  final VoidCallback? onTap;

  final EdgeInsetsGeometry? margin;

  /// Defaults to `surface2` via [AppPanel]. Override only for a card that sits
  /// ON another panel.
  final Color? background;

  final String? semanticLabel;

  /// `px-5 py-4`. Shared by the header and the body so the two columns of text
  /// line up down the card's inline-start edge.
  static const EdgeInsets _blockInset = EdgeInsets.symmetric(
    horizontal: AppSpacing.x20,
    vertical: AppSpacing.x16,
  );

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    // §7.4 of the design spec: every border in this product is exactly ONE
    // physical hairline. A flat 0.5 logical pixel on a 1× display does not
    // round to a device pixel — the compositor anti-aliases it into a pale
    // smear, and the rule that separates the header from the body stops
    // reading as a rule at all.
    final hairline = MediaQuery.devicePixelRatioOf(context) >= 2 ? 0.5 : 1.0;

    final hasHeader = title != null || trailing != null;

    return AppPanel(
      onTap: onTap,
      margin: margin,
      background: background,
      semanticLabel: semanticLabel,
      // The card owns its own padding on both halves; letting the panel add
      // 16 around the outside would inset the rule and leave it floating.
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (hasHeader)
            Container(
              padding: _blockInset,
              decoration: BoxDecoration(
                border: Border(
                  bottom: BorderSide(color: c.lineSubtle, width: hairline),
                ),
              ),
              child: Row(
                // 12 — the gap that keeps a long Arabic title from touching a
                // trailing chip while still reading as one row.
                spacing: AppSpacing.x12,
                children: [
                  if (title != null)
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        spacing: AppSpacing.x4,
                        children: [
                          // `header: true` is what lets a screen-reader user
                          // jump card to card instead of walking every row of
                          // every body on the way down.
                          Semantics(
                            header: true,
                            child: Text(
                              title!,
                              // `CardTitle` is `--fs-title-4` at weight 500,
                              // not the 600 `title4Style` bakes in. The 500
                              // Arabic face is a real file in pubspec.yaml, so
                              // this asks for it by name rather than letting
                              // Flutter synthesise a smeared bold — which is
                              // exactly what `font-synthesis-weight: none`
                              // blocks on the web (§2.3).
                              style: type
                                  .title4Style(color: c.fg)
                                  .copyWith(fontWeight: AppTextStyle.medium),
                              // A card title WRAPS. The header's height is not
                              // locked, and truncating «آخر الامتحانات اللي
                              // خلصتها» to an ellipsis hides the only word
                              // that says which card this is.
                            ),
                          ),
                          if (subtitle != null)
                            Text(subtitle!, style: type.bodySm(color: c.fgMuted)),
                        ],
                      ),
                    )
                  else
                    const Spacer(),
                  ?trailing,
                ],
              ),
            ),
          Padding(padding: _blockInset, child: child),
        ],
      ),
    );
  }
}
