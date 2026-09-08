import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../theme/app_colors.dart';
import '../../../theme/app_motion.dart';
import '../../../theme/app_radius.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_text_style.dart';
import 'app_field_label.dart';

/// The product's text input: label, field, and one line of helper or error
/// text under it.
///
/// Transcribed from `packages/ui/src/components/input.tsx` and the auth form's
/// hand-rolled twin `apps/web/components/auth/form-field.tsx` — 4px radius, a
/// 1px `--border` hairline, `--n-2` ground, 12px inline / 12px block padding,
/// a 2px `--a-9` border on focus and `--err` when the field is invalid. **No
/// shadow on any field**; depth in this design comes from the surface ladder,
/// and every shadow token is transparent in dark mode anyway.
///
/// ## Why 16px type and not the 15px body size
///
/// [_inputTypeFloor]. The web carries `text-[1rem] md:text-[length:var(--fs-text-base)]`
/// on every input because iOS Safari auto-zooms the viewport when it focuses a
/// control under 16px and never zooms back out. A native client has no
/// viewport to zoom, so the *mechanism* does not apply — but the SIZE is now
/// part of how a form looks in this product, and a phone form set one pixel
/// smaller than the web's is also simply harder to read on the device where
/// almost every registration happens.
///
/// ## Composition
///
/// The label and the helper line sit OUTSIDE the Material `InputDecorator`.
/// Material's own floating label animates over the border and its `errorText`
/// reserves height whether or not there is an error; both fight the web's
/// layout, where a label is a static block above the box and the error line
/// appears and disappears. Building the column here is what keeps the two
/// clients looking like one product.
class AppTextField extends StatelessWidget {
  const AppTextField({
    this.label,
    this.isRequired = false,
    this.controller,
    this.focusNode,
    this.hintText,
    this.helperText,
    this.errorText,
    this.keyboardType,
    this.textInputAction,
    this.textCapitalization = TextCapitalization.none,
    this.obscureText = false,
    this.maxLines = 1,
    this.minLines,
    this.maxLength,
    this.enabled = true,
    this.readOnly = false,
    this.autofocus = false,
    this.autocorrect = true,
    this.enableSuggestions = true,
    this.autofillHints,
    this.inputFormatters,
    this.textDirection,
    this.onChanged,
    this.onSubmitted,
    this.onTap,
    this.prefixIcon,
    this.suffix,
    super.key,
  });

  /// Rendered by [AppFieldLabel] above the box. Null draws no label at all —
  /// for the rare field whose meaning is carried by something else (a search
  /// pill, a cell in an editable table).
  final String? label;

  /// Draws the `*` on the label and publishes `Semantics(isRequired: true)` on
  /// the field. Purely advisory — it does not validate anything.
  final bool isRequired;

  final TextEditingController? controller;
  final FocusNode? focusNode;

  /// The placeholder, in `--n-10`. Never a restatement of the label: a hint
  /// that repeats the label is invisible the moment the student types.
  final String? hintText;

  /// Standing help, shown whether or not anything is wrong — as opposed to
  /// [errorText], which appears only on failure. Both can be present; the
  /// error is read first, because what went wrong outranks explanation.
  final String? helperText;

  /// Non-null turns the border `--err` and publishes the message as an alert.
  final String? errorText;

  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final TextCapitalization textCapitalization;
  final bool obscureText;
  final int maxLines;
  final int? minLines;
  final int? maxLength;
  final bool enabled;
  final bool readOnly;
  final bool autofocus;
  final bool autocorrect;
  final bool enableSuggestions;

  /// Wire these on every real form field. Autofill is how a returning student
  /// gets past /login on a phone without retyping an eleven-digit number, and
  /// it costs one constant.
  final Iterable<String>? autofillHints;

  final List<TextInputFormatter>? inputFormatters;

  /// Forces the direction of the field's CONTENTS, independent of the page.
  ///
  /// Only [AppPhoneField] uses it, and it is doing real work there: the app is
  /// RTL, a phone number is a Latin string, and `+201…` laid out RTL puts the
  /// `+` at the wrong end — a different number as far as the reader is
  /// concerned. It is applied as a [Directionality] around the box ONLY, so
  /// the label above and the error below stay Arabic and right-aligned.
  final TextDirection? textDirection;

  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final VoidCallback? onTap;

  final IconData? prefixIcon;

  /// A trailing widget rather than an [IconData], because the two things that
  /// need this slot — the password eye and the search field's clear button —
  /// are both TARGETS, and a target has to clear 44 logical pixels. An
  /// `IconData` parameter would have quietly made them 18px taps.
  final Widget? suffix;

  /// The iOS input floor, and now the product's input size on every platform.
  /// See the class doc.
  static const double _inputTypeFloor = 16;

  /// `space-y-1.5` — the gap `form-field.tsx` puts between label, box and
  /// message. Deliberately off the 2/4/8/12… token scale, exactly as it is on
  /// the web: 4px reads as a caption stuck to the box and 8px lets the message
  /// drift away from the field it belongs to.
  static const double _stackGap = 6;

  /// `min-h-32` from `textarea.tsx`. A multiline field that opens at one line
  /// and grows is a field students do not realise they can write a paragraph
  /// in.
  static const double _multilineMinHeight = 128;

  /// lucide draws on a 24×24 box at `stroke-width: 2`; the codebase sizes
  /// in-field glyphs with `size-4`/`size-5`. 18 is the step between them the
  /// buttons already use.
  static const double _glyph = 18;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final invalid = errorText != null;
    final multiline = maxLines > 1;

    final body = type.body(color: c.fg);
    final textStyle = (body.fontSize ?? 0) < _inputTypeFloor
        ? body.copyWith(fontSize: _inputTypeFloor)
        : body;

    Widget field = TextField(
      controller: controller,
      focusNode: focusNode,
      enabled: enabled,
      readOnly: readOnly,
      autofocus: autofocus,
      autocorrect: autocorrect,
      enableSuggestions: enableSuggestions,
      obscureText: obscureText,
      keyboardType: keyboardType,
      textInputAction: textInputAction,
      textCapitalization: textCapitalization,
      maxLines: obscureText ? 1 : maxLines,
      minLines: minLines,
      maxLength: maxLength,
      autofillHints: enabled ? autofillHints : null,
      inputFormatters: inputFormatters,
      textDirection: textDirection,
      onChanged: onChanged,
      onSubmitted: onSubmitted,
      onTap: onTap,
      style: textStyle,
      cursorColor: c.accentText,
      decoration: InputDecoration(
        hintText: hintText,
        hintStyle: textStyle.copyWith(color: c.fgFaint),
        filled: true,
        fillColor: c.surface2,
        isDense: true,
        // 12/12 — `px-3 py-2` plus the two pixels the web buys back with a
        // fixed `h-10`, which a growable Flutter field cannot use.
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.x12,
          vertical: AppSpacing.x12,
        ),
        constraints: BoxConstraints(
          minHeight: multiline ? _multilineMinHeight : AppSpacing.minTap,
        ),
        // Material would otherwise print a Latin "3/40" counter under the
        // field, in the slot this design gives to the error message and on a
        // baseline nothing else in the column shares.
        counterText: '',
        prefixIcon: prefixIcon == null
            ? null
            : Icon(prefixIcon, size: _glyph, color: c.fgMuted),
        // The prefix sits OUTSIDE `contentPadding`, so its box has to carry
        // the edge inset itself — 12 to the border plus the 18px glyph. The
        // gap between glyph and text is then the content padding, so the two
        // insets stay one number. Left at Material's default the icon lands
        // flush against the border.
        prefixIconConstraints: const BoxConstraints(
          minWidth: AppSpacing.x12 + _glyph,
          minHeight: AppSpacing.minTap,
        ),
        suffixIcon: suffix,
        suffixIconConstraints: const BoxConstraints(
          minWidth: AppSpacing.minTap,
          minHeight: AppSpacing.minTap,
        ),
        border: _border(invalid ? c.err : c.line),
        enabledBorder: _border(invalid ? c.err : c.line),
        // The invalid border wins over focus. A field that turns amber the
        // moment it is touched again has stopped telling the student it is
        // still wrong, and the message below is easy to miss on a phone.
        focusedBorder: _border(invalid ? c.err : c.accent, width: 2),
        disabledBorder: _border(c.line),
      ),
    );

    if (textDirection != null) {
      // Scoped to the box, not the column: the decorator lays the hint,
      // prefix and suffix out against the ambient direction, so setting only
      // `TextField.textDirection` leaves an empty field's placeholder on the
      // opposite edge from the value that replaces it.
      field = Directionality(textDirection: textDirection!, child: field);
    }

    // ⚠️ NOT `Semantics(validationResult:)`.
    //
    // `SemanticsValidationResult` and `SemanticsRole` landed after the Flutter
    // version this app is pinned to (3.41 / Dart 3.11) and do not exist here.
    // The accessible behaviour they would have given is reproduced with what
    // does exist: `TextField.decoration.errorText` already marks the field
    // invalid to both TalkBack and VoiceOver, and the message below is
    // announced through `liveRegion` instead of an alert role.
    field = Semantics(
      textField: true,
      child: field,
    );

    final message = errorText ?? helperText;

    final column = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (label != null) ...[
          AppFieldLabel(text: label!, isRequired: isRequired),
          const SizedBox(height: _stackGap),
        ],
        field,
        if (message != null) ...[
          const SizedBox(height: _stackGap),
          // `AnimatedSwitcher` rather than a bare swap so an error replacing a
          // hint does not snap: the two lines occupy the same slot and the
          // student's eye is still on the box they just left.
          AnimatedSwitcher(
            duration: AppMotion.hover,
            switchInCurve: AppMotion.out,
            child: Semantics(
              key: ValueKey(message),
              // `liveRegion` rather than an alert role: `SemanticsRole` does
              // not exist in Flutter 3.41. A live region is what makes the
              // screen reader announce a validation message that appears
              // AFTER the student has already left the field — without it the
              // error is silent and they are told nothing about why the form
              // will not submit.
              liveRegion: invalid,
              child: Text(
                message,
                style: type.bodyXs(color: invalid ? c.err : c.fgMuted),
              ),
            ),
          ),
        ],
      ],
    );

    // `disabled:opacity-60`, over the label and message too. A full-strength
    // label above a greyed box reads as a field that failed to load rather
    // than one that is deliberately shut.
    return enabled ? column : Opacity(opacity: 0.60, child: column);
  }

  OutlineInputBorder _border(Color color, {double width = 1}) {
    return OutlineInputBorder(
      borderRadius: AppRadius.smAll,
      borderSide: BorderSide(color: color, width: width),
    );
  }
}
