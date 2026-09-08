import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../localization/copy_keys.dart';
import '../../../theme/app_colors.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_text_style.dart';

/// The product wordmark: the instructor's portrait, his name, and what the
/// platform teaches.
///
/// Every signed-in surface renders the brand through this one widget — the app
/// bar, the navigation drawer, both auth screens — so the mark only ever
/// changes in one place.
///
/// ## A circle, and a photograph
///
/// The portrait is cropped to a circle here and on the marketing nav, and the
/// asset behind it is a plain square: a pre-masked circular file cannot adapt
/// to a background it does not know, and this one sits on four different
/// surfaces. The 1pt ring is what separates a dark jacket from a dark page.
///
/// ## «المهندس أيمن أبو العلا», not «أيمن أبو العلا»
///
/// [CopyKeys.siteInstructor] rather than `siteName`, and the honorific is not
/// decoration — it is how he is addressed on the about page, in the landing
/// hero and in every meta description. The wordmark was the one surface that
/// dropped it. `site.name` stays the bare name and stays correct where it is
/// still used: a copyright line, and a `Person` in structured data, which takes
/// a name rather than a title.
class BrandLockup extends StatelessWidget {
  const BrandLockup({
    this.compact = false,
    this.showTagline = true,
    this.onInk = false,
    this.onTap,
    super.key,
  });

  /// Portrait only — the name and the tagline are dropped entirely.
  ///
  /// For the one place that genuinely cannot afford them: the app bar on a
  /// phone. At 360pt that bar carries a menu button, this lockup, the assistant
  /// launcher, the notification bell and the account control, and «المهندس أيمن
  /// أبو العلا» is wide enough that on the web the row overflowed and the name
  /// rendered ON TOP of the theme switch. The portrait alone still says whose
  /// platform this is, and the drawer behind the menu button shows the full
  /// lockup a tap away.
  ///
  /// Deliberately not the default: every other caller has room, and a mark
  /// without a name is a weaker brand wherever it is not forced.
  final bool compact;

  final bool showTagline;

  /// For the panels that stay dark in BOTH themes — the auth showcase, the
  /// ember band on the dashboard.
  ///
  /// Without it the lockup reads the theme's own neutrals, which on a surface
  /// that does not follow the theme means near-black text on near-black in
  /// light mode.
  final bool onInk;

  /// Usually a jump to the dashboard. Null leaves the lockup inert, which is
  /// what the auth screens and the drawer header want.
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final dpr = MediaQuery.devicePixelRatioOf(context);

    final nameColor = onInk ? c.inkFg : c.fg;
    final tagColor = onInk ? c.inkFg2 : c.fgMuted;

    final portrait = SizedBox(
      width: _markSize,
      height: _markSize,
      child: DecoratedBox(
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          // Heavier than the generic ink hairline on purpose: this one has to
          // read against a photograph rather than against a flat panel.
          border: Border.all(
            color: onInk ? c.inkFg.withValues(alpha: 0.25) : c.line,
            width: 1,
          ),
        ),
        child: ClipOval(
          child: Image.asset(
            'assets/images/brand_mark.png',
            fit: BoxFit.cover,
            // The source is 512², and this box is 38. Without `cacheWidth` the
            // full bitmap is decoded into memory for every lockup on screen —
            // the app bar and the open drawer are two at once — for a picture
            // painted at a tenth of that.
            cacheWidth: (_markSize * dpr).round(),
            filterQuality: FilterQuality.medium,
          ),
        ),
      ),
    );

    final words = Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          tr(CopyKeys.siteInstructor),
          // 16/600 at a 1.3 line box. The scale's own leading is 1.75, which is
          // right for prose and wrong for a two-line wordmark: at 1.75 the name
          // breaks into two lines that read as two separate labels rather than
          // as one mark.
          style: type
              .body(color: nameColor, weight: AppTextStyle.semibold)
              .copyWith(height: 1.3),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        if (showTagline)
          Text(
            tr(CopyKeys.siteTagline),
            style: type.bodyXs(color: tagColor).copyWith(height: 1.45),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
      ],
    );

    // In the full lockup the name is right there as text, so announcing the
    // portrait too would say the brand twice. Compact has no text at all, and
    // then the portrait IS the label.
    final labelledPortrait = compact
        ? Semantics(
            label: tr(CopyKeys.siteInstructor),
            image: true,
            child: portrait,
          )
        : ExcludeSemantics(child: portrait);

    Widget content = LayoutBuilder(
      builder: (context, constraints) => Row(
        mainAxisSize: MainAxisSize.min,
        // The web's `.brand` gap. There is no 10 on the spacing scale and there
        // should not be one for a single component, so it is spelled as what it
        // is: one step plus a hairline nudge.
        spacing: AppSpacing.x8 + AppSpacing.x2,
        children: [
          labelledPortrait,
          if (!compact)
            // The name has to be able to give way — «المهندس أيمن أبو العلا»
            // does not fit a 360pt bar beside a menu button and three actions,
            // and unbounded it would paint over them. But a flexible child in a
            // Row whose own width is unbounded is an assertion, not an
            // overflow, so the measurement decides: bounded, the name
            // ellipsizes; unbounded, it takes the width it wants, which is the
            // only thing it can do there anyway.
            constraints.hasBoundedWidth
                ? Flexible(child: words)
                : words,
        ],
      ),
    );

    if (onTap != null) {
      content = Semantics(
        button: true,
        child: GestureDetector(
          onTap: onTap,
          behavior: HitTestBehavior.opaque,
          child: ConstrainedBox(
            // The mark is 38 and a tappable one must clear 44, so the row grows
            // rather than the portrait — enlarging the portrait would make the
            // brand a different size depending on whether it happens to be a
            // link on that screen.
            constraints: const BoxConstraints(minHeight: AppSpacing.minTap),
            child: content,
          ),
        ),
      );
    }

    return content;
  }
}

/// 38pt in both forms, so swapping the portrait for a monogram — or dropping
/// the words — moves nothing else in the lockup.
const double _markSize = 38;
