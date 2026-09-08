import 'package:flutter/material.dart';

import '../../../theme/app_colors.dart';
import '../../../theme/app_motion.dart';
import '../../../theme/app_radius.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_text_style.dart';

/// One option in a single-choice group, where the WHOLE ROW is the target.
///
/// The twin of `AppCheckboxRow`, and the same reasoning: the control is 20px
/// and the floor is 44, so the row takes the gesture. It is also what the
/// option list inside `AppDropdownField` is built from — «المحافظة» is 27 of
/// these in a scrolling sheet, and a 20px target in a list that long is a
/// guaranteed mis-tap.
///
/// ## Geometry — `RadioGroupItem`
///
/// ```
/// circle     20 × 20 ; radius --r-full ; 1px --border ; bg --n-2
/// [checked]  border --a-9 — the FILL STAYS --n-2, unlike the checkbox
/// indicator  10px (size-2.5) dot in --a-9
/// disabled   opacity 0.60
/// ```
///
/// The checkbox floods its box with the accent and the radio does not, and
/// that asymmetry is in the web source rather than an oversight here. A row of
/// radios where the chosen one is a solid amber disc reads as a row of
/// buttons; the ring-and-dot reads as a choice among equals.
///
/// ## Generic over T
///
/// [value] is this row's option and [groupValue] is the group's current one,
/// compared with `==`. That means an enum, a string id or a small value type
/// works out of the box, and a mutable model class needs `==` — otherwise
/// nothing is ever selected and the bug looks like a broken callback.
class AppRadioRow<T> extends StatelessWidget {
  const AppRadioRow({
    required this.value,
    required this.groupValue,
    required this.onChanged,
    required this.label,
    this.description,
    this.enabled = true,
    this.trailing,
    super.key,
  });

  final T value;
  final T? groupValue;

  /// Called with [value], never with null — deselecting is not a thing a radio
  /// group does. Null disables the row the same way it does on a checkbox.
  final ValueChanged<T>? onChanged;

  final String label;

  /// A second, quieter line — a school's district, a plan's price, why one
  /// option differs from the one under it.
  final String? description;

  final bool enabled;

  /// Something at the inline END of the row: a price, an [AppBadge], a count.
  /// Not a target — the whole row is already one, and a button nested inside a
  /// tappable row is two overlapping gestures.
  final Widget? trailing;

  static const double _circleSize = 20;
  static const double _dotSize = 10;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final selected = groupValue == value;
    final active = enabled && onChanged != null;

    final row = ConstrainedBox(
      constraints: const BoxConstraints(minHeight: AppSpacing.minTap),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: AppSpacing.x12,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.x12),
            child: AnimatedContainer(
              duration: AppMotion.hover,
              curve: AppMotion.inOut,
              width: _circleSize,
              height: _circleSize,
              decoration: BoxDecoration(
                color: c.surface2,
                borderRadius: AppRadius.fullAll,
                border: Border.all(color: selected ? c.accent : c.line),
              ),
              child: Center(
                // The dot grows from nothing rather than appearing, so a
                // student who taps the row below sees WHERE the choice moved.
                // In a 27-row governorate sheet that is the difference between
                // a list that responded and one that scrolled.
                child: AnimatedContainer(
                  duration: AppMotion.hover,
                  curve: AppMotion.inOut,
                  width: selected ? _dotSize : 0,
                  height: selected ? _dotSize : 0,
                  decoration: BoxDecoration(
                    color: c.accent,
                    borderRadius: AppRadius.fullAll,
                  ),
                ),
              ),
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
          if (trailing != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.x12),
              child: trailing,
            ),
        ],
      ),
    );

    return MergeSemantics(
      child: Semantics(
        checked: selected,
        enabled: active,
        // What makes a screen reader say "one of five" instead of reading the
        // row as an independent checkbox. Without it a student in a long
        // sheet has no way to know the choices are exclusive.
        inMutuallyExclusiveGroup: true,
        child: GestureDetector(
          // Re-selecting the current option is a no-op, not a toggle: a radio
          // group has no empty state, and firing the callback again would
          // re-run whatever the choice triggers — a refetch, a route change.
          onTap: active && !selected ? () => onChanged!(value) : null,
          behavior: HitTestBehavior.opaque,
          child: active ? row : Opacity(opacity: 0.60, child: row),
        ),
      ),
    );
  }
}
