import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/feedback/app_empty_state.dart';

/// A published course with nothing published in it — «إزاي مفيش دروس؟».
///
/// ## Why this is checked BEFORE the enrolled/not-enrolled split
///
/// It was the worst-handled state on this page and it had TWO different wrong
/// answers. A student who was not enrolled got the ordinary «نبدأ الكورس»
/// panel with a dead button; a student who WAS enrolled got a progress bar
/// reading «خلصت ٠٪ · ٠ / ٠», no button, no sentence, and an outline below it
/// that rendered nothing at all. Neither said what had happened or what to do
/// instead, and both looked like a page that failed to load.
///
/// The answer is the same either way: there is nothing to enrol in and nothing
/// to resume.
///
/// ## And why the button goes to the library
///
/// Nothing the student can press will publish a lecture, and a button that
/// cannot succeed is worse than no button. The other courses are the real next
/// move.
class CourseEmptyPanel extends StatelessWidget {
  const CourseEmptyPanel({
    required this.onBrowse,
    this.comingSoonNote,
    super.key,
  });

  /// The instructor's own «لسه هننزل قريبًا» wording when they have set one —
  /// the same field the public course page's coming-soon panel reads — falling
  /// back to the stock line otherwise.
  final String? comingSoonNote;

  final VoidCallback onBrowse;

  @override
  Widget build(BuildContext context) {
    return AppEmptyState(
      icon: Icons.hourglass_empty_rounded,
      title: tr(CopyKeys.libraryEmptyTitle),
      body: comingSoonNote ?? tr(CopyKeys.libraryEmptyBody),
      actionLabel: tr(CopyKeys.libraryEmptyCta),
      onAction: onBrowse,
    );
  }
}
