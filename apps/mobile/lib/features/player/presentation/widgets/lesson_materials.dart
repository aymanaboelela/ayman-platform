import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/lesson_player.dart';

/// «مواد المحاضرة» — the slides, the documents, the links.
///
/// ⚠️ CLOSED by default. An embedded PDF viewer under every video is a page
/// nobody asked for, and on a phone it pushes the finish button below three
/// screenfuls of slides.
class LessonMaterials extends StatefulWidget {
  const LessonMaterials({
    required this.resources,
    required this.onOpenFile,
    super.key,
  });

  final List<PlayerResource> resources;

  /// Opens a FILE resource. Handled by the page, not here — see
  /// [LessonResourceRow] for why a file cannot simply be a link.
  final void Function(PlayerResource resource) onOpenFile;

  @override
  State<LessonMaterials> createState() => _LessonMaterialsState();
}

class _LessonMaterialsState extends State<LessonMaterials> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Container(
      decoration: BoxDecoration(
        color: c.surface2,
        borderRadius: AppRadius.lgAll,
        border: Border.all(color: c.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: () => setState(() => _open = !_open),
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.x16),
                child: Row(
                  spacing: AppSpacing.x12,
                  children: [
                    Icon(Icons.folder_outlined, size: 20, color: c.study),
                    Expanded(
                      child: Text(
                        tr(CopyKeys.playerMaterials),
                        style: type.title4Style(color: c.fg),
                      ),
                    ),
                    Text(
                      '${widget.resources.length} '
                      '${tr(CopyKeys.playerMaterialsCount)}',
                      style: type.numeric(color: c.fgMuted, size: 12),
                    ),
                    AnimatedRotation(
                      turns: _open ? 0.5 : 0,
                      duration: const Duration(milliseconds: 160),
                      child: Icon(
                        Icons.keyboard_arrow_down_rounded,
                        size: 20,
                        color: c.fgMuted,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (_open)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.x12,
                0,
                AppSpacing.x12,
                AppSpacing.x12,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                spacing: AppSpacing.x8,
                children: [
                  if (widget.resources.isEmpty)
                    Text(
                      tr(CopyKeys.playerNoResources),
                      style: type.bodySm(color: c.fgMuted),
                    )
                  else
                    for (final resource in widget.resources)
                      LessonResourceRow(
                        resource: resource,
                        onOpenFile: widget.onOpenFile,
                      ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// One material: a title, an optional line under it, and a way to open it.
class LessonResourceRow extends StatelessWidget {
  const LessonResourceRow({
    required this.resource,
    required this.onOpenFile,
    super.key,
  });

  final PlayerResource resource;
  final void Function(PlayerResource resource) onOpenFile;

  /// The EXTERNAL destination — a link or a YouTube video, and nothing else.
  ///
  /// ⚠️ A FILE is deliberately absent here. `viewPath`/`downloadPath` are
  /// relative API paths that re-derive enrolment per request, so they need the
  /// session — and the session is a bearer token held by this app, not a
  /// cookie a browser could send. Handing one of those URLs to
  /// `launchUrl` opens the system browser as an ANONYMOUS caller and produces
  /// a 401 that reads, to the student, as a broken slide deck.
  ///
  /// So files go through [onOpenFile], which fetches them with the client that
  /// holds the token.
  String? get _externalUrl {
    if (resource.linkUrl != null) return resource.linkUrl;
    if (resource.youtubeId != null) {
      return 'https://www.youtube.com/watch?v=${resource.youtubeId}';
    }
    return null;
  }

  IconData get _icon => switch (resource.kind) {
        'presentation' => Icons.slideshow_outlined,
        'document' => Icons.description_outlined,
        'video' => Icons.play_circle_outline_rounded,
        _ => Icons.link_rounded,
      };

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final external = _externalUrl;
    final openable = resource.isFile || external != null;

    return Material(
      color: c.surface3,
      borderRadius: AppRadius.mdAll,
      child: InkWell(
        onTap: !openable
            ? null
            : resource.isFile
                ? () => onOpenFile(resource)
                : () => launchUrl(
                      Uri.parse(external!),
                      mode: LaunchMode.externalApplication,
                    ),
        borderRadius: AppRadius.mdAll,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.x12),
          child: Row(
            spacing: AppSpacing.x12,
            children: [
              Icon(_icon, size: 20, color: c.study),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: AppSpacing.x2,
                  children: [
                    // ⚠️ The instructor's TITLE, never the stored filename:
                    // multer decodes the multipart name as latin1, so an
                    // Arabic upload reads as «Ø£Ø³Ø§Ø³ÙØ§Øª…».
                    Text(resource.title, style: type.bodySm(color: c.fg)),
                    if (resource.description != null)
                      Text(
                        resource.description!,
                        style: type.bodyXs(color: c.fgMuted),
                      ),
                  ],
                ),
              ),
              if (openable)
                Icon(
                  resource.isFile
                      ? Icons.download_rounded
                      : Icons.open_in_new_rounded,
                  size: 16,
                  color: c.fgMuted,
                ),
            ],
          ),
        ),
      ),
    );
  }
}
