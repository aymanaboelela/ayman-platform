import 'package:flutter/widgets.dart';

import '../../../theme/app_colors.dart';
import '../../../theme/app_text_style.dart';

/// The label that sits above a field — the web's `Label`
/// (`packages/ui/src/components/label.tsx`).
///
/// `--fs-text-sm`, weight 500, colour `--n-12`, and **never uppercased**.
/// Uppercasing is the reflex a Latin design system trains and it is
/// meaningless here: Arabic has no case, so `text-transform: uppercase` on an
/// Arabic label does nothing at all — and then does something ugly the first
/// time a label contains a Latin word.
///
/// ## The required marker
///
/// A `*` in `--a-11` ([AppColors.accentText], not the solid accent — the fill
/// does not clear 4.5:1 as a foreground in light mode) with a 4px inline-start
/// gap. On the web it is `aria-hidden`, because a screen reader announcing
/// "star" tells nobody anything; the fact travels on the FIELD instead, as
/// `Semantics(isRequired: true)`, which is what [AppTextField] sets. So the
/// glyph here is decoration and the semantic label deliberately omits it.
///
/// This carries no bottom margin. The gap belongs to whoever stacks the label
/// and the field, so that a caller composing an unusual field (a dropzone, a
/// pair of side-by-side inputs) does not have to subtract a margin it never
/// asked for.
class AppFieldLabel extends StatelessWidget {
  const AppFieldLabel({required this.text, this.isRequired = false, super.key});

  final String text;

  /// Draws the `*`. Purely visual — see the class doc.
  final bool isRequired;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final style = type.bodySm(color: c.fg, weight: AppTextStyle.medium);

    if (!isRequired) {
      return Text(text, style: style);
    }

    return Text.rich(
      TextSpan(
        text: text,
        style: style,
        children: [
          // A leading space rather than a `WidgetSpan` carrying `ms-1`: the
          // marker has to sit on the label's own baseline, and a WidgetSpan
          // inside a text run re-measures the line against the widget's box
          // instead of the strut — enough to shift the label by a fraction of
          // a pixel, which shows up as a ragged column when a form alternates
          // required and optional fields. At `--fs-text-sm` a space in this
          // face is ≈4px, which is the `ms-1` the web asks for anyway.
          TextSpan(
            text: ' *',
            style: style.copyWith(color: c.accentText),
          ),
        ],
      ),
      // Without this the reader announces «الاسم الكامل نجمة». The requirement
      // is published on the field itself instead.
      semanticsLabel: text,
    );
  }
}
