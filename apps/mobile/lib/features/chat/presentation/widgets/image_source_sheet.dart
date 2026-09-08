import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/layout/app_bottom_sheet.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';

/// «تصوير» or «من الصور».
///
/// A sheet rather than opening the camera directly, because both are the
/// common case here: a student photographs the page in front of them, or picks
/// the screenshot they already took. Guessing wrong costs a permission prompt
/// and a trip back.
class ImageSourceSheet extends StatelessWidget {
  const ImageSourceSheet({super.key});

  static Future<ImageSource?> ask(BuildContext context) {
    return AppBottomSheet.show<ImageSource>(
      context,
      builder: (_) => const ImageSourceSheet(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        ImageSourceRow(
          icon: Icons.photo_camera_outlined,
          label: tr(CopyKeys.assistantThreadAttachCamera),
          onTap: () => Navigator.of(context).pop(ImageSource.camera),
        ),
        ImageSourceRow(
          icon: Icons.photo_library_outlined,
          label: tr(CopyKeys.assistantThreadAttachGallery),
          onTap: () => Navigator.of(context).pop(ImageSource.gallery),
        ),
        const SizedBox(height: AppSpacing.x8),
      ],
    );
  }
}

/// One choice in the sheet.
class ImageSourceRow extends StatelessWidget {
  const ImageSourceRow({
    required this.icon,
    required this.label,
    required this.onTap,
    super.key,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.x16,
          vertical: AppSpacing.x16,
        ),
        child: Row(
          spacing: AppSpacing.x12,
          children: [
            Icon(icon, size: 22, color: c.fgMuted),
            Text(label, style: type.body(color: c.fg)),
          ],
        ),
      ),
    );
  }
}
