import 'package:easy_localization/easy_localization.dart';

import '../localization/copy_keys.dart';

/// «٢ ساعة ١٥ دقيقة» — a course's total video length.
///
/// The mobile twin of `formatDuration` in
/// `apps/web/components/site/course-card.tsx`, and it must stay identical: the
/// same course prints the same length on the card in the app and on the card
/// on the site.
///
/// Minutes are ROUNDED, not floored, so a 3595-second course reads «٦٠ دقيقة»
/// rather than «٥٩». It is an at-a-glance figure on a card, not a duration
/// anything is measured against.
String formatDuration(int totalSeconds) {
  final hours = totalSeconds ~/ 3600;
  final minutes = ((totalSeconds % 3600) / 60).round();
  final minutesPart = '$minutes ${tr(CopyKeys.catalogMinutes)}';
  if (hours == 0) return minutesPart;
  return '$hours ${tr(CopyKeys.catalogHours)} $minutesPart';
}
