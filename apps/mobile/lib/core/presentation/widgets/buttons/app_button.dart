import 'package:flutter/material.dart';

import '../../../theme/app_colors.dart';
import '../../../theme/app_motion.dart';
import '../../../theme/app_radius.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_text_style.dart';

/// Which job the button does, which decides its colours.
///
/// Transcribed from `packages/ui/src/components/button.tsx`. The accent is used
/// FLAT — never as a gradient, ever.
enum AppButtonVariant {
  /// The one action on the screen. Amber fill, dark label.
  primary,

  /// An action beside the primary one. Neutral fill with a border.
  secondary,

  /// A tertiary action, or one in a dense row. No fill, no border.
  ghost,

  /// Destructive. Outlined in the error colour rather than filled with it —
  /// a solid red button is louder than the action usually deserves, and «امسح»
  /// sitting next to «إلغاء» as two solid blocks makes the wrong one easy to
  /// hit.
  danger,
}

enum AppButtonSize {
  /// A row action — «مشاهدة», «امتحن», «اقفل الجهاز».
  small,

  /// The default.
  medium,
}

/// The product button.
///
/// ## Height
///
/// 44 logical pixels at both sizes, not the web's 40.
///
/// The web itself raised these from 32 to 40 after «اقفل الجهاز» and «غيّر
/// صورتك» were measured under both platform touch guidelines and WCAG 2.5.5 —
/// and its own `--min-tap-size` token says 44. On the web 40 is a reasonable
/// compromise because a mouse is precise; on a phone there is no mouse, and 44
/// is the floor Apple and Google both publish. So this follows the token
/// rather than the CSS.
///
/// ## `whitespace-nowrap`
///
/// Load-bearing on the web and reproduced here with [maxLines] 1 + ellipsis:
/// the height is locked, so a wrapped label renders proud of its own border.
/// «سلّم الامتحان» in the quiz footer did exactly that at 320px.
class AppButton extends StatefulWidget {
  const AppButton({
    required this.label,
    required this.onPressed,
    this.variant = AppButtonVariant.primary,
    this.size = AppButtonSize.medium,
    this.icon,
    this.trailingIcon,
    this.loading = false,
    this.expand = false,
    this.semanticLabel,
    super.key,
  });

  /// A full-width button, for the bottom of a form or a sheet.
  const AppButton.block({
    required this.label,
    required this.onPressed,
    this.variant = AppButtonVariant.primary,
    this.icon,
    this.trailingIcon,
    this.loading = false,
    this.semanticLabel,
    super.key,
  })  : size = AppButtonSize.medium,
        expand = true;

  final String label;

  /// Null disables the button — 50% opacity and no hit test, matching the web.
  final VoidCallback? onPressed;

  final AppButtonVariant variant;
  final AppButtonSize size;
  final IconData? icon;
  final IconData? trailingIcon;

  /// Swaps the leading icon for a spinner and blocks presses.
  ///
  /// The LABEL STAYS. A button that becomes a bare spinner loses its width and
  /// the row reflows under the student's finger, which is how a double-submit
  /// happens on a slow connection.
  final bool loading;

  final bool expand;
  final String? semanticLabel;

  @override
  State<AppButton> createState() => _AppButtonState();
}

class _AppButtonState extends State<AppButton> {
  bool _pressed = false;

  bool get _enabled => widget.onPressed != null && !widget.loading;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final palette = _palette(c);

    final height = AppSpacing.minTap;
    final padding = widget.size == AppButtonSize.small ? AppSpacing.x12 : AppSpacing.x16;
    final textStyle = widget.size == AppButtonSize.small
        ? type.bodySm(weight: AppTextStyle.medium)
        : type.body(weight: AppTextStyle.medium);

    final foreground = palette.foreground;

    final content = Row(
      mainAxisSize: widget.expand ? MainAxisSize.max : MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      // 8px — the web's `gap-2`.
      spacing: AppSpacing.x8,
      children: [
        if (widget.loading)
          SizedBox(
            width: 16,
            height: 16,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              valueColor: AlwaysStoppedAnimation(foreground),
            ),
          )
        else if (widget.icon != null)
          Icon(widget.icon, size: 18, color: foreground),
        Flexible(
          child: Text(
            widget.label,
            style: textStyle.copyWith(color: foreground),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
          ),
        ),
        if (widget.trailingIcon != null)
          Icon(widget.trailingIcon, size: 18, color: foreground),
      ],
    );

    return Semantics(
      button: true,
      enabled: _enabled,
      label: widget.semanticLabel,
      child: Opacity(
        // The web's `disabled:opacity-50`. Loading is NOT dimmed — the spinner
        // already says the button is busy, and fading it makes a slow network
        // look like a broken control.
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
            height: height,
            width: widget.expand ? double.infinity : null,
            padding: EdgeInsets.symmetric(horizontal: padding),
            decoration: BoxDecoration(
              color: _pressed ? palette.pressedBackground : palette.background,
              borderRadius: AppRadius.smAll,
              border: palette.border == null
                  ? null
                  : Border.all(color: palette.border!, width: 1),
            ),
            child: content,
          ),
        ),
      ),
    );
  }

  _ButtonPalette _palette(AppColors c) {
    return switch (widget.variant) {
      AppButtonVariant.primary => _ButtonPalette(
          background: c.accent,
          pressedBackground: c.accentHover,
          foreground: c.accentContrast,
        ),
      AppButtonVariant.secondary => _ButtonPalette(
          background: c.surface3,
          pressedBackground: c.surface4,
          foreground: c.fg,
          border: c.line,
        ),
      AppButtonVariant.ghost => _ButtonPalette(
          background: Colors.transparent,
          pressedBackground: c.surface3,
          foreground: _pressed ? c.fg : c.fgMuted,
        ),
      AppButtonVariant.danger => _ButtonPalette(
          background: Colors.transparent,
          // 12% — enough to read as pressed, not enough to become a solid red
          // block under a finger.
          pressedBackground: c.err.withValues(alpha: 0.12),
          foreground: c.err,
          border: c.err,
        ),
    };
  }
}

class _ButtonPalette {
  const _ButtonPalette({
    required this.background,
    required this.pressedBackground,
    required this.foreground,
    this.border,
  });

  final Color background;
  final Color pressedBackground;
  final Color foreground;
  final Color? border;
}
