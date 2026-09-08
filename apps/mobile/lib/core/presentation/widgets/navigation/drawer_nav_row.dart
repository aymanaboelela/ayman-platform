import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../router/student_nav_items.dart';
import '../../../theme/app_colors.dart';
import '../../../theme/app_radius.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_text_style.dart';

/// One destination in the drawer.
///
/// The current row is marked THREE ways — a filled icon, accent text and a 3px
/// marker on the inline-start edge — which is the web's `.nav-pill` active
/// treatment. Three signals rather than one because colour alone is not
/// available to every student, and a filled-vs-outlined icon at 20px is a
/// subtle difference on a cheap screen.
class DrawerNavRow extends StatelessWidget {
  const DrawerNavRow({required this.item, required this.selected, super.key});

  final StudentNavItem item;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final colour = selected ? c.accentText : c.fgMuted;

    return Semantics(
      button: true,
      selected: selected,
      child: InkWell(
        onTap: () {
          Navigator.of(context).pop();
          context.go(item.route);
        },
        child: Container(
          height: 52,
          margin: const EdgeInsetsDirectional.symmetric(
            horizontal: AppSpacing.x8,
            vertical: AppSpacing.x2,
          ),
          decoration: BoxDecoration(
            // 12% amber. Enough to read as a filled row on both themes without
            // becoming a button — this is a marker, not an action.
            color: selected ? c.accent.withValues(alpha: 0.12) : null,
            borderRadius: AppRadius.mdAll,
          ),
          child: Row(
            children: [
              // The inline-start marker. `Directional` so it sits on the RIGHT
              // in Arabic — a marker on the wrong edge reads as a rendering
              // bug rather than as emphasis.
              Container(
                width: 3,
                height: 24,
                decoration: BoxDecoration(
                  color: selected ? c.accent : Colors.transparent,
                  borderRadius: const BorderRadius.all(Radius.circular(2)),
                ),
              ),
              const SizedBox(width: AppSpacing.x12),
              Icon(selected ? item.activeIcon : item.icon, size: 20, color: colour),
              const SizedBox(width: AppSpacing.x12),
              Expanded(
                child: Text(
                  tr(item.labelKey),
                  style: type.body(
                    color: selected ? c.fg : c.fgMuted,
                    weight: selected ? AppTextStyle.semibold : AppTextStyle.regular,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: AppSpacing.x8),
            ],
          ),
        ),
      ),
    );
  }
}
