import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/media/app_rich_text.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/attempt.dart';

/// `ordering` — put the items in the right sequence.
///
/// ## Two independent ways to move a row, and BOTH are required
///
/// Drag, for the students who will; and up/down buttons on every row, ALWAYS
/// visible, for keyboard, screen-reader and unsteady-hand users. The buttons
/// are not a fallback revealed on focus — on a phone they are the primary
/// control.
///
/// ## An untouched question stays NULL
///
/// The list is served shuffled. Counting that shuffle as an answer would mark
/// a student as having answered something they never looked at, and hand full
/// credit to whoever the RNG happened to favour. Only a MOVE writes a response.
class QuestionOrderingView extends StatefulWidget {
  const QuestionOrderingView({
    required this.question,
    required this.onChanged,
    super.key,
  });

  final LearnerQuestion question;
  final void Function(AnswerResponse? response) onChanged;

  @override
  State<QuestionOrderingView> createState() => _QuestionOrderingViewState();
}

class _QuestionOrderingViewState extends State<QuestionOrderingView> {
  late List<QuestionOption> _order = _resolve();

  @override
  void didUpdateWidget(QuestionOrderingView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.question.slotPosition != widget.question.slotPosition) {
      _order = _resolve();
    }
  }

  /// Reconciles the STORED order against the options actually served.
  ///
  /// ⚠️ Never trust a stored array to still describe the question: an id no
  /// longer served is dropped, and a served id the response never mentioned is
  /// appended. An instructor editing the question between sittings is exactly
  /// how a stored order stops matching.
  List<QuestionOption> _resolve() {
    final served = {for (final o in widget.question.options) o.id: o};
    final stored = widget.question.chosenIds;
    if (stored.isEmpty) return List.of(widget.question.options);

    final resolved = <QuestionOption>[
      for (final id in stored)
        if (served.containsKey(id)) served[id]!,
    ];
    final seen = resolved.map((o) => o.id).toSet();
    resolved.addAll(
      widget.question.options.where((o) => !seen.contains(o.id)),
    );
    return resolved;
  }

  /// ⚠️ EVERY move saves the WHOLE sequence. There is no half-written order
  /// to grade, and the question is all-or-nothing.
  void _commit() =>
      widget.onChanged(ChoiceAnswer(_order.map((o) => o.id).toList()));

  void _move(int from, int to) {
    if (to < 0 || to >= _order.length) return;
    setState(() {
      final item = _order.removeAt(from);
      _order.insert(to, item);
    });
    _commit();

    // Announced, because a screen-reader user who moved a row by button has
    // no other way to learn where it landed.
    SemanticsService.sendAnnouncement(
      View.of(context),
      tr(
        CopyKeys.quizMovedTo,
        namedArgs: {
          'item': _plain(_order[to].bodyHtml),
          'position': '${to + 1}',
          'total': '${_order.length}',
        },
      ),
      Directionality.of(context),
    );
  }

  static String _plain(String html) =>
      html.replaceAll(RegExp(r'<[^>]*>'), '').trim();

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.x8,
      children: [
        Text(
          tr(CopyKeys.quizOrderInstruction),
          style: type.bodyXs(color: c.fgMuted),
        ),

        ReorderableListView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          buildDefaultDragHandles: false,
          itemCount: _order.length,
          onReorder: (from, to) => _move(from, to > from ? to - 1 : to),
          itemBuilder: (context, index) {
            final option = _order[index];
            return Padding(
              key: ValueKey(option.id),
              padding: const EdgeInsets.only(bottom: AppSpacing.x8),
              child: Container(
                padding: const EdgeInsets.all(AppSpacing.x8),
                decoration: BoxDecoration(
                  color: c.surface2,
                  borderRadius: AppRadius.mdAll,
                  border: Border.all(color: c.line),
                ),
                child: Row(
                  spacing: AppSpacing.x8,
                  children: [
                    // The handle and the position number are the SAME element
                    // — a 32pt mono square, so the thing you grab is the thing
                    // that tells you where you are.
                    ReorderableDragStartListener(
                      index: index,
                      child: Container(
                        width: 32,
                        height: 32,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: c.studyTint,
                          borderRadius: AppRadius.smAll,
                        ),
                        child: Text(
                          '${index + 1}',
                          style: type.numeric(color: c.study, size: 13),
                        ),
                      ),
                    ),
                    Expanded(child: AppRichText(html: option.bodyHtml)),
                    // ALWAYS visible, never revealed on focus.
                    IconButton(
                      onPressed: index == 0 ? null : () => _move(index, index - 1),
                      tooltip: tr(CopyKeys.quizMoveUp),
                      visualDensity: VisualDensity.compact,
                      icon: const Icon(Icons.keyboard_arrow_up_rounded),
                    ),
                    IconButton(
                      onPressed: index == _order.length - 1
                          ? null
                          : () => _move(index, index + 1),
                      tooltip: tr(CopyKeys.quizMoveDown),
                      visualDensity: VisualDensity.compact,
                      icon: const Icon(Icons.keyboard_arrow_down_rounded),
                    ),
                  ],
                ),
              ),
            );
          },
        ),

        // Stated BEFORE the student answers, not after they are marked.
        Text(
          tr(CopyKeys.quizOrderAllOrNothing),
          style: type.bodyXs(color: c.warn),
        ),
      ],
    );
  }
}
