import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/data/exception/failure.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/feedback/app_empty_state.dart';
import '../../../../core/presentation/widgets/feedback/app_error_view.dart';
import '../../../../core/presentation/widgets/layout/app_screen.dart';
import '../../../../core/presentation/widgets/surfaces/app_panel.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/attempt_review.dart';
import '../../domain/repositories/quiz_repository.dart';
import '../cubit/review_cubit.dart';
import '../widgets/review_question_card.dart';

/// «مراجعة الإجابات» — the paper, after it is in.
///
/// ⚠️ Ordinary chrome, unlike the runner. This screen is a normal page and
/// stripping its navigation would trap the student on it, which is exactly why
/// the bare-chrome rule is anchored to exclude `…/review`.
class AttemptReviewPage extends StatelessWidget {
  const AttemptReviewPage({
    required this.lessonId,
    required this.attemptId,
    super.key,
  });

  final String lessonId;
  final String attemptId;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => ReviewCubit(sl<QuizRepository>(), attemptId)..load(),
      child: _ReviewView(lessonId: lessonId),
    );
  }
}

class _ReviewView extends StatelessWidget {
  const _ReviewView({required this.lessonId});

  final String lessonId;

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<ReviewCubit, ReviewState>(
      builder: (context, state) {
        return AppScreen.slivers(
          title: tr(CopyKeys.quizReviewAnswers),
          onBack: () => context.canPop()
              ? context.pop()
              : context.go(AppRoutes.quizOf(lessonId)),
          onRefresh: context.read<ReviewCubit>().load,
          actions: [
            if (state is ReviewReady && state.payload is ReviewUnlocked)
              // «الغلطات بس» — a filter over what is already loaded, not a
              // second request.
              IconButton(
                onPressed: context.read<ReviewCubit>().toggleWrongOnly,
                tooltip: tr(CopyKeys.quizWrongOnly),
                isSelected: state.wrongOnly,
                icon: const Icon(Icons.filter_alt_outlined),
                selectedIcon: const Icon(Icons.filter_alt_rounded),
              ),
          ],
          slivers: switch (state) {
            ReviewLoading() => const [
                SliverToBoxAdapter(
                  child: Center(child: CircularProgressIndicator()),
                ),
              ],
            ReviewFailed(:final failure) => [
                SliverToBoxAdapter(child: _ReviewError(failure: failure)),
              ],
            ReviewReady() => _slivers(state),
          },
        );
      },
    );
  }

  List<Widget> _slivers(ReviewReady state) {
    final payload = state.payload;

    // ⚠️ Locked is NOT an error. The instructor releases answers when they
    // choose, and «لسه بدري» is a different sentence from «حصل خطأ».
    if (payload is ReviewLocked) {
      return [
        SliverToBoxAdapter(
          child: AppEmptyState(
            icon: Icons.lock_clock_outlined,
            title: tr(CopyKeys.quizReviewLocked),
            body: tr(
              payload.reason == 'during'
                  ? CopyKeys.quizReviewLockedDuringBody
                  : CopyKeys.quizReviewLockedUntilClose,
            ),
          ),
        ),
      ];
    }

    final unlocked = payload as ReviewUnlocked;
    final shown = state.wrongOnly
        ? unlocked.questions
            .where((q) => q.hasCorrectness && q.correctness != 'correct')
            .toList()
        : unlocked.questions;

    return [
      SliverToBoxAdapter(child: _ScorePanel(review: unlocked)),
      const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.sectionGap)),
      if (shown.isEmpty)
        SliverToBoxAdapter(
          child: AppEmptyState(
            icon: Icons.emoji_events_outlined,
            title: tr(CopyKeys.quizAllCorrect),
          ),
        )
      else
        SliverList.builder(
          itemCount: shown.length,
          itemBuilder: (context, index) =>
              ReviewQuestionCard(question: shown[index]),
        ),
    ];
  }
}

/// The score at the top, and the verdict when there is one.
class _ScorePanel extends StatelessWidget {
  const _ScorePanel({required this.review});

  final ReviewUnlocked review;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return AppPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppSpacing.x8,
        children: [
          if (review.scaledScore != null)
            Text(
              '${review.scaledScore!.round()}٪',
              style: type.title1Style(
                color: review.passed == true ? c.ok : c.fg,
              ),
            ),
          if (review.rawScore != null)
            Text(
              tr(
                CopyKeys.quizMarksEarned,
                namedArgs: {
                  'earned': '${review.rawScore!.round()}',
                  'max': '${review.sumMarks.round()}',
                },
              ),
              style: type.numeric(color: c.fgMuted, size: 13),
            ),
          // Only the PASS verdict is spelled out. «محتاجة مراجعة» in red is a
          // label on the student rather than information for them — the score
          // is already on the line above.
          if (review.passed == true)
            Text(
              tr(CopyKeys.quizPassed),
              style: type.bodySm(color: c.ok, weight: AppTextStyle.medium),
            ),
        ],
      ),
    );
  }
}

class _ReviewError extends StatelessWidget {
  const _ReviewError({required this.failure});

  final Failure failure;

  @override
  Widget build(BuildContext context) {
    return AppErrorView(
      failure: failure,
      onRetry: context.read<ReviewCubit>().load,
    );
  }
}
