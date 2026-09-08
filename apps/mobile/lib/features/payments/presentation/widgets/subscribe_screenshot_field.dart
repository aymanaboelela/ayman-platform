import 'dart:io';

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/services/media/image_pick_service.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';

/// The proof-of-transfer picker: a dropzone that becomes a preview.
///
/// ## Why the preview matters more than it looks
///
/// The student has already moved the money. If they attach the wrong picture
/// the submission is refused and they have to chase it, so the one thing this
/// control must do is let them SEE what they are about to send — «سكرين شوت
/// واضح من تطبيق إنستاباي بيوضّح المبلغ والتاريخ».
class SubscribeScreenshotField extends StatelessWidget {
  const SubscribeScreenshotField({
    required this.image,
    required this.onPick,
    super.key,
  });

  /// Null renders the empty dropzone.
  final PickedImage? image;

  final VoidCallback onPick;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final picked = image;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.x8,
      children: [
        Text(
          tr(CopyKeys.subscribeScreenshotLabel),
          style: type.bodySm(color: c.fg, weight: AppTextStyle.medium),
        ),
        Semantics(
          button: true,
          label: tr(
            picked == null
                ? CopyKeys.subscribeScreenshotPlaceholder
                : CopyKeys.subscribeScreenshotChange,
          ),
          child: ExcludeSemantics(
            child: Material(
              color: c.surface3,
              borderRadius: AppRadius.mdAll,
              child: InkWell(
                onTap: onPick,
                borderRadius: AppRadius.mdAll,
                child: Container(
                  height: picked == null ? 120 : 220,
                  decoration: BoxDecoration(
                    borderRadius: AppRadius.mdAll,
                    border: Border.all(color: c.line),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: picked == null
                      ? Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          spacing: AppSpacing.x8,
                          children: [
                            Icon(
                              Icons.add_photo_alternate_outlined,
                              size: 28,
                              color: c.fgMuted,
                            ),
                            Text(
                              tr(CopyKeys.subscribeScreenshotPlaceholder),
                              style: type.bodySm(color: c.fgMuted),
                              textAlign: TextAlign.center,
                            ),
                          ],
                        )
                      : Stack(
                          fit: StackFit.expand,
                          children: [
                            // From the FILE, not from the network: the picture
                            // has not been uploaded yet and there is nothing
                            // to fetch.
                            Image.file(File(picked.path), fit: BoxFit.cover),
                            Positioned(
                              bottom: 0,
                              left: 0,
                              right: 0,
                              child: Container(
                                color: Colors.black.withValues(alpha: 0.55),
                                padding: const EdgeInsets.symmetric(
                                  vertical: AppSpacing.x8,
                                ),
                                child: Text(
                                  tr(CopyKeys.subscribeScreenshotChange),
                                  textAlign: TextAlign.center,
                                  style: type.bodySm(color: Colors.white),
                                ),
                              ),
                            ),
                          ],
                        ),
                ),
              ),
            ),
          ),
        ),
        Text(
          tr(CopyKeys.subscribeScreenshotHint),
          style: type.bodyXs(color: c.fgMuted),
        ),
      ],
    );
  }
}
