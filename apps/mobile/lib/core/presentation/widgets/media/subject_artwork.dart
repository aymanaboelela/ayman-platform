import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../theme/app_colors.dart';
import '../../../theme/app_radius.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_text_style.dart';

/// The picture a course wears when it has no cover — which is almost every
/// course.
///
/// ## Why this exists at all
///
/// `courses.cover_key` had no admin control behind it until 2026-08-07, so
/// every course on production was published without one. The coverless
/// fallback used to be a grey panel with a small book icon, which meant four
/// enrolled courses rendered as four identical grey rectangles filling half the
/// dashboard. That is most of why the signed-in surface was described as
/// «مصمطة… مافيش روح», and no amount of tuning the grey was going to fix it:
/// the problem was that the normal case had been designed as an error case.
///
/// So the coverless case is drawn instead — a hue, a composition and a glyph,
/// derived from the subject — and a shelf of courses reads like a shelf of book
/// jackets. An uploaded cover still wins whenever there is one; see
/// `AppNetworkImage`'s `fallback`, which is how the two are wired together.
///
/// ## Keyed on the subject NAME, not on an id
///
/// The hue has to be stable across the dashboard, the library, the public
/// catalog and the player rail, or one course changes colour as a student walks
/// through the app. `subjectNameAr` is the only identifier all four payloads
/// carry — the subject's `id` and `slug` are on none of them — so keying on an
/// id would mean widening three contracts to paint a background. Renaming a
/// subject in the taxonomy re-colours its courses once, which is an acceptable
/// price for a decorative property.
///
/// ## The colour rule this is allowed to step outside
///
/// The product teaches exactly one thing about colour: amber is what you press.
/// Ember is structure, green and red are the quiz's verdict. These eighteen
/// hues are none of those, and what keeps them from eroding that lesson is a
/// rule about WHERE rather than about how many:
///
/// > A decorative hue may only ever fill a NON-INTERACTIVE CATEGORY MARK.
/// > Never a border, never text, never a chip, never a button, never a status.
///
/// This widget and the subject mark are that; nothing else may take a hue.
class SubjectArtwork extends StatelessWidget {
  const SubjectArtwork({
    required this.subject,
    this.seed,
    this.size,
    this.aspectRatio = 16 / 9,
    this.borderRadius = AppRadius.lgAll,
    this.compact,
    super.key,
  });

  /// The exact `subjectNameAr` the API sends — «الفيزياء», «اللغة العربية».
  /// Anything the table does not know still gets a stable colour off the hash
  /// wheel rather than falling back to grey.
  final String subject;

  /// What the shape LAYOUT is derived from: the course id or slug.
  ///
  /// Two courses in one subject must share a hue — that is the entire point —
  /// and must NOT share a composition, or the library shelf looks like the same
  /// image printed twice. Defaults to [subject], which is right for a mark that
  /// stands for the subject itself rather than for one course.
  final String? seed;

  /// A square of this edge — the thumbnail form. When null the artwork fills
  /// the available width at [aspectRatio].
  final double? size;

  final double aspectRatio;
  final BorderRadius borderRadius;

  /// Null means "decide from the measured box", which is almost always what a
  /// caller wants.
  ///
  /// Compact is a LAYOUT switch, not a size: it drops the subject caption and
  /// shrinks the glyph disc. Below about 120pt the full scene is not small, it
  /// is unreadable — a 44pt disc and a caption inside 16pt of padding leave the
  /// shapes no room at all — so what survives is the hue and the composition,
  /// which is all a thumbnail is for.
  final bool? compact;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final art = subjectArt(subject);
    final variant = artVariant(seed ?? subject);

    // Lightness is per THEME, hue is per subject, and chroma never moves.
    // Bright artwork is the point on both surfaces; dark is pulled down just
    // far enough that a grid of four covers does not glare off a #08090A page.
    final (l1, l2) = c.isDark ? (0.60, 0.34) : (0.71, 0.47);

    Widget content = LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth.isFinite
            ? constraints.maxWidth
            : size ?? 0;
        final height = constraints.maxHeight.isFinite
            ? constraints.maxHeight
            : width / aspectRatio;
        final box = Size(width, height);
        final dense = compact ?? (box.shortestSide < 120);

        return DecoratedBox(
          decoration: BoxDecoration(
            gradient: _gradient145(
              box,
              oklch(l1, 0.145, art.hue),
              oklch(l2, 0.120, art.hue),
            ),
          ),
          // `expand` rather than positioned children: a Stack whose children
          // are ALL positioned collapses to the smallest size its constraints
          // allow, which would make the artwork disappear the moment a caller
          // puts it somewhere loosely constrained instead of in an aspect box.
          child: Stack(
            fit: StackFit.expand,
            children: [
              CustomPaint(painter: _SubjectShapes(variant)),
              Padding(
                padding: EdgeInsets.all(dense ? AppSpacing.x8 : AppSpacing.x16),
                child: Column(
                  crossAxisAlignment: dense
                      ? CrossAxisAlignment.center
                      : CrossAxisAlignment.start,
                  mainAxisAlignment: dense
                      ? MainAxisAlignment.center
                      : MainAxisAlignment.spaceBetween,
                  children: [
                    Container(
                      width: dense ? 32 : 44,
                      height: dense ? 32 : 44,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: _scrim,
                        border: Border.all(color: _scrimEdge, width: 1),
                      ),
                      child: Icon(
                        art.glyph,
                        size: dense ? 16 : 24,
                        color: _onArt,
                      ),
                    ),
                    if (!dense)
                      Text(
                        subject,
                        style: type
                            .bodyXs(color: _caption)
                            .copyWith(shadows: _captionShadow),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );

    content = size != null
        ? SizedBox.square(dimension: size, child: content)
        : AspectRatio(aspectRatio: aspectRatio, child: content);

    // Decorative, always. Every call site prints the course title beside this,
    // and the subject name drawn in the corner is in the card's own metadata
    // too — a screen reader announcing the artwork would say both twice.
    return ExcludeSemantics(
      child: ClipRRect(borderRadius: borderRadius, child: content),
    );
  }
}

// ── the colours drawn ON the artwork ─────────────────────────────────────────
//
// White and black alphas, and deliberately NOT tokens. The ground underneath is
// one of eighteen hues in two themes: a colour of its own would have to be
// checked against all thirty-six, while an alpha is only ever the ground made
// lighter or darker and cannot clash with anything. Every neutral step in the
// ramp also inverts between themes, so a token here would flip the artwork's
// internal contrast upside down in dark mode.

/// The glyph disc's scrim. **Black, not white.**
///
/// The obvious frosted-glass recipe — white at 18% — was measured against all
/// eighteen hues at the point of the gradient the disc actually sits on, and a
/// white glyph on it came to 2.90:1 in the light theme (worst hue 190, the
/// cyan-teal of «الكيمياء»). WCAG asks 3:1 of a meaningful non-text graphic, so
/// the one element that says WHICH SUBJECT this is was the thing that failed. A
/// black scrim only ever darkens the ground, which gives the pale hues — the
/// exact ones that were failing — MORE contrast, not less: 6.37:1 light,
/// 9.25:1 dark.
final Color _scrim = Colors.black.withValues(alpha: 0.28);

/// The hairline that keeps the disc's edge visible over the dark end of the
/// gradient, where the scrim alone disappears into it.
final Color _scrimEdge = Colors.white.withValues(alpha: 0.30);

const Color _onArt = Colors.white;

/// The subject caption. It sits in the bottom-inline-start corner, which under
/// the 145° gradient is the artwork's DARKEST point — measured there across all
/// eighteen hues it is 6.03:1 light and 10.29:1 dark, against 2.35:1 at the pale
/// end. The corner is load-bearing, not a layout preference.
final Color _caption = Colors.white.withValues(alpha: 0.88);

final List<Shadow> _captionShadow = [
  Shadow(
    color: Colors.black.withValues(alpha: 0.25),
    offset: const Offset(0, 1),
    blurRadius: 2,
  ),
];

/// CSS `linear-gradient(145deg, …)` in Flutter's alignment space.
///
/// CSS measures the angle clockwise from "up" and then extends the gradient
/// line until the box's corners project onto its ends, which is why this needs
/// the box: at 16/9 the same angle produces very different endpoints from the
/// square the numbers are usually quoted for. Getting it wrong is not subtle —
/// the two stops stop reaching the corners and every cover looks washed out at
/// one end.
LinearGradient _gradient145(Size box, Color from, Color to) {
  const angle = 145 * math.pi / 180;
  final dx = math.sin(angle);
  final dy = -math.cos(angle);
  if (box.width <= 0 || box.height <= 0) {
    return LinearGradient(colors: [from, to]);
  }
  final length = (box.width * dx).abs() + (box.height * dy).abs();
  final ax = length * dx / box.width;
  final ay = length * dy / box.height;
  return LinearGradient(
    begin: Alignment(-ax, -ay),
    end: Alignment(ax, ay),
    colors: [from, to],
  );
}

/// The three compositions.
///
/// Each is a large disc anchoring the frame, a ring or a rotated square for a
/// second silhouette, and a dot field cropped to part of the canvas — the same
/// three ingredients arranged differently, so the set has a family resemblance
/// rather than being three unrelated styles.
///
/// ⚠️ Every shape is anchored to the LEFT of the 320×180 drawing space and is
/// **not mirrored under RTL**, while the glyph and the caption sit at the
/// inline start, which in this product is the RIGHT. That is what keeps a disc
/// from landing behind the caption. Mirroring this painter would put them on
/// top of each other on every card in the app.
class _SubjectShapes extends CustomPainter {
  const _SubjectShapes(this.variant);

  final int variant;

  static const double _artWidth = 320;
  static const double _artHeight = 180;

  @override
  void paint(Canvas canvas, Size size) {
    if (size.isEmpty) return;

    final wash = Paint()..color = Colors.white.withValues(alpha: 0.13);
    final shade = Paint()..color = Colors.black.withValues(alpha: 0.12);
    final ring = Paint()
      ..color = Colors.white.withValues(alpha: 0.22)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;

    canvas.save();
    canvas.clipRect(Offset.zero & size);

    // `preserveAspectRatio="xMidYMid slice"` — the shapes are a composition,
    // not a diagram, so they crop rather than squash when the slot is a
    // different ratio from the 16/9 they are drawn in.
    final scale = math.max(size.width / _artWidth, size.height / _artHeight);
    canvas.translate(
      (size.width - _artWidth * scale) / 2,
      (size.height - _artHeight * scale) / 2,
    );
    canvas.scale(scale);

    switch (variant) {
      case 0:
        canvas.drawCircle(const Offset(46, 150), 86, wash);
        canvas.drawCircle(const Offset(72, 40), 52, shade);
        canvas.drawCircle(const Offset(60, 52), 34, ring);
        _dots(canvas, const Rect.fromLTWH(0, 0, 150, 180), 0.5);
      case 1:
        canvas.drawCircle(const Offset(30, 30), 104, wash);
        canvas.save();
        canvas.translate(62, 140);
        canvas.rotate(-18 * math.pi / 180);
        canvas.translate(-62, -140);
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            const Rect.fromLTWH(18, 96, 88, 88),
            const Radius.circular(22),
          ),
          shade,
        );
        canvas.restore();
        canvas.drawCircle(const Offset(104, 128), 30, ring);
        _dots(canvas, const Rect.fromLTWH(0, 0, 130, 120), 0.45);
      default:
        canvas.drawCircle(const Offset(24, 96), 118, wash);
        canvas.drawCircle(const Offset(90, 150), 46, shade);
        canvas.drawCircle(const Offset(88, 34), 40, ring);
        canvas.drawCircle(const Offset(88, 34), 62, ring);
        _dots(canvas, const Rect.fromLTWH(0, 30, 140, 150), 0.45);
    }

    canvas.restore();
  }

  /// The dot field: a 12×12 tile with a 1.5-radius dot in its corner, cropped
  /// to [region].
  ///
  /// The region's opacity is folded into the dot's own alpha rather than drawn
  /// inside a `saveLayer`. A layer here would cost an offscreen buffer per card
  /// on a scrolling dashboard, and multiplying two constants gives the identical
  /// result because the dots never overlap each other.
  void _dots(Canvas canvas, Rect region, double opacity) {
    final paint = Paint()
      ..color = Colors.white.withValues(alpha: 0.22 * opacity);
    canvas.save();
    canvas.clipRect(region);
    // Tiles are laid from the drawing space's origin, not the region's, so two
    // regions on one card stay on the same grid.
    for (double y = (region.top / 12).floor() * 12; y < region.bottom; y += 12) {
      for (
        double x = (region.left / 12).floor() * 12;
        x < region.right;
        x += 12
      ) {
        canvas.drawCircle(Offset(x + 1.5, y + 1.5), 1.5, paint);
      }
    }
    canvas.restore();
  }

  // Nothing here reads the theme — every shape is a white or black alpha — so
  // the composition is the only thing that can invalidate a repaint.
  @override
  bool shouldRepaint(_SubjectShapes oldDelegate) =>
      oldDelegate.variant != variant;
}

/// A subject's hue and glyph.
@immutable
class SubjectArt {
  const SubjectArt(this.hue, this.glyph);

  /// OKLCH hue angle, 0–360.
  final double hue;

  final IconData glyph;
}

/// Every subject the taxonomy ships with, keyed on the exact `nameAr` the API
/// sends.
///
/// The hues are chosen to be far apart rather than sequential, because the
/// subjects one student holds at once are neighbours in this list — a science
/// student takes physics, chemistry and biology together, and they must not
/// arrive as three shades of the same blue.
///
/// The glyphs are the nearest Material equivalents of the lucide set the web
/// draws (`Sigma`, `Atom`, `FlaskConical`, …). Material has no atom, so
/// «الفيزياء» takes the node-and-spokes `hub`, which is the closest thing in
/// the font to a nucleus with orbits.
const Map<String, SubjectArt> _subjectTable = {
  'الرياضيات': SubjectArt(265, Icons.functions),
  'الفيزياء': SubjectArt(225, Icons.hub_outlined),
  'الكيمياء': SubjectArt(190, Icons.science_outlined),
  'الأحياء': SubjectArt(160, Icons.eco_outlined),
  'البرمجة وعلوم الحاسب': SubjectArt(300, Icons.data_object),
  'اللغة العربية': SubjectArt(30, Icons.edit_outlined),
  'اللغة الأجنبية الأولى': SubjectArt(245, Icons.translate),
  'اللغة الأجنبية الثانية': SubjectArt(330, Icons.translate),
  'التاريخ المصري': SubjectArt(55, Icons.account_balance_outlined),
  'الجغرافيا': SubjectArt(135, Icons.public),
  'الفلسفة والمنطق': SubjectArt(280, Icons.psychology_outlined),
  'التربية الدينية': SubjectArt(100, Icons.nightlight_outlined),
  'العلوم المتكاملة': SubjectArt(175, Icons.biotech_outlined),
  'المحاسبة': SubjectArt(85, Icons.calculate_outlined),
  'إدارة الأعمال': SubjectArt(20, Icons.work_outline),
  'علم النفس': SubjectArt(310, Icons.monitor_heart_outlined),
  'الاقتصاد': SubjectArt(45, Icons.trending_up),
  'الإحصاء': SubjectArt(205, Icons.bar_chart),
};

/// The hue and glyph for a subject, with a stable colour for the ones the table
/// has never heard of.
SubjectArt subjectArt(String subjectNameAr) {
  final known = _subjectTable[subjectNameAr.trim()];
  if (known != null) return known;
  return SubjectArt(decorativeHue(subjectNameAr).toDouble(), Icons.menu_book);
}

/// Which of the three compositions a piece of artwork uses.
int artVariant(String seed) => fnv1a32(seed) % 3;

/// FNV-1a, 32-bit.
///
/// ⚠️ Ported to match `apps/web/lib/subject-art.ts` byte for byte, including
/// the mask that stands in for JavaScript's `Math.imul`: the same course must
/// be the same colour in the browser and in the app, and a student who opens
/// the web app and the phone app side by side will notice a subject that
/// changes colour long before anybody notices anything else about the hash.
///
/// Iterates UTF-16 code units, like `charCodeAt`, not runes — an Arabic subject
/// name is entirely inside the BMP, but «البرمجة وعلوم الحاسب» would still hash
/// differently under either reading if one platform decoded surrogate pairs and
/// the other did not.
///
/// Chosen over a character sum because a sum collides on anagrams, and Arabic
/// subject names differ from each other by a letter or two far more often than
/// English ones do — «الجغرافيا» and «الفلسفة» must not land on the same hue.
int fnv1a32(String value) {
  var h = 2166136261;
  for (final unit in value.codeUnits) {
    h ^= unit;
    h = (h * 16777619) & 0xFFFFFFFF;
  }
  return h;
}

/// A hue for anything the table does not know, on a 24-step wheel rather than
/// on all 360.
///
/// Two names three degrees apart are the same colour to a reader and only look
/// like a bug; 15° is the smallest step that still reads as a different colour
/// at this chroma. Shared with `AppAvatar`, which tints a student's monogram
/// off the same wheel so that the app has exactly one way of turning a name
/// into a colour.
int decorativeHue(String value) => (fnv1a32(value) % 24) * 15;

/// `oklch(L C H)` as sRGB.
///
/// The design tokens are authored in OKLCH because it is perceptually uniform:
/// eighteen hues at one lightness and chroma read as one set lit the same way,
/// which is exactly what stops a grid of covers looking like a paintbox. HSL
/// cannot do that — its yellows come out far brighter than its blues at the
/// same "lightness" — so the conversion has to happen here rather than the
/// values being re-authored in something Flutter reads natively.
Color oklch(double lightness, double chroma, double hue) {
  final h = hue * math.pi / 180;
  final a = chroma * math.cos(h);
  final b = chroma * math.sin(h);

  // OKLab → LMS (cube roots), then LMS → linear sRGB.
  final l = math.pow(lightness + 0.3963377774 * a + 0.2158037573 * b, 3)
      .toDouble();
  final m = math.pow(lightness - 0.1055613458 * a - 0.0638541728 * b, 3)
      .toDouble();
  final s = math.pow(lightness - 0.0894841775 * a - 1.2914855480 * b, 3)
      .toDouble();

  return Color.from(
    alpha: 1,
    red: _srgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    green: _srgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    blue: _srgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  );
}

/// Linear light → sRGB, clamped.
///
/// The clamp is not defensive: a chroma of 0.145 is outside the sRGB gamut at
/// some hues, and OKLCH is a larger space than the screen. Clipping is what the
/// browser does with these same values, so clipping is what keeps the two
/// platforms showing the same colour.
double _srgb(double channel) {
  final v = channel <= 0.0031308
      ? 12.92 * channel
      : 1.055 * math.pow(channel, 1 / 2.4) - 0.055;
  return v.clamp(0.0, 1.0).toDouble();
}
