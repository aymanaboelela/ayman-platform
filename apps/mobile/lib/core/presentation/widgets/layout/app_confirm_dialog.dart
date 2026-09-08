import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../localization/copy_keys.dart';
import '../../../theme/app_colors.dart';
import '../../../theme/app_radius.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_text_style.dart';
import '../buttons/app_button.dart';

/// «متأكد؟» — the two-button confirmation.
///
/// ```dart
/// if (await AppConfirmDialog.ask(
///   context,
///   title: tr(CopyKeys.settingsDevicesRevoke),
///   body: tr(CopyKeys.settingsDevicesRevokeCurrentConfirm),
///   confirmLabel: tr(CopyKeys.adminActionsConfirm),
///   destructive: true,
/// )) {
///   ...
/// }
/// ```
///
/// [ask] resolves to **false** when the student taps the barrier or presses
/// Android back — a dismissed dialog is a "no", never a null the caller has to
/// remember to handle. Getting that wrong is how a tapped-away «امسح الحساب»
/// ends up deleting the account.
///
/// ## Destructive is OUTLINED, not filled
///
/// `destructive: true` uses [AppButtonVariant.danger], which is an outline in
/// the error colour rather than a solid red block. That is deliberate and it
/// is the reason this parameter exists at all: «امسح» and «إلغاء» sitting side
/// by side as two solid blocks makes the wrong one easy to hit, and a solid
/// red button is louder than the action usually deserves.
///
/// ## The height cap is a correctness fix
///
/// A centred dialog taller than the viewport grows off BOTH ends and the
/// overflow is unreachable — the web measured its exam gate at ~690px and on a
/// 640px phone «فاهم، ابدأ الامتحان» sat below the fold, so the student could
/// not start the exam at all. Hence the cap plus a scroll view rather than a
/// plain [Column].
class AppConfirmDialog extends StatelessWidget {
  const AppConfirmDialog({
    required this.title,
    required this.body,
    required this.confirmLabel,
    this.cancelLabel,
    this.destructive = false,
    super.key,
  });

  final String title;
  final String body;

  /// A VERB, not «موافق». The student should be able to read the button alone
  /// and know what is about to happen.
  final String confirmLabel;

  /// Defaults to «إلغاء».
  final String? cancelLabel;

  final bool destructive;

  /// Shows the dialog and resolves to whether the student confirmed.
  static Future<bool> ask(
    BuildContext context, {
    required String title,
    required String body,
    required String confirmLabel,
    String? cancelLabel,
    bool destructive = false,
  }) async {
    final answer = await showDialog<bool>(
      context: context,
      barrierColor: Theme.of(context).colorScheme.scrim,
      builder: (context) => AppConfirmDialog(
        title: title,
        body: body,
        confirmLabel: confirmLabel,
        cancelLabel: cancelLabel,
        destructive: destructive,
      ),
    );
    return answer ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Dialog(
      backgroundColor: c.surface2,
      elevation: 0,
      // 16 all round — the web's `calc(100% - 2rem)` width and its
      // `calc(100dvh - 2rem)` height budget, in one number.
      insetPadding: const EdgeInsets.all(AppSpacing.x16),
      shape: RoundedRectangleBorder(
        borderRadius: AppRadius.lgAll,
        // The same 0.5 hairline AppPanel draws. In dark this border is the
        // only thing separating the dialog from the barrier, since every
        // shadow token there is transparent.
        side: BorderSide(color: c.line, width: 0.5),
      ),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: 420,
          maxHeight: MediaQuery.sizeOf(context).height - AppSpacing.x32,
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.x20),
          child: Column(
            // stretch, not start: the footer Wrap can only push its buttons to
            // the inline end if it has been handed the full width to align
            // inside. With `start` the Wrap shrinks to its own children and
            // `WrapAlignment.end` silently does nothing.
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(title, style: type.title4Style(color: c.fg)),
              const SizedBox(height: AppSpacing.x4),
              Text(body, style: type.bodySm(color: c.fgMuted)),
              const SizedBox(height: AppSpacing.x20),
              // Wrap, not Row: two 44pt buttons with real Arabic verbs on
              // them — «إلغاء» beside «امسح الحساب نهائي» — overflow a 328pt
              // content box, and an overflowing Row paints the yellow stripes
              // over the action the student needs.
              Wrap(
                alignment: WrapAlignment.end,
                spacing: AppSpacing.x8,
                runSpacing: AppSpacing.x8,
                children: [
                  AppButton(
                    label: cancelLabel ?? tr(CopyKeys.adminActionsCancel),
                    onPressed: () => Navigator.of(context).pop(false),
                    variant: AppButtonVariant.secondary,
                  ),
                  AppButton(
                    label: confirmLabel,
                    onPressed: () => Navigator.of(context).pop(true),
                    variant: destructive
                        ? AppButtonVariant.danger
                        : AppButtonVariant.primary,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
