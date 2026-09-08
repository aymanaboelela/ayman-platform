// `hide TextDirection`: easy_localization re-exports package:intl, which
// declares a TextDirection of its own. Without the hide, every
// `TextDirection.rtl` in this file silently resolves to intl's class — which
// has no `rtl` — instead of dart:ui's.
import 'package:easy_localization/easy_localization.dart' hide TextDirection;
import 'package:flutter/material.dart';

import '../../../localization/copy_keys.dart';
import '../../../theme/app_colors.dart';
import '../../../theme/app_motion.dart';
import '../../../theme/app_radius.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_text_style.dart';
import '../buttons/app_button.dart';
import '../feedback/app_badge.dart';

/// One row in a list — a lesson, an exam sitting, a book order, a device.
///
/// ## A row has a BUTTON, not a chevron
///
/// This is the requirement the widget exists to serve, asked for repeatedly
/// and by name: «مشاهدة», «امتحن» — a real, labelled control at the inline end
/// of the row, not a row that is merely tappable with a chevron hinting that
/// something might happen. So [actionLabel] + [onAction] are the primary way
/// to build a row, and the chevron is a fallback for rows that genuinely have
/// no name for their action (an inbox thread, a settings page).
///
/// The button is amber ([AppButtonVariant.primary]) because amber is the one
/// thing you press. The row underneath may also be tappable — the whole row is
/// a bigger target than the button and a student's thumb will find it first —
/// but the row's own press state is a background change only. Two amber
/// objects in one row would make neither of them read as the action.
///
/// ## The row wraps below 480px, exactly as the web does
///
/// `.lesson-row` re-flows at `30rem`: the action drops to a second line
/// indented 52pt (the well plus its gap) so the title keeps the full width.
/// That threshold is below every phone this ships to, which means the STACKED
/// layout is the normal one and the inline layout is for tablets and
/// foldables. It looks like a lot of vertical space until you try the
/// alternative: at 360pt, «الدرس الأول: مقدمة عن المتغيرات» beside a «مشاهدة»
/// button gets about 190pt and wraps to three lines anyway, and then the
/// button is floating beside a paragraph.
///
/// ## Locked rows
///
/// Locked lessons are common — a course opens week by week. A locked row keeps
/// its shape and loses its colour: the well goes neutral with a lock glyph,
/// the title drops to `fgMuted`, the action button is disabled (50%, no hit
/// test) and, when there is no action, a «مقفول» badge takes its place. The
/// state is carried in WORDS as well as in weight, because a dimmed row alone
/// tells a screen reader nothing.
class AppListRow extends StatefulWidget {
  const AppListRow({
    required this.title,
    this.subtitle,
    this.meta,
    this.leading,
    this.leadingIcon,
    this.leadingNumber,
    this.trailing,
    this.actionLabel,
    this.onAction,
    this.actionVariant = AppButtonVariant.primary,
    this.onTap,
    this.locked = false,
    this.semanticLabel,
    super.key,
  })  : assert(
          (leading == null ? 0 : 1) +
                  (leadingIcon == null ? 0 : 1) +
                  (leadingNumber == null ? 0 : 1) <=
              1,
          'A row has one leading visual: a widget, an icon, or a number.',
        ),
        assert(
          onAction == null || actionLabel != null,
          'An action button without a label is the chevron this widget exists '
          'to replace. Give it a verb: «مشاهدة», «امتحن».',
        );

  /// WRAPS, never truncates. `.lesson-row__title` carries
  /// `overflow-wrap: anywhere` precisely so a long Arabic lesson name is
  /// readable instead of ending in an ellipsis three words in.
  final String title;

  /// A muted second line, in prose.
  final String? subtitle;

  /// The mono, tabular figure line — a duration «١٢:٣٠», a mark «١٨/٢٠», a
  /// date. Tabular so a column of them does not jitter row to row.
  final String? meta;

  /// A custom 36pt leading visual: a course thumbnail, an avatar. Clipped to
  /// the well's radius so an image cannot square off a rounded row.
  final Widget? leading;

  /// A glyph in the ember well — the ordinary case for a lesson or an exam.
  final IconData? leadingIcon;

  /// A pre-formatted position («٣»), for an ordered outline.
  final String? leadingNumber;

  /// A status object at the inline end — an [AppBadge] almost always. Sits
  /// beside the action rather than replacing it.
  final Widget? trailing;

  final String? actionLabel;
  final VoidCallback? onAction;
  final AppButtonVariant actionVariant;

  /// Makes the whole row a target as well. The button stays the affordance.
  final VoidCallback? onTap;

  final bool locked;

  final String? semanticLabel;

  @override
  State<AppListRow> createState() => _AppListRowState();
}

class _AppListRowState extends State<AppListRow> {
  static const double _wellSize = 36;

  /// The web's `margin-inline-start: 3.25rem` on a wrapped chip — the well,
  /// the gap after it, and 4pt more so the button's own optical edge clears
  /// the title's rather than butting exactly against it.
  static const double _indent = _wellSize + AppSpacing.x12 + AppSpacing.x4;

  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final isRtl = Directionality.of(context) == TextDirection.rtl;
    final locked = widget.locked;
    final tappable = widget.onTap != null && !locked;

    // Ember on the well, always — the lesson's icon is a category marker, not
    // a control. Locked drops to the neutral chip surface so the row reads as
    // switched off rather than as a different kind of lesson.
    final wellBackground = locked ? c.surface3 : c.studyTint;
    final wellForeground = locked ? c.fgFaint : c.study;

    Widget? well;
    if (locked) {
      well = Container(
        width: _wellSize,
        height: _wellSize,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: wellBackground,
          borderRadius: AppRadius.mdAll,
        ),
        child: Icon(Icons.lock_outline, size: 18, color: wellForeground),
      );
    } else if (widget.leading != null) {
      well = ClipRRect(
        borderRadius: AppRadius.mdAll,
        child: SizedBox(
          width: _wellSize,
          height: _wellSize,
          child: widget.leading,
        ),
      );
    } else if (widget.leadingIcon != null || widget.leadingNumber != null) {
      well = Container(
        width: _wellSize,
        height: _wellSize,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: wellBackground,
          borderRadius: AppRadius.mdAll,
        ),
        child: widget.leadingNumber != null
            ? Text(
                widget.leadingNumber!,
                // `height: 1` so the number sits on the well's optical centre;
                // the numeric builder inherits body leading, which parks a
                // 13pt figure a couple of points low inside a 36pt box.
                style: type
                    .numeric(
                      size: type.textSm.$1,
                      weight: AppTextStyle.semibold,
                      color: wellForeground,
                    )
                    .copyWith(height: 1),
              )
            : Icon(widget.leadingIcon, size: 18, color: wellForeground),
      );
    }

    final text = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      spacing: AppSpacing.x2,
      children: [
        Text(
          widget.title,
          style: type.bodySm(
            color: locked ? c.fgMuted : c.fg,
            weight: AppTextStyle.medium,
          ),
        ),
        if (widget.subtitle != null)
          Text(
            widget.subtitle!,
            style: type.bodyXs(color: c.fgMuted),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        if (widget.meta != null)
          Text(
            widget.meta!,
            style: type
                .numeric(size: type.monoLabel.$1, color: c.fgFaint)
                .copyWith(height: type.monoLabel.$2),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
      ],
    );

    Widget? action;
    if (widget.onAction != null) {
      action = AppButton(
        label: widget.actionLabel!,
        // Disabled rather than hidden: the student can see what the row WILL
        // offer once it opens, which is the difference between "locked" and
        // "broken".
        onPressed: locked ? null : widget.onAction,
        variant: widget.actionVariant,
        size: AppButtonSize.small,
      );
    } else if (locked) {
      action = AppBadge(
        label: tr(CopyKeys.libraryLessonLocked),
        icon: Icons.lock_outline,
      );
    } else if (widget.onTap != null) {
      action = Icon(
        isRtl ? Icons.chevron_left : Icons.chevron_right,
        size: 20,
        color: c.fgFaint,
      );
    }

    final tail = <Widget>[
      ?widget.trailing,
      ?action,
    ];

    // The web's `30rem` re-flow. Read from the VIEWPORT, not from the row's
    // own constraints, because that is what the media query does — a row in a
    // narrow column on a tablet keeps the inline layout there too.
    final stack = MediaQuery.sizeOf(context).width < 480 && tail.isNotEmpty;

    final head = Row(
      spacing: AppSpacing.x12,
      children: [
        ?well,
        Expanded(child: text),
        if (!stack) ...tail,
      ],
    );

    final content = stack
        ? Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            spacing: AppSpacing.x8,
            children: [
              head,
              Padding(
                padding: const EdgeInsetsDirectional.only(start: _indent),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  spacing: AppSpacing.x8,
                  children: tail,
                ),
              ),
            ],
          )
        : head;

    Widget row = AnimatedContainer(
      duration: AppMotion.hover,
      curve: AppMotion.inOut,
      constraints: const BoxConstraints(minHeight: AppSpacing.minTap),
      padding: const EdgeInsets.all(AppSpacing.x12),
      decoration: BoxDecoration(
        // The web hovers a row to `--n-2`. Here that is a step too small:
        // rows almost always sit INSIDE an AppPanel, which is already
        // `surface2`, so a press to `surface2` is invisible. `surface3` is the
        // first value that reads as feedback on either ground.
        color: _pressed ? c.surface3 : Colors.transparent,
        borderRadius: AppRadius.mdAll,
      ),
      child: content,
    );

    if (tappable) {
      row = GestureDetector(
        onTapDown: (_) => setState(() => _pressed = true),
        onTapUp: (_) => setState(() => _pressed = false),
        onTapCancel: () => setState(() => _pressed = false),
        onTap: widget.onTap,
        behavior: HitTestBehavior.opaque,
        child: row,
      );
    }

    return Semantics(
      label: widget.semanticLabel,
      button: tappable,
      enabled: !locked,
      child: row,
    );
  }
}
