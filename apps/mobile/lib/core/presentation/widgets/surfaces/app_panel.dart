import 'package:flutter/material.dart';

import '../../../theme/app_colors.dart';
import '../../../theme/app_motion.dart';
import '../../../theme/app_radius.dart';
import '../../../theme/app_spacing.dart';

/// The raised surface every signed-in screen is built from — the web's
/// `.panel`.
///
/// It is the dominant container in this product: a dashboard block, a lesson
/// row group, a settings section, an admin table are all this. Using a bare
/// [Container] instead is how a screen ends up half a shade off everything
/// around it.
///
/// ## Two visual strategies, one widget
///
/// LIGHT separates the panel from the page with a real two-layer drop shadow.
/// DARK has NO shadow at all — every shadow token is transparent there — and
/// separates it with [AppColors.panelLit], a 4.5%-white inset line along the
/// top edge. That is not a stylistic flourish: the design's premise is a
/// near-black stage under one warm key light, and objects catch that light on
/// their top edge. Without it every dark screen collapses into a flat sheet of
/// near-black rectangles, which is precisely the complaint («اللون وحش») the
/// highlight was added to answer.
///
/// ## Pressed state
///
/// When [onTap] is given the BORDER warms towards the accent and nothing
/// moves. Deliberately: «a card that lifts under the cursor on a dense screen
/// makes the whole page feel loose». No scale, no elevation, no translate.
class AppPanel extends StatefulWidget {
  const AppPanel({
    required this.child,
    this.onTap,
    this.padding = const EdgeInsets.all(AppSpacing.cardInset),
    this.margin,
    this.background,
    this.borderColor,
    this.borderRadius = AppRadius.lgAll,
    this.clip = false,
    this.semanticLabel,
    super.key,
  });

  final Widget child;

  /// Makes the whole panel a target. Null leaves it inert — and inert is the
  /// default because most panels are containers, not controls.
  final VoidCallback? onTap;

  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;

  /// Defaults to `surface2`. Override only for a panel that must sit ON
  /// another panel, where `surface3` keeps the two apart.
  final Color? background;

  final Color? borderColor;
  final BorderRadius borderRadius;

  /// Whether to clip the child to the corner radius.
  ///
  /// Off by default because clipping forces a save layer on every paint, and
  /// the overwhelming majority of panels contain nothing that reaches the
  /// corners. Turn it on for a panel with a full-bleed image or a progress bar
  /// running to its edge.
  final bool clip;

  final String? semanticLabel;

  @override
  State<AppPanel> createState() => _AppPanelState();
}

class _AppPanelState extends State<AppPanel> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final interactive = widget.onTap != null;

    final border = widget.borderColor ??
        (_pressed && interactive
            // The accent at 38% alpha — the same warm edge the web shows on
            // hover. On a touch device there is no hover, so it lands on press.
            ? c.accent.withValues(alpha: 0.38)
            : c.line);

    Widget content = AnimatedContainer(
      duration: AppMotion.hover,
      curve: AppMotion.inOut,
      padding: widget.padding,
      decoration: BoxDecoration(
        color: widget.background ?? c.surface2,
        borderRadius: widget.borderRadius,
        border: Border.all(color: border, width: 0.5),
        boxShadow: [
          if (!c.isDark)
            const BoxShadow(
              color: Color(0x12000000),
              offset: Offset(0, 2),
              blurRadius: 5,
            ),
        ],
      ),
      child: widget.child,
    );

    if (c.isDark) {
      // `--panel-lit`. Painted as a hairline child rather than as a border
      // side, because a border would darken the other three edges too and the
      // effect is specifically a TOP edge catching the key light.
      content = Stack(
        children: [
          content,
          Positioned(
            top: 0,
            left: AppRadius.lg,
            right: AppRadius.lg,
            child: IgnorePointer(
              child: Container(height: 0.5, color: c.panelLit),
            ),
          ),
        ],
      );
    }

    if (widget.clip) {
      content = ClipRRect(borderRadius: widget.borderRadius, child: content);
    }

    if (interactive) {
      content = GestureDetector(
        onTapDown: (_) => setState(() => _pressed = true),
        onTapUp: (_) => setState(() => _pressed = false),
        onTapCancel: () => setState(() => _pressed = false),
        onTap: widget.onTap,
        behavior: HitTestBehavior.opaque,
        child: content,
      );
    }

    if (widget.margin != null) {
      content = Padding(padding: widget.margin!, child: content);
    }

    return Semantics(
      label: widget.semanticLabel,
      button: interactive,
      container: widget.semanticLabel != null,
      child: content,
    );
  }
}
