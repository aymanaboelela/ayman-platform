import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/extensions/navigation_extension.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/feedback/app_progress_meter.dart';
import '../../../../core/presentation/widgets/surfaces/app_panel.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/continue_watching.dart';

/// «نكمّل من مكانك» — one tap back to the exact lesson the student stopped on.
///
/// The single most valuable thing on the home screen, and the reason it sits
/// directly under the greeting: without it, resuming is «افتح الكورس، دور على
/// المحاضرة، دور على الدقيقة».
///
/// It states the REMAINING minutes rather than the elapsed ones. «فاضل ١٢
/// دقيقة» is a decision a student can make on a bus; «شُفت ٧٠٪» is a fact they
/// then have to do arithmetic on.
class ContinueWatchingCard extends StatelessWidget {
  const ContinueWatchingCard({required this.item, super.key});

  final ContinueWatching item;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return AppPanel(
      onTap: () => context.open(AppRoutes.lessonOf(item.courseSlug, item.lessonId)),
      // The ember TINT, not the page surface: this is the one card on the
      // screen that is a continuation of something already in progress, and
      // the wash is what separates it from the course list below without
      // making it an action colour.
      background: c.studyTint,
      borderColor: c.studyLine,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: c.accent,
                  borderRadius: AppRadius.mdAll,
                ),
                child: Icon(
                  Icons.play_arrow_rounded,
                  color: c.accentContrast,
                  size: 26,
                ),
              ),
              const SizedBox(width: AppSpacing.x12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      tr(CopyKeys.dashboardContinueWatching),
                      style: type.label(color: c.study),
                    ),
                    const SizedBox(height: AppSpacing.x4),
                    Text(
                      item.lessonTitle,
                      style: type.title4Style(color: c.fg),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.x12),

          Text(
            item.courseTitle,
            style: type.bodyXs(color: c.fgMuted),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: AppSpacing.x8),

          AppProgressMeter(value: item.progressPercent / 100),
          const SizedBox(height: AppSpacing.x8),

          Row(
            children: [
              Icon(Icons.schedule_rounded, size: 14, color: c.fgMuted),
              const SizedBox(width: AppSpacing.x4),
              Text(
                // «باقي ١٢ دقيقة», assembled from two existing keys rather
                // than a new one: `dashboard.remaining` is «باقي» and
                // `catalog.minutes` is «دقيقة», and both already say exactly
                // this on the web. Inventing a third key would be a string the
                // copy table does not own.
                //
                // `remainingMinutes` CEILS, so a lesson with 30 seconds left
                // reads «باقي ١ دقيقة» rather than «باقي ٠ دقيقة».
                '${tr(CopyKeys.dashboardRemaining)} '
                '${item.remainingMinutes} ${tr(CopyKeys.catalogMinutes)}',
                style: type.bodyXs(color: c.fgMuted),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
