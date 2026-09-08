// `hide TextDirection`: easy_localization re-exports package:intl, which
// declares a TextDirection of its own — a CLASS with no `ltr`, not dart:ui's
// enum. Without the hide the number below silently fails to compile, and in a
// file that only reads it the failure looks like a Flutter API change.
import 'package:easy_localization/easy_localization.dart' hide TextDirection;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/feedback/app_snack.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';

/// The InstaPay number, big, selectable, and copyable in one tap.
///
/// ## Why the number is shown as LOCAL digits
///
/// The setting stores E.164 (`+201021196367`) because that is the only form a
/// server can validate. What a transfer screen asks a student to type is
/// `01021196367`, and asking them to mentally strip a `+20` while their money
/// is in the balance is how a transfer goes to the wrong number.
class SubscribeInstapayRow extends StatelessWidget {
  const SubscribeInstapayRow({required this.instapay, super.key});

  /// E.164.
  final String instapay;

  /// `+201021196367` → `01021196367`.
  static String localDigits(String e164) =>
      e164.startsWith('+20') ? '0${e164.substring(3)}' : e164;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final number = localDigits(instapay);

    return Container(
      padding: const EdgeInsets.all(AppSpacing.x12),
      decoration: BoxDecoration(
        color: c.studyTint,
        borderRadius: AppRadius.mdAll,
        border: Border.all(color: c.studyLine),
      ),
      child: Row(
        spacing: AppSpacing.x8,
        children: [
          Expanded(
            // SELECTABLE, so a clipboard that refuses still leaves the
            // student a way to get the digits out by hand.
            child: SelectableText(
              number,
              style: type.numeric(color: c.fg, size: 18),
              textDirection: TextDirection.ltr,
            ),
          ),
          TextButton.icon(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: number));
              if (!context.mounted) return;
              AppSnack.show(
                context,
                tr(CopyKeys.subscribeCopied),
                tone: AppSnackTone.ok,
              );
            },
            icon: Icon(Icons.copy_rounded, size: 16, color: c.accentText),
            label: Text(
              tr(CopyKeys.subscribeCopyNumber),
              style: type.bodySm(color: c.accentText),
            ),
          ),
        ],
      ),
    );
  }
}
