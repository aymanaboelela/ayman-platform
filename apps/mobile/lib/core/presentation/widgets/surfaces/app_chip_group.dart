import 'package:flutter/material.dart';

import '../../../theme/app_colors.dart';
import '../../../theme/app_motion.dart';
import '../../../theme/app_radius.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_text_style.dart';

/// A scrolling row of selectable chips — the filter strip above a list.
///
/// «كل الكورسات · اللي بدأتها · اللي خلصتها», «الكل · مستني مراجعة · اتصحح»,
/// the year and track pickers on the library band. Generic over [T] so a screen
/// filters by its own enum or model and never by a stringly-typed label.
///
/// ## Why it is a PILL when nothing else in this design is
///
/// `AppRadius.full` is otherwise reserved for status chips and avatars. This is
/// the deliberate exception, and the reason is next to it on the same screens:
/// the student surface's `.chip` — the thing at the end of a lesson row that
/// OPENS the lesson — is a 4px rectangle. A filter that borrowed that shape
/// would read as a row action, and «امتحانات» sitting in a filter strip would
/// look like a button that starts an exam. Different job, different silhouette.
///
/// ## Why there is no pressed state
///
/// A filter chip's feedback IS its selected state arriving 160ms later. Adding
/// a separate press treatment means two different things happen under one
/// finger for one tap, and on the chip you just deselected they contradict each
/// other. The web has the same shape: `.chip` animates background and colour
/// only, and touch has no hover to distinguish.
///
/// ## Scrolling
///
/// Horizontal, always — the labels are Arabic and they overflow. The strip must
/// never make the PAGE scroll sideways, which is the complaint «بقدر أسكرول
/// يمين وشمال كده، وده مش صح في الموبايل» that put `overflow-x: clip` on the
/// web's body. Pass the screen gutter to [padding] rather than wrapping this
/// widget in a [Padding]: an outer inset clips the viewport, so the last chip
/// stops at the gutter instead of scrolling out under it.
class AppChipGroup<T> extends StatelessWidget {
  /// Radio behaviour: exactly one chip is on, and re-tapping it does nothing.
  ///
  /// A filter row with everything off shows an empty list and no way to read
  /// why, so the "all" case is a real [values] entry rather than the absence of
  /// a selection. The web builds these out of real `<input type="radio">` for
  /// the same reason — a radio cannot be unchecked either.
  AppChipGroup.single({
    required this.values,
    required this.labelBuilder,
    required T? value,
    required ValueChanged<T> onChanged,
    this.iconBuilder,
    this.padding = EdgeInsets.zero,
    super.key,
  })  : selected = <T>{?value},
        _onTapped = onChanged,
        _multiSelect = false;

  /// Checkbox behaviour: any number on, and tapping a selected chip turns it
  /// off. [onToggled] receives the chip that was tapped, not the new set —
  /// the caller owns the set and is the only one that can decide what "none
  /// selected" means for its list.
  const AppChipGroup.multiple({
    required this.values,
    required this.labelBuilder,
    required this.selected,
    required ValueChanged<T> onToggled,
    this.iconBuilder,
    this.padding = EdgeInsets.zero,
    super.key,
  })  : _onTapped = onToggled,
        _multiSelect = true;

  /// Every chip, in display order.
  final List<T> values;

  /// The Arabic label for a value.
  ///
  /// A builder rather than a parallel `List<String>`: two lists drift, and the
  /// failure mode is a chip labelled with its neighbour's name, which nothing
  /// in a test would catch. Callers resolve `tr(CopyKeys.…)` in here.
  final String Function(T value) labelBuilder;

  /// An optional 16px leading glyph per value. Return null for no icon.
  final IconData? Function(T value)? iconBuilder;

  final Set<T> selected;

  /// Inset applied INSIDE the scroll viewport — see the class doc.
  final EdgeInsetsGeometry padding;

  final ValueChanged<T> _onTapped;
  final bool _multiSelect;

  /// 40, not 32: §7.5 of the design spec raises `.chip` to 40 below 768px.
  /// The tap target around it is [AppSpacing.minTap], so the box the student
  /// sees is smaller than the box the student can hit.
  static const double _chipHeight = 40;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    // §7.4 — one physical device pixel.
    final hairline = MediaQuery.devicePixelRatioOf(context) >= 2 ? 0.5 : 1.0;

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: padding,
      child: Row(
        spacing: AppSpacing.x8,
        children: [
          for (final (value, isSelected)
              in values.map((v) => (v, selected.contains(v))))
            Semantics(
              button: true,
              inMutuallyExclusiveGroup: !_multiSelect,
              selected: isSelected,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () {
                  // Re-tapping the live chip in a radio group is a no-op, not
                  // a re-select: firing the callback would re-run the query
                  // and flash a loading list for a filter that did not change.
                  if (!_multiSelect && isSelected) return;
                  _onTapped(value);
                },
                child: SizedBox(
                  // The 4px of dead space above and below the visible pill.
                  // Without it the strip is a 40pt target and every one of
                  // these fails 2.5.5 by the same four pixels.
                  height: AppSpacing.minTap,
                  child: Center(
                    child: AnimatedContainer(
                      duration: AppMotion.hover,
                      curve: AppMotion.inOut,
                      height: _chipHeight,
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.x16,
                      ),
                      decoration: BoxDecoration(
                        // Selected is the SOLID accent with the fixed dark
                        // label — `.chip--solid`. Amber is a light colour, so
                        // `accentContrast` stays #1A1206 in both themes; white
                        // on it never clears 4.5:1.
                        color: isSelected ? c.accent : c.surface3,
                        borderRadius: AppRadius.fullAll,
                        border: Border.all(
                          color: isSelected ? c.accent : c.line,
                          width: hairline,
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        spacing: AppSpacing.x4,
                        children: [
                          if (iconBuilder?.call(value) case final icon?)
                            Icon(
                              icon,
                              size: 16,
                              color: isSelected ? c.accentContrast : c.fgMuted,
                            ),
                          AnimatedDefaultTextStyle(
                            duration: AppMotion.hover,
                            curve: AppMotion.inOut,
                            style: type.bodySm(
                              weight: AppTextStyle.medium,
                              color: isSelected ? c.accentContrast : c.fgMuted,
                            ),
                            child: Text(
                              labelBuilder(value),
                              // `white-space: nowrap` on the web. The pill's
                              // height is fixed, so a wrapped label renders
                              // proud of its own border.
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
