import 'package:flutter/material.dart';

import '../../../theme/app_colors.dart';
import '../../../theme/app_radius.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_text_style.dart';
import '../layout/app_bottom_sheet.dart';
import 'app_field_label.dart';

/// One option in a picker.
class AppSelectOption<T> {
  const AppSelectOption({required this.value, required this.label, this.note});

  final T value;
  final String label;

  /// A second line — a region, a hint. Optional.
  final String? note;
}

/// A field that opens a full-height SHEET of options.
///
/// ## Why a sheet and not a dropdown
///
/// Twenty-seven governorates in a Material dropdown is a scrolling menu
/// floating over the form with no search and no room for a second line. A
/// sheet gets the whole screen, keeps the field visible underneath, and is
/// dismissed by the same back gesture as everything else on the platform.
class AppSelectField<T> extends StatelessWidget {
  const AppSelectField({
    required this.label,
    required this.options,
    required this.value,
    required this.onChanged,
    this.placeholder,
    this.errorText,
    this.isRequired = false,
    this.searchHint,
    this.emptyLabel,
    super.key,
  });

  final String label;
  final List<AppSelectOption<T>> options;
  final T? value;
  final void Function(T value) onChanged;

  /// Shown when nothing is chosen — «اختار صفّك».
  final String? placeholder;

  final String? errorText;
  final bool isRequired;

  /// Adds a filter box, using this as its hint. For a long list — the
  /// governorates — and nothing else: a search box over four options is
  /// furniture.
  ///
  /// ⚠️ Taken from the CALLER rather than from a generic key, because there is
  /// no generic search string in the copy file and inventing one here would
  /// put a hand-written Arabic sentence in a codebase whose every string is
  /// generated from the contracts.
  final String? searchHint;

  /// What the sheet says when the filter matches nothing.
  final String? emptyLabel;

  AppSelectOption<T>? get _selected {
    for (final option in options) {
      if (option.value == value) return option;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final selected = _selected;
    final invalid = errorText != null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.x8,
      children: [
        AppFieldLabel(text: label, isRequired: isRequired),
        Semantics(
          button: true,
          label: '$label — ${selected?.label ?? placeholder ?? ''}',
          child: ExcludeSemantics(
            child: Material(
              color: c.surface2,
              borderRadius: AppRadius.mdAll,
              child: InkWell(
                onTap: () => _open(context),
                borderRadius: AppRadius.mdAll,
                child: Container(
                  height: 52,
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.x12,
                  ),
                  decoration: BoxDecoration(
                    borderRadius: AppRadius.mdAll,
                    border: Border.all(
                      color: invalid ? c.err : c.line,
                      width: invalid ? 1.5 : 1,
                    ),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          selected?.label ?? placeholder ?? '',
                          style: selected == null
                              ? type.body(color: c.fgFaint)
                              : type.body(color: c.fg),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      Icon(
                        Icons.keyboard_arrow_down_rounded,
                        color: c.fgMuted,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
        if (errorText != null)
          Text(errorText!, style: type.bodyXs(color: c.err)),
      ],
    );
  }

  Future<void> _open(BuildContext context) async {
    final picked = await AppBottomSheet.show<T>(
      context,
      title: label,
      builder: (_) => _OptionSheet<T>(
        options: options,
        value: value,
        searchHint: searchHint,
        emptyLabel: emptyLabel,
      ),
    );
    if (picked != null) onChanged(picked);
  }
}

/// The list inside the sheet.
class _OptionSheet<T> extends StatefulWidget {
  const _OptionSheet({
    required this.options,
    required this.value,
    this.searchHint,
    this.emptyLabel,
  });

  final List<AppSelectOption<T>> options;
  final T? value;
  final String? searchHint;
  final String? emptyLabel;

  @override
  State<_OptionSheet<T>> createState() => _OptionSheetState<T>();
}

class _OptionSheetState<T> extends State<_OptionSheet<T>> {
  String _query = '';

  List<AppSelectOption<T>> get _shown {
    if (_query.trim().isEmpty) return widget.options;
    final needle = _query.trim();
    return widget.options
        .where((option) => option.label.contains(needle))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.x8,
      children: [
        if (widget.searchHint != null)
          TextField(
            autofocus: false,
            onChanged: (value) => setState(() => _query = value),
            decoration: InputDecoration(
              prefixIcon: Icon(Icons.search_rounded, color: c.fgMuted),
              hintText: widget.searchHint,
            ),
          ),
        for (final option in _shown)
          _OptionRow<T>(
            option: option,
            selected: option.value == widget.value,
            onTap: () => Navigator.of(context).pop(option.value),
          ),
        if (_shown.isEmpty && widget.emptyLabel != null)
          Padding(
            padding: const EdgeInsets.all(AppSpacing.x16),
            child: Text(
              widget.emptyLabel!,
              textAlign: TextAlign.center,
              style: type.bodySm(color: c.fgMuted),
            ),
          ),
      ],
    );
  }
}

/// One row in the sheet.
class _OptionRow<T> extends StatelessWidget {
  const _OptionRow({
    required this.option,
    required this.selected,
    required this.onTap,
  });

  final AppSelectOption<T> option;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Material(
      color: selected ? c.accent.withValues(alpha: 0.12) : Colors.transparent,
      borderRadius: AppRadius.mdAll,
      child: InkWell(
        onTap: onTap,
        borderRadius: AppRadius.mdAll,
        child: Container(
          constraints: const BoxConstraints(minHeight: AppSpacing.minTap),
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.x12,
            vertical: AppSpacing.x8,
          ),
          child: Row(
            spacing: AppSpacing.x12,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: AppSpacing.x2,
                  children: [
                    Text(
                      option.label,
                      style: type.body(
                        color: selected ? c.accentText : c.fg,
                        weight: selected
                            ? AppTextStyle.medium
                            : AppTextStyle.regular,
                      ),
                    ),
                    if (option.note != null)
                      Text(
                        option.note!,
                        style: type.bodyXs(color: c.fgMuted),
                      ),
                  ],
                ),
              ),
              if (selected)
                Icon(Icons.check_rounded, size: 20, color: c.accent),
            ],
          ),
        ),
      ),
    );
  }
}
