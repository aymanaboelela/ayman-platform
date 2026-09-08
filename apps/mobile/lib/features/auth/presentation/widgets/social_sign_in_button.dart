import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_motion.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';

/// A provider sign-in button — Google's G or Apple's mark, then the label.
///
/// Not [AppButton] with an icon, for one reason: the mark must be the
/// provider's own artwork at its own colours. Google's brand guidelines
/// require the multicolour G on a neutral surface and forbid recolouring it,
/// so the icon slot here takes an ASSET, and `AppButton` tints every icon it
/// is given with the button's foreground.
///
/// Everything else — 44pt height, 4px radius, secondary colouring, the
/// disabled treatment — matches `AppButtonVariant.secondary` exactly, so the
/// two sit in a column without looking like different products.
class SocialSignInButton extends StatefulWidget {
  const SocialSignInButton({
    required this.label,
    required this.onPressed,
    this.icon,
    this.assetPath,
    this.loading = false,
    super.key,
  }) : assert(
         icon != null || assetPath != null,
         'A provider button without its mark is just a grey rectangle',
       );

  final String label;

  /// Null disables it.
  final VoidCallback? onPressed;

  /// For Apple, whose mark is a system glyph and is meant to take the
  /// foreground colour.
  final IconData? icon;

  /// For Google, whose mark is artwork and must not be recoloured.
  final String? assetPath;

  final bool loading;

  @override
  State<SocialSignInButton> createState() => _SocialSignInButtonState();
}

class _SocialSignInButtonState extends State<SocialSignInButton> {
  bool _pressed = false;

  bool get _enabled => widget.onPressed != null && !widget.loading;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Semantics(
      button: true,
      enabled: _enabled,
      child: Opacity(
        opacity: widget.onPressed == null ? 0.5 : 1,
        child: GestureDetector(
          onTapDown: _enabled ? (_) => setState(() => _pressed = true) : null,
          onTapUp: _enabled ? (_) => setState(() => _pressed = false) : null,
          onTapCancel: _enabled ? () => setState(() => _pressed = false) : null,
          onTap: _enabled ? widget.onPressed : null,
          behavior: HitTestBehavior.opaque,
          child: AnimatedContainer(
            duration: AppMotion.hover,
            curve: AppMotion.inOut,
            height: AppSpacing.minTap,
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.x16),
            decoration: BoxDecoration(
              color: _pressed ? c.surface4 : c.surface3,
              borderRadius: AppRadius.smAll,
              border: Border.all(color: c.line),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              spacing: AppSpacing.x8,
              children: [
                if (widget.loading)
                  SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor: AlwaysStoppedAnimation(c.fgMuted),
                    ),
                  )
                else if (widget.assetPath != null)
                  Image.asset(
                    widget.assetPath!,
                    width: 18,
                    height: 18,
                    excludeFromSemantics: true,
                  )
                else
                  Icon(widget.icon, size: 20, color: c.fg),
                Flexible(
                  child: Text(
                    widget.label,
                    style: type.body(color: c.fg, weight: AppTextStyle.medium),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
