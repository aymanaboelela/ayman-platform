import 'package:flutter/material.dart';

import '../../../theme/app_colors.dart';
import '../../../theme/app_radius.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_text_style.dart';
import '../buttons/app_button.dart';

/// The «مفيش حاجة هنا لسه» panel — the most reused widget in the product.
///
/// It stands in for an empty course list on the dashboard, an empty path, a
/// course with no lectures yet, «لسه مدخلتش أي امتحان» on results, an empty
/// notifications list and an empty inbox. Every one of those is a student
/// looking at a screen that has nothing on it, and the difference between a
/// product and a broken page is entirely in what this widget paints.
///
/// ## Why it is a tinted PANEL and not a centred grey line
///
/// «مصمطة» — the standing complaint about a page that shows one grey sentence
/// in the middle of nothing. The web answers it in `study.css`: *"ember-tinted
/// rather than a dashed grey rectangle… an empty container is STRUCTURE, and a
/// dashed grey box is indistinguishable from something that failed to load."*
/// So the panel carries [AppColors.studyTint] with a [AppColors.studyLine]
/// hairline, and it is never dashed, never grey and never borderless.
///
/// ## Why the icon sits on a disc
///
/// A bare glyph floating over a tint reads as a rendering artefact. The
/// [AppColors.surface3] disc turns it into an OBJECT sitting in the panel,
/// which is what the web's `.spot` illustrations do with a drawn ground line.
/// The glyph itself is [AppColors.fgFaint] — the faintest legible step —
/// because it is scenery, not information; the sentence under it is the
/// information.
///
/// ## Why the action is optional but wanted
///
/// Wherever a way out exists it belongs here: «الكورسات المتاحة» on an empty
/// path, «مسارك» on empty results, «نشوف باقي الكورسات» on an empty course.
/// Notifications and the inbox genuinely have no action — nothing the student
/// can press makes a notification arrive — so those pass a body line instead
/// and the panel still says something warm rather than sitting silent.
class AppEmptyState extends StatelessWidget {
  const AppEmptyState({
    required this.icon,
    required this.title,
    this.body,
    this.actionLabel,
    this.onAction,
    this.actionVariant = AppButtonVariant.primary,
    this.compact = false,
    this.margin,
    super.key,
  }) : assert(
         (actionLabel == null) == (onAction == null),
         'Pass an empty-state action as BOTH a label and a callback. A label '
         'alone renders as a disabled button — a dead-end offered to a student '
         'who already has nothing on the screen — and a callback alone is '
         'unreachable.',
       );

  /// The scene, not a status icon: a book for a course list, a bell for
  /// notifications, a clipboard for results. One glyph, always.
  final IconData icon;

  /// Already-translated Arabic. A short statement of what is missing —
  /// «لسه مدخلتش أي امتحان», not «لا توجد بيانات».
  final String title;

  /// One warm sentence explaining what will fill this space and when. Optional
  /// only because a handful of empties are genuinely self-evident; prefer to
  /// pass it.
  final String? body;

  final String? actionLabel;
  final VoidCallback? onAction;
  final AppButtonVariant actionVariant;

  /// Shrinks the disc and the padding for an empty state nested INSIDE a card
  /// or a section — the exams block on the dashboard, not a whole route.
  ///
  /// A full-size empty state inside a 200pt-tall section pushes the section's
  /// own header off the fold, which is how «الصفحة بتقفز» happens on a 360dp
  /// phone.
  final bool compact;

  final EdgeInsetsGeometry? margin;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    final wellSize = compact ? 56.0 : 72.0;
    final glyphSize = compact ? 24.0 : 32.0;

    final panel = Container(
      width: double.infinity,
      padding: EdgeInsets.symmetric(
        // 20 inline / 24 block — `.empty` in study.css. Tighter inline than
        // block on purpose: the panel is already inset from the screen edge.
        horizontal: AppSpacing.x20,
        vertical: compact ? AppSpacing.x20 : AppSpacing.x24,
      ),
      decoration: BoxDecoration(
        color: c.studyTint,
        borderRadius: AppRadius.lgAll,
        border: Border.all(color: c.studyLine, width: 1),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // The disc is scenery. Left in the semantics tree it would announce
          // itself before the sentence that actually says what is missing.
          ExcludeSemantics(
            child: Container(
              width: wellSize,
              height: wellSize,
              decoration: BoxDecoration(
                color: c.surface3,
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: glyphSize, color: c.fgFaint),
            ),
          ),
          // 12px — the `.spot` illustration's own margin-bottom.
          const SizedBox(height: AppSpacing.x12),
          ConstrainedBox(
            // A measure, not a width. On a tablet an unconstrained centred
            // sentence runs the full panel and the eye loses the line start;
            // on a phone this constraint never binds.
            constraints: const BoxConstraints(maxWidth: 320),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  title,
                  textAlign: TextAlign.center,
                  style: type.body(color: c.fg, weight: AppTextStyle.medium),
                ),
                if (body != null) ...[
                  const SizedBox(height: AppSpacing.x4),
                  Text(
                    body!,
                    textAlign: TextAlign.center,
                    style: type.bodySm(color: c.fgMuted),
                  ),
                ],
              ],
            ),
          ),
          if (actionLabel != null) ...[
            const SizedBox(height: AppSpacing.x16),
            AppButton(
              label: actionLabel!,
              onPressed: onAction,
              variant: actionVariant,
              size: compact ? AppButtonSize.small : AppButtonSize.medium,
            ),
          ],
        ],
      ),
    );

    if (margin == null) return panel;
    return Padding(padding: margin!, child: panel);
  }
}
