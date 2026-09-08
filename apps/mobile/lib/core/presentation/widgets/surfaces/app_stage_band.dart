import 'package:flutter/material.dart';

import '../../../theme/app_colors.dart';
import '../../../theme/app_radius.dart';
import '../../../theme/app_spacing.dart';

/// The EMBER band a course, a dashboard or a study route introduces itself on
/// — the web's `.stage` (`apps/web/app/study.css:53`).
///
/// ## Ember is STRUCTURE, and that is the whole colour rule
///
/// `packages/ui/src/tokens/color.css` splits the two warm ramps by JOB:
/// amber (`--a-*`, [AppColors.accent]) is ACTION — buttons, the current stop,
/// progress fills; ember (`--e-*`, [AppColors.stage]) is STRUCTURE — the
/// course stage, unit headers, chapter chrome. The point of the split is that
/// a student learns exactly one thing: **orange is what you press.**
///
/// So this band is never a button and never a status. Nothing inside it should
/// be pressable except an explicit chip drawn in amber. A band that responds
/// to a tap teaches the student that the ember is pressable too, and from then
/// on every unit header looks like a dead control.
///
/// ## The foregrounds
///
/// Primary text is [AppColors.inkFg] — white on ember measures 7.30:1 in light
/// (`--e-700`) and 10.03:1 in dark (`--e-800`).
///
/// Secondary text is [secondaryForeground] and NOT [AppColors.inkFg2].
/// `--ink-fg-2` is tuned for the near-black ink panel and measures **2.35:1
/// light / 3.06:1 dark** on this band — under half the required ratio, on the
/// two smallest strings the band carries. `study.css` declares a local
/// `--stage-fg-2` for exactly this reason and so does this widget.
///
/// ## Why the decoration does not mirror
///
/// The radial highlight sits at a physical 85% from the LEFT and the dot
/// texture fades left→right, in both directions. CSS background gradients are
/// not flipped by `dir`, `study.css` annotates the mask as a physical
/// `to right`, and mirroring them here would make the same course header look
/// different on the phone and on the web. Everything a reader can READ is
/// still laid out with `start`/`end`.
class AppStageBand extends StatelessWidget {
  const AppStageBand({
    required this.children,
    this.decoration,
    this.padding = const EdgeInsets.all(AppSpacing.x24),
    this.spacing = AppSpacing.x8,
    this.crossAxisAlignment = CrossAxisAlignment.start,
    this.borderRadius = AppRadius.lgAll,
    super.key,
  });

  /// The band's contents, stacked. Typically an eyebrow, a title, a subtitle
  /// and a row of facts — see `.stage__body` in the design spec, §3.21.
  final List<Widget> children;

  /// An optional art layer painted between the gradient and the dot texture:
  /// a course cover, a subject glyph, a hand-drawn shape.
  ///
  /// Stretched to the whole band and made inert — [IgnorePointer] plus
  /// [ExcludeSemantics] — because it is decoration. A cover image that steals
  /// the tap or announces its own filename to TalkBack is a bug, not a
  /// feature, and this is the layer where that happens by accident.
  final Widget? decoration;

  /// 24 — `.stage__body` on a phone. The web opens it to 32 from 768px up;
  /// nothing this app renders is that wide, so the larger value is not offered
  /// rather than being offered and never correct.
  final EdgeInsetsGeometry padding;

  final double spacing;
  final CrossAxisAlignment crossAxisAlignment;
  final BorderRadius borderRadius;

  /// `--stage-fg-2` — white at 86%.
  ///
  /// The eyebrow, the subtitle and the fact row. It has no home in
  /// [AppColors] because it is not a theme value: it is local to this band in
  /// the web tokens too, since it only ever appears on ember.
  static const Color secondaryForeground = Color(0xDBFFFFFF);

  /// `color-mix(in oklch, --e-stage, white 6%)`, precomputed in §1.17 of the
  /// design spec because an sRGB `Color.lerp` visibly diverges from an OKLCH
  /// mix and there is no OKLab mixer in this app yet.
  ///
  /// The 6% is load-bearing and was 18% when the stage shipped: at 18% the
  /// surface lifted to a lightness where the secondary foreground measured
  /// 2.35:1. Brightening this highlight silently darkens two strings.
  static const Color _highlightLight = Color(0xFFA1422B);
  static const Color _highlightDark = Color(0xFF7F3624);

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final highlight = c.isDark ? _highlightDark : _highlightLight;

    // §7.4 — one physical device pixel. See [AppCard] for why a flat 0.5 is
    // not the same thing on a 1× display.
    final hairline = MediaQuery.devicePixelRatioOf(context) >= 2 ? 0.5 : 1.0;

    return ClipRRect(
      borderRadius: borderRadius,
      child: DecoratedBox(
        decoration: BoxDecoration(
          // `linear-gradient(160deg, --e-stage, --e-stage-deep)`. CSS measures
          // 0deg as "to top" and turns clockwise, so 160deg is the unit vector
          // (sin160, -cos160) = (0.342, 0.940) in a y-down space; the gradient
          // line runs from -v to +v through the centre.
          gradient: LinearGradient(
            begin: const Alignment(-0.342, -0.940),
            end: const Alignment(0.342, 0.940),
            colors: [c.stage, c.stageDeep],
          ),
        ),
        child: Stack(
          children: [
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  // `radial-gradient(120% 140% at 85% 0%, …, transparent 60%)`.
                  gradient: RadialGradient(
                    center: const Alignment(0.7, -1),
                    radius: 1.2,
                    // The far stop is the highlight at ZERO alpha, not
                    // `Colors.transparent`. Flutter interpolates gradient
                    // stops unpremultiplied, so fading to transparent BLACK
                    // drags the midpoint towards black and leaves a dirty
                    // smudge across the top of the band.
                    colors: [highlight, highlight.withValues(alpha: 0)],
                    stops: const [0, 0.6],
                  ),
                ),
              ),
            ),
            if (decoration != null)
              Positioned.fill(
                child: IgnorePointer(
                  child: ExcludeSemantics(child: decoration!),
                ),
              ),
            Positioned.fill(
              child: IgnorePointer(
                child: CustomPaint(painter: const _StageDotTexture()),
              ),
            ),
            DefaultTextStyle.merge(
              style: TextStyle(color: c.inkFg),
              child: IconTheme.merge(
                data: IconThemeData(color: c.inkFg),
                child: Padding(
                  padding: padding,
                  child: Column(
                    crossAxisAlignment: crossAxisAlignment,
                    mainAxisSize: MainAxisSize.min,
                    spacing: spacing,
                    children: children,
                  ),
                ),
              ),
            ),
            // `.stage::after`, z-index 2 — an inset hairline ring at 12% white,
            // painted OVER the body. It is what keeps the band's edge visible
            // where the gradient's dark corner meets a dark page; drawn as a
            // border rather than an inset BoxShadow because Flutter has no
            // inset shadow (§7.6).
            Positioned.fill(
              child: IgnorePointer(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    borderRadius: borderRadius,
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.12),
                      width: hairline,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// `.stage::before` — a 14×14 grid of 1px white dots, fading out towards the
/// physical right edge.
///
/// A painter rather than an image asset: the band is an arbitrary size, and a
/// tiled PNG at this alpha bands visibly once the device scales it.
class _StageDotTexture extends CustomPainter {
  const _StageDotTexture();

  static const double _cell = 14;
  static const double _dotRadius = 1;

  /// The dot's own alpha (14%) times the layer's opacity (55%). Kept as two
  /// named numbers because the CSS has two, and someone comparing the files
  /// should not have to factor 0.077 back apart.
  static const double _dotAlpha = 0.14;
  static const double _layerOpacity = 0.55;

  /// `mask-image: linear-gradient(to right, black 0%, transparent 72%)`.
  static const double _fadeEnd = 0.72;

  @override
  void paint(Canvas canvas, Size size) {
    final fadeWidth = size.width * _fadeEnd;
    if (fadeWidth <= 0) return;

    final paint = Paint();
    for (double y = 0; y < size.height; y += _cell) {
      for (double x = 0; x < size.width; x += _cell) {
        // The canvas origin is the physical top-left whatever the text
        // direction is, which is precisely the behaviour the CSS mask asks
        // for — see the class doc on AppStageBand.
        final mask = 1 - x / fadeWidth;
        // Everything further along the row is fully masked out, so there is
        // nothing left to paint on this line.
        if (mask <= 0) break;
        paint.color = Colors.white.withValues(
          alpha: _dotAlpha * _layerOpacity * mask,
        );
        canvas.drawCircle(Offset(x, y), _dotRadius, paint);
      }
    }
  }

  @override
  bool shouldRepaint(_StageDotTexture oldDelegate) => false;
}
