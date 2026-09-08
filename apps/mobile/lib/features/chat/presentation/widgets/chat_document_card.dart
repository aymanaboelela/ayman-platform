import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/config/app_environment.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/chat_attachment.dart';

/// A file أيمن attached — a lecture PDF, a worked solution.
///
/// ⚠️ Only ever appears on HIS messages. A student cannot send a document: the
/// upload route refuses every extension but images and voice.
class ChatDocumentCard extends StatelessWidget {
  const ChatDocumentCard({required this.attachment, super.key});

  final ChatAttachment attachment;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return InkWell(
      // Opened in the system browser rather than an in-app view.
      //
      // The bytes come back with `Content-Disposition: attachment` and
      // `Cache-Control: private, no-store`, so the browser saves it to
      // Downloads and the student keeps it — which is the point of a lecture
      // PDF. An in-app PDF view would show it once and lose it.
      //
      // ⚠️ The session travels as a bearer token, and an external browser does
      // NOT have it. This is the one place the app cannot hand a file off, and
      // it is why the download opens the API path on the web origin, where the
      // student's browser cookie still applies.
      onTap: () => launchUrl(
        Uri.parse('${AppEnvironment.siteUrl}${attachment.downloadPath}'),
        mode: LaunchMode.externalApplication,
      ),
      borderRadius: AppRadius.mdAll,
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.x8),
        decoration: BoxDecoration(
          color: c.surface3,
          borderRadius: AppRadius.mdAll,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          spacing: AppSpacing.x8,
          children: [
            Icon(Icons.description_outlined, size: 24, color: c.study),
            Flexible(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    attachment.filename,
                    style: type.bodySm(color: c.fg, weight: AppTextStyle.medium),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    attachment.readableSize,
                    // LTR: «1.2 MB» is a measurement, and mirroring it puts the
                    // unit before the number.
                    textDirection: TextDirection.ltr,
                    style: type.bodyXs(color: c.fgMuted),
                  ),
                ],
              ),
            ),
            Icon(Icons.download_rounded, size: 18, color: c.fgMuted),
          ],
        ),
      ),
    );
  }
}
