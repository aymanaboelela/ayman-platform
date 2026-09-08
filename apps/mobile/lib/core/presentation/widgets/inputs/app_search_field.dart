import 'dart:async';

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../localization/copy_keys.dart';
import '../../../theme/app_colors.dart';
import '../../../theme/app_radius.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_text_style.dart';

/// The search input for the admin lists and the book store.
///
/// A pill, unlike every other field in this design — [AppRadius.full] is
/// reserved for status chips, avatars and the segmented thumb, and this is the
/// one input allowed to join them. The shape is doing a job: a search box has
/// no label above it and appears inside a toolbar of buttons and chips, so the
/// rounded end is what stops it reading as a text field somebody forgot to
/// label. The COLOURS stay on the input contract — `--n-2` ground, 1px
/// `--border`, 2px `--a-9` on focus — so it is still recognisably the same
/// family as the fields on the form two screens away.
///
/// ## Debounce
///
/// Every caller of this is a network query: the admin students list, the book
/// store, the question bank. Firing on each keystroke sends eleven requests
/// for one eleven-character name, and the Nest rate limiter is real — bulk
/// admin GETs start returning 429 well inside a single impatient search.
///
/// The delay is bypassed in two places on purpose, because both are decisive
/// rather than exploratory: pressing the keyboard's search key, and pressing
/// the clear button. Waiting 300ms to empty a list the student has just asked
/// to empty reads as a hang.
class AppSearchField extends StatefulWidget {
  const AppSearchField({
    required this.onChanged,
    this.controller,
    this.focusNode,
    this.hintText,
    this.semanticLabel,
    this.debounce = const Duration(milliseconds: 300),
    this.onSubmitted,
    this.enabled = true,
    this.autofocus = false,
    super.key,
  });

  /// Called with the query after [debounce] has elapsed with no new keystroke,
  /// and immediately on submit or clear. Never called with the same value
  /// twice in a row.
  final ValueChanged<String> onChanged;

  /// Pass one to drive the field from outside — restoring a query from the
  /// route, or clearing it when a filter chip is reset. The widget disposes
  /// only a controller it created itself.
  final TextEditingController? controller;

  final FocusNode? focusNode;

  /// Defaults to «دور...». Give the list's own wording where there is one —
  /// «اسم، رقم موبايل، محافظة أو شارع…» tells a student far more than «دور».
  final String? hintText;

  /// What a screen reader announces for the field. The hint alone is often
  /// too terse to be useful out of context.
  final String? semanticLabel;

  /// [Duration.zero] disables the debounce entirely — correct for a list that
  /// is already in memory, such as the option list inside AppDropdownField,
  /// where the delay would be latency for nothing.
  final Duration debounce;

  /// The keyboard's search key. [onChanged] has already fired with the same
  /// value by the time this runs.
  final ValueChanged<String>? onSubmitted;

  final bool enabled;
  final bool autofocus;

  @override
  State<AppSearchField> createState() => _AppSearchFieldState();
}

class _AppSearchFieldState extends State<AppSearchField> {
  late final TextEditingController _controller =
      widget.controller ?? TextEditingController();

  Timer? _debounce;

  /// The last value handed to [AppSearchField.onChanged]. Guards the one case
  /// that produces a duplicate request: typing, then hitting the search key
  /// before the timer has fired.
  String _emitted = '';

  /// Rebuilding on every keystroke only to show or hide the clear button is
  /// waste; the button's visibility turns on this instead.
  bool _hasText = false;

  @override
  void initState() {
    super.initState();
    _emitted = _controller.text;
    _hasText = _controller.text.isNotEmpty;
    _controller.addListener(_onControllerChanged);
  }

  @override
  void dispose() {
    // Ordered: kill the timer before the controller, or a callback already in
    // flight reads a disposed controller.
    _debounce?.cancel();
    _controller.removeListener(_onControllerChanged);
    if (widget.controller == null) _controller.dispose();
    super.dispose();
  }

  void _onControllerChanged() {
    final hasText = _controller.text.isNotEmpty;
    if (hasText != _hasText) setState(() => _hasText = hasText);
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    if (widget.debounce == Duration.zero) {
      _emit(value);
      return;
    }
    _debounce = Timer(widget.debounce, () => _emit(value));
  }

  void _emit(String value) {
    if (!mounted || value == _emitted) return;
    _emitted = value;
    widget.onChanged(value);
  }

  void _onSubmitted(String value) {
    _debounce?.cancel();
    _emit(value);
    widget.onSubmitted?.call(value);
  }

  void _clear() {
    _debounce?.cancel();
    _controller.clear();
    _emit('');
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    final body = type.body(color: c.fg);
    // The 16px input floor — see AppTextField. A search field is the one an
    // admin uses one-handed on a phone while looking at something else.
    final textStyle = (body.fontSize ?? 0) < 16
        ? body.copyWith(fontSize: 16)
        : body;

    return Semantics(
      label: widget.semanticLabel,
      child: TextField(
        controller: _controller,
        focusNode: widget.focusNode,
        enabled: widget.enabled,
        autofocus: widget.autofocus,
        style: textStyle,
        cursorColor: c.accentText,
        keyboardType: TextInputType.text,
        textInputAction: TextInputAction.search,
        onChanged: _onChanged,
        onSubmitted: _onSubmitted,
        decoration: InputDecoration(
          hintText: widget.hintText ?? tr(CopyKeys.adminListSearchPlaceholder),
          hintStyle: textStyle.copyWith(color: c.fgFaint),
          filled: true,
          fillColor: c.surface2,
          isDense: true,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.x12,
            vertical: AppSpacing.x12,
          ),
          constraints: const BoxConstraints(minHeight: AppSpacing.minTap),
          prefixIcon: Icon(Icons.search, size: 18, color: c.fgMuted),
          // The prefix box sits OUTSIDE `contentPadding` and has to carry its
          // own edge inset: 16 to the border — a pill wants more than a
          // 4px-cornered box, or the glyph reads as sitting in the curve —
          // plus the 18px glyph. The gap to the text is the content padding.
          prefixIconConstraints: const BoxConstraints(
            minWidth: AppSpacing.x16 + 18,
            minHeight: AppSpacing.minTap,
          ),
          suffixIcon: _hasText
              ? Semantics(
                  button: true,
                  label: tr(CopyKeys.adminBooksSearchClear),
                  child: GestureDetector(
                    onTap: _clear,
                    behavior: HitTestBehavior.opaque,
                    child: const SizedBox(
                      width: AppSpacing.minTap,
                      height: AppSpacing.minTap,
                      child: Icon(Icons.close, size: 18),
                    ),
                  ),
                )
              : null,
          suffixIconColor: c.fgMuted,
          suffixIconConstraints: const BoxConstraints(
            minWidth: AppSpacing.minTap,
            minHeight: AppSpacing.minTap,
          ),
          border: _pill(c.line),
          enabledBorder: _pill(c.line),
          focusedBorder: _pill(c.accent, width: 2),
          disabledBorder: _pill(c.line),
        ),
      ),
    );
  }

  OutlineInputBorder _pill(Color color, {double width = 1}) {
    return OutlineInputBorder(
      borderRadius: AppRadius.fullAll,
      borderSide: BorderSide(color: color, width: width),
    );
  }
}
