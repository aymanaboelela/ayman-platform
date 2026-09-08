import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_style.dart';

/// One sentence saying how this lesson gets ticked off.
///
/// Exactly one of three, and the choice is not cosmetic: a student who does
/// not know a video ticks itself will press the button at minute two, and a
/// student who assumes it does on a lecture with no recorded duration will
/// never press it at all.
class LessonCompletionHint extends StatelessWidget {
  const LessonCompletionHint({
    required this.isQuiz,
    required this.autoCompleteAvailable,
    super.key,
  });

  final bool isQuiz;
  final bool autoCompleteAvailable;

  String get _key {
    if (isQuiz) return CopyKeys.playerQuizAutoCompleteHint;
    if (autoCompleteAvailable) return CopyKeys.playerAutoCompleteHint;
    // No recorded duration, so the thresholds can never be met — «مدة الفيديو
    // مش متسجّلة، فدوسة على «الدرس خلص» في الآخر.»
    return CopyKeys.playerManualOnlyHint;
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Text(tr(_key), style: type.bodySm(color: c.fgMuted));
  }
}
