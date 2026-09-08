import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';

/// One plan, as its own tappable CARD.
///
/// A card rather than a row in a stacked list of buttons: four options —
/// شهر / ٣ شهور / سنة / ترم — each with its own glyph, name and price read as
/// four distinct products, where four rows of text read as a form.
///
/// The accessible name is built from the SAME visible strings the card prints,
/// so a screen reader announces exactly what the eye reads and never a
/// paraphrase of it.
class SubscribePlanCard extends StatelessWidget {
  const SubscribePlanCard({
    required this.icon,
    required this.name,
    required this.price,
    required this.onTap,
    super.key,
  });

  final IconData icon;
  final String name;

  /// Pre-formatted — «٢٥٠ جنيه».
  final String price;

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Semantics(
      button: true,
      label: '$name — $price',
      child: ExcludeSemantics(
        child: Material(
          color: c.surface3,
          borderRadius: AppRadius.lgAll,
          child: InkWell(
            onTap: onTap,
            borderRadius: AppRadius.lgAll,
            child: Container(
              padding: const EdgeInsets.all(AppSpacing.x16),
              decoration: BoxDecoration(
                borderRadius: AppRadius.lgAll,
                border: Border.all(color: c.line),
              ),
              child: Row(
                spacing: AppSpacing.x12,
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: c.studyTint,
                      borderRadius: AppRadius.mdAll,
                    ),
                    child: Icon(icon, size: 20, color: c.study),
                  ),
                  Expanded(
                    child: Text(name, style: type.title4Style(color: c.fg)),
                  ),
                  Text(
                    price,
                    style: type.numeric(color: c.accentText, size: 14),
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
