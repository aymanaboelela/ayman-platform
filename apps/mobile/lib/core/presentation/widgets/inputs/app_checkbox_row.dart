import 'package:flutter/material.dart';

import '../../../theme/app_colors.dart';
import '../../../theme/app_motion.dart';
import '../../../theme/app_radius.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_text_style.dart';

/// A checkbox with its label, where the WHOLE ROW is the target.
///
/// The control itself is 20px — `size-5`, straight off
/// `packages/ui/src/components/checkbox.tsx` — and 20px is less than half the
/// 44pt floor. On the web that is survivable because the `<label>` is wired to
/// the input and a mouse is precise. On a phone it is the difference between a
/// setting that toggles and one the student jabs at three times, so the row
/// takes the gesture and the box only draws the state.
///
/// ## Geometry
///
/// ```
/// box        20 × 20 ; radius --r-xs (3px) ; 1px --border ; bg --n-2
/// [checked]  border AND background --a-9
/// indicator  12px tick in #1A1206 (--accent-contrast, fixed in both themes)
/// disabled   opacity 0.60
/// ```
///
/// The tick is [_CheckGlyphPainter] rather than `Icons.check`: Material's
/// glyph is a different stroke weight with a different elbow angle, and at
/// 12px inside a 20px box beside a lucide-drawn interface that reads as the
/// one control someone imported from another design.
class AppCheckboxRow extends StatelessWidget {
  const AppCheckboxRow({
    required this.value,
    required this.onChanged,
    required this.label,
    this.description,
    this.enabled = true,
    super.key,
  });

  final bool value;

  /// Null and [enabled] `false` mean different things. Null is "this row has
  /// no handler yet" — a placeholder while a screen is being built — and
  /// [enabled] is "the student may not change this right now", which is the
  /// state that dims.
  final ValueChanged<bool>? onChanged;

  final String label;

  /// A second, quieter line. Use it for the consequence rather than a
  /// restatement — «هيظهر للطالب في صفحة الاشتراك», not «اختيار».
  final String? description;

  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final active = enabled && onChanged != null;

    final row = ConstrainedBox(
      constraints: const BoxConstraints(minHeight: AppSpacing.minTap),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: AppSpacing.x12,
        children: [
          Padding(
            // The box is 20 tall inside a row that is at least 44, and it has
            // to line up with the FIRST line of the label rather than float in
            // the middle of a two-line block. 12 is the label's own half
            // leading at `--fs-text-sm`.
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.x12),
            child: AnimatedContainer(
              duration: AppMotion.hover,
              curve: AppMotion.inOut,
              width: _boxSize,
              height: _boxSize,
              decoration: BoxDecoration(
                color: value ? c.accent : c.surface2,
                borderRadius: AppRadius.xsAll,
                border: Border.all(color: value ? c.accent : c.line),
              ),
              child: value
                  ? CustomPaint(
                      painter: _CheckGlyphPainter(color: c.accentContrast),
                    )
                  : null,
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.x12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: AppSpacing.x2,
                children: [
                  Text(
                    label,
                    style: type.bodySm(
                      color: c.fg,
                      weight: AppTextStyle.medium,
                    ),
                  ),
                  if (description != null)
                    Text(
                      description!,
                      style: type.bodyXs(color: c.fgMuted),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );

    // `MergeSemantics` and not `Semantics(container: true)`: the state, the
    // label, the description and the tap action have to land on ONE node.
    // Left as separate nodes a screen reader announces a checkbox, then an
    // unrelated run of text, and the student has to work out that the two
    // belong together — which is exactly the connection this row exists to
    // make obvious.
    return MergeSemantics(
      child: Semantics(
        checked: value,
        enabled: active,
        child: GestureDetector(
          onTap: active ? () => onChanged!(!value) : null,
          // Opaque, so the gaps between the box and the text are part of the
          // target too — the point of the whole widget.
          behavior: HitTestBehavior.opaque,
          child: active ? row : Opacity(opacity: 0.60, child: row),
        ),
      ),
    );
  }

  static const double _boxSize = 20;
}

/// The tick, drawn from the web's own inline SVG: `M3 8.5 6.5 12 13 4.5` on a
/// 16×16 viewBox, stroke-width 2, round cap and join, no fill.
///
/// Scaled to fill whatever box it is given — 12px inside the 20px control,
/// which is `size-3` in the source.
class _CheckGlyphPainter extends CustomPainter {
  const _CheckGlyphPainter({required this.color});

  final Color color;

  static const double _viewBox = 16;

  /// `size-3` inside `size-5` — a 12px tick in a 20px box. The ratio, not the
  /// pixels, so the stroke stays proportional if the control is ever resized.
  static const double _indicatorRatio = 12 / 20;

  @override
  void paint(Canvas canvas, Size size) {
    // Working in viewBox units and scaling once keeps the three points
    // readable as the SVG they came from. It also scales the 2-unit stroke to
    // the 1.5 physical pixels the browser draws at this size.
    final indicator = size.shortestSide * _indicatorRatio;
    final scale = indicator / _viewBox;
    final inset = (size.shortestSide - indicator) / 2;

    canvas
      ..save()
      ..translate(inset, inset)
      ..scale(scale);

    final path = Path()
      ..moveTo(3, 8.5)
      ..lineTo(6.5, 12)
      ..lineTo(13, 4.5);

    canvas
      ..drawPath(
        path,
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2
          ..strokeCap = StrokeCap.round
          ..strokeJoin = StrokeJoin.round,
      )
      ..restore();
  }

  @override
  bool shouldRepaint(_CheckGlyphPainter oldDelegate) =>
      oldDelegate.color != color;
}
