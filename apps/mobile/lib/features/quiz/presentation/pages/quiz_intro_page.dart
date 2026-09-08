import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/data/exception/failure.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/buttons/app_button.dart';
import '../../../../core/presentation/widgets/feedback/app_error_view.dart';
import '../../../../core/presentation/widgets/layout/app_screen.dart';
import '../../../../core/presentation/widgets/surfaces/app_panel.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../domain/entities/quiz_overview.dart';
import '../../domain/repositories/quiz_repository.dart';
import '../cubit/quiz_intro_cubit.dart';
import '../widgets/attempt_history_list.dart';

/// The page between «دخول الامتحان» and the paper itself.
///
/// ## Why there is a page here at all
///
/// Starting an exam is not an act to perform by accident. This states the
/// length, the mark, and how many sittings are left BEFORE the clock starts —
/// and a running attempt is offered as «كمّل», never as a fresh start that
/// would consume a sitting the student already spent.
class QuizIntroPage extends StatelessWidget {
  const QuizIntroPage({required this.lessonId, super.key});

  final String lessonId;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => QuizIntroCubit(sl<QuizRepository>(), lessonId)..load(),
      child: const _QuizIntroView(),
    );
  }
}

class _QuizIntroView extends StatelessWidget {
  const _QuizIntroView();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<QuizIntroCubit, QuizIntroState>(
      builder: (context, state) {
        return AppScreen.slivers(
          title: tr(CopyKeys.libraryExam),
          onBack: () => context.canPop() ? context.pop() : context.go(AppRoutes.library),
          onRefresh: context.read<QuizIntroCubit>().load,
          slivers: switch (state) {
            QuizIntroLoading() => const [
                SliverToBoxAdapter(
                  child: Center(child: CircularProgressIndicator()),
                ),
              ],
            QuizIntroFailed(:final failure) => [
                SliverToBoxAdapter(child: _IntroError(failure: failure)),
              ],
            QuizIntroReady(:final overview) => _slivers(context, overview),
          },
        );
      },
    );
  }

  List<Widget> _slivers(BuildContext context, QuizOverview overview) {
    return [
      SliverToBoxAdapter(child: _QuizFacts(overview: overview)),
      const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.sectionGap)),
      SliverToBoxAdapter(child: _QuizAction(overview: overview)),
      if (overview.attempts.isNotEmpty) ...[
        const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.sectionGap)),
        SliverToBoxAdapter(
          child: AttemptHistoryList(attempts: overview.attempts),
        ),
      ],
    ];
  }
}

/// Length, marks, sittings — the three facts worth knowing beforehand.
class _QuizFacts extends StatelessWidget {
  const _QuizFacts({required this.overview});

  final QuizOverview overview;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return AppPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppSpacing.x8,
        children: [
          Text(
            tr(
              CopyKeys.quizTotalMarks,
              namedArgs: {'marks': '${overview.gradeOutOf.round()}'},
            ),
            style: type.title4Style(color: c.fg),
          ),
          Text(
            overview.durationSeconds == null
                // No duration means no deadline and no sweeper: the attempt
                // stays open until it is handed in.
                ? tr(CopyKeys.quizNoTimeLimit)
                : tr(
                    CopyKeys.quizDuration,
                    namedArgs: {
                      'minutes': '${(overview.durationSeconds! / 60).round()}',
                    },
                  ),
            style: type.bodySm(color: c.fgMuted),
          ),
          Text(
            overview.allowsImprovement
                ? tr(CopyKeys.quizTwoAttempts)
                : tr(CopyKeys.quizNoSittingsLeft),
            style: type.bodySm(color: c.fgMuted),
          ),
          if (overview.bestScore != null)
            Text(
              '${tr(CopyKeys.quizBestScore)} — ${overview.bestScore!.round()}٪',
              style: type.numeric(color: c.accentText, size: 14),
            ),
          Text(tr(CopyKeys.quizHint), style: type.bodyXs(color: c.fgMuted)),
        ],
      ),
    );
  }
}

/// The one control: start, resume, or the reason there is neither.
class _QuizAction extends StatelessWidget {
  const _QuizAction({required this.overview});

  final QuizOverview overview;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final running = overview.inProgressAttemptId;

    // ⚠️ A running attempt beats everything. The server forces `nextPaper` and
    // `blocked` to null when one exists, and offering «نبدأ» here would either
    // 409 or spend a sitting the student is already inside.
    if (running != null) {
      return AppButton(
        label: tr(CopyKeys.quizResume),
        icon: Icons.play_arrow_rounded,
        onPressed: () => context.push(
          AppRoutes.attemptOf(overview.lessonId, running),
        ),
      );
    }

    final blocked = overview.blocked;
    if (blocked != null) {
      return AppPanel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: AppSpacing.x8,
          children: [
            Text(
              tr(CopyKeys.quizBlockedTitle),
              style: type.title4Style(color: c.fg),
            ),
            Text(
              tr(switch (blocked.code) {
                'quiz_not_open_yet' => CopyKeys.quizNotOpenYet,
                'quiz_closed' => CopyKeys.quizClosed,
                _ => CopyKeys.quizNoAttemptsLeft,
              }),
              style: type.bodySm(color: c.fgMuted),
            ),
          ],
        ),
      );
    }

    // ⚠️ A paper with NO questions is not startable, and the server says so
    // with a 403 `quiz_has_no_questions`. Offering the button anyway is a
    // control that cannot succeed — the same shape of promise the empty
    // course card stopped making — and the student is left reading a generic
    // «حصلت مشكلة» about something they did nothing to cause.
    if (overview.questionCount == 0) {
      return AppPanel(
        child: Text(
          tr(CopyKeys.quizNotOpenYet),
          style: type.bodySm(color: c.fgMuted),
        ),
      );
    }

    if (!overview.canStart) {
      return Text(
        tr(CopyKeys.quizNoSittingsLeft),
        style: type.bodySm(color: c.fgMuted),
      );
    }

    return AppButton(
      // «امتحان التحسين» is a different act from a first sitting, and the
      // student is entitled to know which one they are about to spend.
      label: tr(
        overview.nextPaper == 'improvement'
            ? CopyKeys.quizImproveExam
            : CopyKeys.quizStart,
      ),
      icon: Icons.play_arrow_rounded,
      onPressed: () => context.push(
        AppRoutes.attemptOf(overview.lessonId, 'new'),
      ),
    );
  }
}

class _IntroError extends StatelessWidget {
  const _IntroError({required this.failure});

  final Failure failure;

  @override
  Widget build(BuildContext context) {
    return AppErrorView(
      failure: failure,
      onRetry: context.read<QuizIntroCubit>().load,
    );
  }
}
