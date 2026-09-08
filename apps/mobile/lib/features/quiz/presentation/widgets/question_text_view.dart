import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/inputs/app_text_field.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/attempt.dart';

/// `short_answer` and `essay` — the same field, two heights.
///
/// `minWords`/`maxWords` are INFORMATIONAL. Nothing enforces them, client or
/// server, so the counter states the count and never blocks a hand-in: an
/// essay eighty words short is the instructor's judgement to make, not the
/// app's.
class QuestionTextView extends StatefulWidget {
  const QuestionTextView({
    required this.question,
    required this.onChanged,
    super.key,
  });

  final LearnerQuestion question;
  final void Function(AnswerResponse? response) onChanged;

  @override
  State<QuestionTextView> createState() => _QuestionTextViewState();
}

class _QuestionTextViewState extends State<QuestionTextView> {
  late final TextEditingController _controller =
      TextEditingController(text: widget.question.text);

  @override
  void didUpdateWidget(QuestionTextView oldWidget) {
    super.didUpdateWidget(oldWidget);
    // A DIFFERENT question reused this widget — the runner walks the paper in
    // place. Without this the previous answer stays in the field.
    if (oldWidget.question.slotPosition != widget.question.slotPosition) {
      _controller.text = widget.question.text;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  /// «{n} كلمة» — whitespace-separated, empty is zero.
  int get _words {
    final trimmed = _controller.text.trim();
    return trimmed.isEmpty ? 0 : trimmed.split(RegExp(r'\s+')).length;
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final isEssay = widget.question.type == 'essay';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.x8,
      children: [
        AppTextField(
          controller: _controller,
          hintText: tr(CopyKeys.quizTypeAnswer),
          maxLines: isEssay ? 10 : 3,
          minLines: isEssay ? 8 : 2,
          onChanged: (value) {
            setState(() {});
            // Emptying the field CLEARS the answer, which is what makes the
            // question read as unanswered again.
            widget.onChanged(value.trim().isEmpty ? null : TextAnswer(value));
          },
        ),
        Text(
          tr(CopyKeys.quizWordCount, namedArgs: {'n': '$_words'}),
          style: type.numeric(color: c.fgMuted, size: 12),
        ),
      ],
    );
  }
}
