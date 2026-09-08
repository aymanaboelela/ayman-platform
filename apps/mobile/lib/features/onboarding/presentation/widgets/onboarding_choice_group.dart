import 'package:flutter/material.dart';

import '../../../../core/presentation/widgets/inputs/app_field_label.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';

/// Two or three options, side by side, as CARDS rather than a dropdown.
///
/// ## Why not a select
///
/// «ذكر / أنثى» and «عام / لغات» are two options each. A dropdown hides both
/// behind a tap and a sheet, which is three gestures to answer a binary — and
/// on a wizard whose whole job is to be quick, that is the difference between
/// a form a student finishes and one they abandon.
class OnboardingChoiceGroup<T> extends StatelessWidget {
  const OnboardingChoiceGroup({
    required this.label,
    required this.options,
    required this.value,
    required this.onChanged,
    this.errorText,
    super.key,
  });

  final String label;
  final List<({T value, String label, IconData icon})> options;
  final T? value;
  final void Function(T value) onChanged;
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.x8,
      children: [
        AppFieldLabel(text: label, isRequired: true),
        Row(
          spacing: AppSpacing.x8,
          children: [
            for (final option in options)
              Expanded(
                child: _ChoiceCard(
                  label: option.label,
                  icon: option.icon,
                  selected: option.value == value,
                  invalid: errorText != null && value == null,
                  onTap: () => onChanged(option.value),
                ),
              ),
          ],
        ),
        if (errorText != null)
          Text(errorText!, style: type.bodyXs(color: c.err)),
      ],
    );
  }
}

/// One option — a glyph over a word, in a box that fills with amber when it is
/// the answer.
class _ChoiceCard extends StatelessWidget {
  const _ChoiceCard({
    required this.label,
    required this.icon,
    required this.selected,
    required this.invalid,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final bool invalid;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Semantics(
      inMutuallyExclusiveGroup: true,
      selected: selected,
      label: label,
      child: ExcludeSemantics(
        child: Material(
          color: selected ? c.accent.withValues(alpha: 0.14) : c.surface2,
          borderRadius: AppRadius.mdAll,
          child: InkWell(
            onTap: onTap,
            borderRadius: AppRadius.mdAll,
            child: Container(
              height: 84,
              decoration: BoxDecoration(
                borderRadius: AppRadius.mdAll,
                border: Border.all(
                  color: selected
                      ? c.accent
                      : invalid
                          ? c.err
                          : c.line,
                  width: selected ? 1.5 : 1,
                ),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                spacing: AppSpacing.x8,
                children: [
                  Icon(
                    icon,
                    size: 24,
                    color: selected ? c.accent : c.fgMuted,
                  ),
                  Text(
                    label,
                    style: type.bodySm(
                      color: selected ? c.accentText : c.fg,
                      weight: selected
                          ? AppTextStyle.semibold
                          : AppTextStyle.regular,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
