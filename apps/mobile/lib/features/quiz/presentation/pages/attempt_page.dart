import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/data/exception/failure.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/buttons/app_button.dart';
import '../../../../core/presentation/widgets/feedback/app_error_view.dart';
import '../../../../core/presentation/widgets/layout/app_confirm_dialog.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/repositories/quiz_repository.dart';
import '../cubit/attempt_cubit.dart';
import '../widgets/attempt_navigator_sheet.dart';
import '../widgets/attempt_question_card.dart';
import '../widgets/attempt_timer.dart';

/// The exam runner.
///
/// ⚠️ BARE CHROME. No tab bar, no drawer, no notification bell — a student
/// sitting a timed paper must not be one stray tap from leaving it, and the
/// route lives on the root navigator for exactly that reason.
class AttemptPage extends StatelessWidget {
  const AttemptPage({
    required this.lessonId,
    required this.attemptId,
    super.key,
  });

  final String lessonId;

  /// The literal `new` starts a fresh sitting; anything else resumes that one.
  final String attemptId;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => AttemptCubit(sl<QuizRepository>())
        ..begin(
          lessonId: lessonId,
          resumeAttemptId: attemptId == 'new' ? null : attemptId,
        ),
      child: _AttemptView(lessonId: lessonId),
    );
  }
}

class _AttemptView extends StatelessWidget {
  const _AttemptView({required this.lessonId});

  final String lessonId;

  /// ⚠️ Leaving does NOT stop the clock, and the copy says so. Answers are
  /// saved; the time keeps running outside.
  Future<bool> _confirmLeave(BuildContext context) async {
    return AppConfirmDialog.ask(
      context,
      title: tr(CopyKeys.quizLeaveTitle),
      body: tr(CopyKeys.quizLeaveBody),
      confirmLabel: tr(CopyKeys.quizLeaveConfirm),
      cancelLabel: tr(CopyKeys.quizLeaveStay),
    );
  }

  Future<void> _submit(BuildContext context, AttemptRunning state) async {
    final cubit = context.read<AttemptCubit>();
    // The server's count, not the client's: answers still in flight are the
    // ones a student is most likely to be wrong about.
    final counts = await cubit.preflight();
    if (!context.mounted) return;

    final unanswered = counts?.unansweredCount ?? 0;
    final confirmed = await AppConfirmDialog.ask(
      context,
      title: tr(CopyKeys.quizSubmitConfirmTitle),
      body: [
        unanswered > 0
            ? tr(
                CopyKeys.quizSubmitConfirmUnanswered,
                namedArgs: {'count': '$unanswered'},
              )
            : tr(CopyKeys.quizSubmitConfirmAllAnswered),
        tr(CopyKeys.quizSubmitConfirmBody),
      ].join('\n'),
      confirmLabel: tr(CopyKeys.quizSubmitConfirmAction),
    );
    if (!confirmed || !context.mounted) return;

    await cubit.submit();
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);

    return BlocBuilder<AttemptCubit, AttemptState>(
      builder: (context, state) {
        return PopScope(
          // Never a silent exit from a running paper.
          canPop: state is! AttemptRunning,
          onPopInvokedWithResult: (didPop, _) async {
            if (didPop || state is! AttemptRunning) return;
            if (await _confirmLeave(context) && context.mounted) {
              await context.read<AttemptCubit>().flush();
              if (context.mounted) context.pop();
            }
          },
          child: Scaffold(
            backgroundColor: c.surface1,
            body: SafeArea(
              child: switch (state) {
                AttemptLoading() =>
                  const Center(child: CircularProgressIndicator()),
                AttemptFailed(:final failure) => _AttemptError(failure: failure),
                AttemptRunning() => _AttemptBody(
                    state: state,
                    onSubmit: () => _submit(context, state),
                  ),
                AttemptSubmitted() => _AttemptDone(
                    state: state,
                    lessonId: lessonId,
                  ),
              },
            ),
          ),
        );
      },
    );
  }
}

/// The paper itself: a header with the clock, the question, and the nav.
class _AttemptBody extends StatelessWidget {
  const _AttemptBody({required this.state, required this.onSubmit});

  final AttemptRunning state;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final cubit = context.read<AttemptCubit>();
    final attempt = state.attempt;

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(AppSpacing.x12),
          child: Row(
            spacing: AppSpacing.x8,
            children: [
              IconButton(
                onPressed: () => Navigator.of(context).maybePop(),
                tooltip: tr(CopyKeys.quizLeaveTitle),
                icon: const Icon(Icons.close_rounded),
              ),
              if (state.remaining != null)
                AttemptTimer(
                  remaining: state.remaining!,
                  inGrace: state.inGrace,
                ),
              const Spacer(),
              IconButton(
                onPressed: () => AttemptNavigatorSheet.show(
                  context,
                  questions: attempt.questions,
                  currentIndex: state.index,
                  onSelect: cubit.goTo,
                ),
                tooltip: tr(CopyKeys.quizNavigator),
                icon: const Icon(Icons.grid_view_rounded),
              ),
            ],
          ),
        ),

        if (state.saveFailed)
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.screenInset,
            ),
            child: Semantics(
              liveRegion: true,
              child: Text(
                tr(CopyKeys.quizSaveFailed),
                style: type.bodySm(color: c.err),
              ),
            ),
          ),

        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(AppSpacing.screenInset),
            child: AttemptQuestionCard(
              // Keyed on the slot so moving between questions rebuilds the
              // controls rather than carrying the previous answer's state.
              key: ValueKey(state.current.slotPosition),
              question: state.current,
              total: attempt.questions.length,
              onChanged: (response) =>
                  cubit.answer(state.current.slotPosition, response),
              onToggleFlag: () => cubit.toggleFlag(state.current.slotPosition),
            ),
          ),
        ),

        Padding(
          padding: const EdgeInsets.all(AppSpacing.screenInset),
          child: Row(
            spacing: AppSpacing.x12,
            children: [
              // ⚠️ `sequential` navigation means BACK is not offered — the
              // instructor chose a paper the student walks once.
              if (!attempt.isSequential && !state.isFirst)
                Expanded(
                  child: OutlinedButton(
                    onPressed: () async {
                      // Leaving a question flushes it: a pending answer that
                      // never goes is a mark the student earned and loses.
                      await cubit.flush();
                      cubit.goTo(state.index - 1);
                    },
                    child: Text(tr(CopyKeys.quizPrevious)),
                  ),
                ),
              Expanded(
                child: state.isLast
                    ? AppButton(
                        label: tr(
                          state.submitting
                              ? CopyKeys.quizSubmitting
                              : CopyKeys.quizSubmit,
                        ),
                        loading: state.submitting,
                        onPressed: onSubmit,
                      )
                    : AppButton(
                        label: tr(CopyKeys.quizNext),
                        variant: AppButtonVariant.secondary,
                        onPressed: () async {
                          await cubit.flush();
                          cubit.goTo(state.index + 1);
                        },
                      ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// The score, the moment it is earned.
class _AttemptDone extends StatelessWidget {
  const _AttemptDone({required this.state, required this.lessonId});

  final AttemptSubmitted state;
  final String lessonId;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final result = state.result;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.screenInset),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          spacing: AppSpacing.x16,
          children: [
            Icon(
              result.passed ? Icons.emoji_events_outlined : Icons.fact_check_outlined,
              size: 48,
              color: result.passed ? c.ok : c.fgMuted,
            ),
            // «الوقت خلص واتسلّمت» is a different fact from «اتسلّمت», and a
            // student whose paper went in without them pressing anything is
            // owed the difference.
            if (state.autoSubmitted)
              Text(
                tr(CopyKeys.quizTimeUpBody),
                textAlign: TextAlign.center,
                style: type.bodySm(color: c.warn),
              ),
            Text(
              '${result.scaledScore.round()}٪',
              style: type.title1Style(color: c.fg),
            ),
            if (result.needsGrading)
              Text(
                tr(CopyKeys.quizEssayPending),
                textAlign: TextAlign.center,
                style: type.bodySm(color: c.fgMuted),
              ),
            AppButton(
              label: tr(CopyKeys.quizReviewAnswers),
              onPressed: () => context.pushReplacement(
                AppRoutes.attemptReviewOf(lessonId, result.attemptId),
              ),
            ),
            TextButton(
              onPressed: () => context.go(AppRoutes.library),
              child: Text(tr(CopyKeys.libraryBackToLibrary)),
            ),
          ],
        ),
      ),
    );
  }
}

class _AttemptError extends StatelessWidget {
  const _AttemptError({required this.failure});

  final Failure failure;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.screenInset),
        child: AppErrorView(failure: failure),
      ),
    );
  }
}
