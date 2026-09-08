import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../localization/copy_keys.dart';
import '../../../theme/app_colors.dart';
import '../../../theme/app_radius.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_text_style.dart';
import 'app_divider.dart';

/// The modal sheet — a filter picker, a plan chooser, «شارك», a lesson's
/// attachments.
///
/// Call [AppBottomSheet.show]; the widget itself is what that static builds
/// and is rarely constructed by hand.
///
/// ```dart
/// final choice = await AppBottomSheet.show<String>(
///   context,
///   title: tr(CopyKeys.streamFilterAll),
///   builder: (context) => Column(children: [...]),
/// );
/// ```
///
/// ## What this fixes that `showModalBottomSheet` alone does not
///
/// * **Rounded at the TOP only** ([AppRadius.sheetTop]). A sheet flush with
///   the bottom of the display with all four corners rounded leaves two
///   slivers of page showing under it.
/// * **`isScrollControlled: true` plus a real height cap.** Without the flag a
///   sheet is capped at half the screen and a long list is unreachable; with
///   it and no cap, a tall sheet covers the status bar. Capped at 90% here, so
///   there is always a visible strip of the page behind it to tap out on.
/// * **The keyboard.** The content is pushed by `viewInsets.bottom`, which is
///   the whole reason a sheet with a text field in it is usable. Without it
///   the field is under the keyboard and the student is typing blind.
/// * **The safe area.** `useSafeArea` keeps the sheet clear of the status bar;
///   the [SafeArea] inside keeps the last button clear of the home indicator.
///
/// ## The barrier
///
/// `colorScheme.scrim`, not a literal. The web's overlay is `#000000B3` and
/// the theme's scrim is the token that carries it — the one colour in this
/// widget that is not in [AppColors], because a scrim is not a surface.
class AppBottomSheet extends StatelessWidget {
  const AppBottomSheet({
    required this.child,
    this.title,
    this.scrollable = true,
    super.key,
  });

  final Widget child;

  /// Titled sheets also get a close button. Untitled ones rely on the drag
  /// handle and the barrier, which is right for a two-line confirmation and
  /// wrong for anything a student has to read.
  final String? title;

  /// Whether the body scrolls. Turn it off only for content that manages its
  /// own scrolling — a nested [ListView] with its own controller.
  final bool scrollable;

  /// Opens the sheet and resolves to whatever was popped, or null if the
  /// student dismissed it.
  static Future<T?> show<T>(
    BuildContext context, {
    required WidgetBuilder builder,
    String? title,
    bool scrollable = true,
    bool dismissible = true,
  }) {
    final c = AppColors.of(context);

    return showModalBottomSheet<T>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      isDismissible: dismissible,
      enableDrag: dismissible,
      backgroundColor: c.surface2,
      barrierColor: Theme.of(context).colorScheme.scrim,
      elevation: 0,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(borderRadius: AppRadius.sheetTop),
      builder: (context) => AppBottomSheet(
        title: title,
        scrollable: scrollable,
        child: builder(context),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    const bodyPadding = EdgeInsets.all(AppSpacing.x16);

    return Padding(
      // `viewInsetsOf` rather than `MediaQuery.of`: this rebuilds on every
      // frame of the keyboard animation, and depending on the whole
      // MediaQueryData would rebuild the sheet on rotation, text-scale and
      // brightness changes too.
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.9,
        ),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (title != null) ...[
                Padding(
                  padding: const EdgeInsetsDirectional.only(
                    start: AppSpacing.x16,
                    end: AppSpacing.x4,
                    bottom: AppSpacing.x8,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          title!,
                          style: type.title4Style(color: c.fg),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      IconButton(
                        // `maybePop` rather than `pop`: the sheet may already
                        // be closing from a drag, and popping twice takes the
                        // route under it with it.
                        onPressed: () => Navigator.of(context).maybePop(),
                        tooltip: tr(CopyKeys.commonClose),
                        icon: const Icon(Icons.close, size: 18),
                      ),
                    ],
                  ),
                ),
                const AppDivider(),
              ],
              // Flexible, not Expanded: a two-line sheet should be two lines
              // tall, and only a sheet that would exceed the cap gets clipped
              // down to it.
              Flexible(
                child: scrollable
                    ? SingleChildScrollView(
                        padding: bodyPadding,
                        child: child,
                      )
                    : Padding(padding: bodyPadding, child: child),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
