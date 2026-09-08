import 'dart:async';

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../core/data/exception/failure.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/extensions/navigation_extension.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/feedback/app_error_view.dart';
import '../../../../core/presentation/widgets/feedback/app_snack.dart';
import '../../../../core/presentation/widgets/media/app_rich_text.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/services/media/gated_file_service.dart';
import '../../../../core/services/media/image_pick_service.dart';
import '../../../../core/services/player/heartbeat_engine.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_style.dart';
import '../../data/datasources/player_remote_data_source.dart';
import '../../domain/entities/lesson_player.dart';
import '../../domain/repositories/player_repository.dart';
import '../cubit/player_cubit.dart';
import '../widgets/lesson_completion_hint.dart';
import '../widgets/lesson_homework_card.dart';
import '../widgets/lesson_materials.dart';
import '../widgets/lesson_nav.dart';
import '../widgets/lesson_quiz_card.dart';
import '../widgets/lesson_video.dart';

/// One lesson: the video (or the reading), what it asks of the student, and
/// the way out of it.
///
/// ⚠️ Rendered on the ROOT navigator, outside the tab shell. It needs the full
/// height for a 16/9 video and its own chrome, and inside the shell it would
/// sit under the top bar and above the tab bar with a letterbox left over.
class LessonPage extends StatelessWidget {
  const LessonPage({required this.slug, required this.lessonId, super.key});

  final String slug;
  final String lessonId;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      // Keyed on the lesson: moving to the next one must build a NEW cubit,
      // not reuse the previous lesson's progress and heartbeat.
      key: ValueKey(lessonId),
      create: (_) => PlayerCubit(sl<PlayerRepository>(), lessonId)..load(),
      child: _LessonView(slug: slug, lessonId: lessonId),
    );
  }
}

class _LessonView extends StatefulWidget {
  const _LessonView({required this.slug, required this.lessonId});

  final String slug;
  final String lessonId;

  @override
  State<_LessonView> createState() => _LessonViewState();
}

class _LessonViewState extends State<_LessonView> {
  HeartbeatEngine? _engine;

  /// ⚠️ LOCAL, and disposed with this route. The picker holds a platform
  /// channel; one shared instance keeps it open for the app's lifetime.
  final _picker = ImagePickService();

  /// Pages picked for الواجب but not yet handed in.
  final _staged = <PickedImage>[];
  bool _homeworkBusy = false;
  String? _homeworkError;

  int? _youtubeErrorCode;

  @override
  void dispose() {
    // ⚠️ AWAITED nowhere, but started before the route goes: seconds counted
    // and never flushed are seconds the student watched without credit, and
    // they are most likely to be lost at exactly the moment a lesson ends.
    unawaited(_engine?.stop());
    super.dispose();
  }

  /// The video is ready and reporting. One engine, whichever source won.
  void _attachSource(PlaybackSource source) {
    _engine?.stop();
    final cubit = context.read<PlayerCubit>();
    _engine = HeartbeatEngine(
      source: source,
      onFlush: (position, delta) =>
          cubit.onHeartbeat(position: position, delta: delta),
    )..start();
  }

  Future<void> _openLesson(String lessonId) async {
    // `pushReplacement`, not push: walking a course must not build a stack
    // forty lessons deep that the back gesture then has to unwind one lecture
    // at a time.
    context.pushReplacement(AppRoutes.lessonOf(widget.slug, lessonId));
  }

  Future<void> _complete(PlayerReady state) async {
    final done = await context.read<PlayerCubit>().complete();
    if (!mounted || !done) return;

    // ⚠️ ONLY on success. Advancing after a failed write is what makes the
    // gap invisible: the student ends up further along with a hole they find
    // weeks later when the course will not reach 100%.
    final next = state.player.next;
    if (next != null) await _openLesson(next.id);
  }

  Future<void> _openFile(PlayerResource resource) async {
    final path = resource.downloadPath ?? resource.viewPath;
    if (path == null) return;

    final result = await sl<GatedFileService>().openInSystem(
      path: path,
      suggestedName: resource.title,
      mime: resource.mime,
    );
    if (!mounted) return;
    result.fold(
      (failure) => AppSnack.show(
        context,
        failure.message,
        tone: AppSnackTone.err,
      ),
      (_) {},
    );
  }

  Future<void> _pickHomeworkPage(PlayerHomework homework) async {
    if (_staged.length >= homework.maxImages) {
      setState(() => _homeworkError = tr(
            CopyKeys.homeworkTooMany,
            namedArgs: {'max': '${homework.maxImages}'},
          ));
      return;
    }

    final result = await _picker.pick(ImageSource.camera);
    if (!mounted) return;
    result.fold(
      (failure) => setState(() => _homeworkError = failure.message),
      (image) {
        if (image == null) return;
        setState(() {
          _staged.add(image);
          _homeworkError = null;
        });
      },
    );
  }

  /// Uploads every staged page, then files them as one submission.
  Future<void> _submitHomework() async {
    if (_staged.isEmpty) {
      setState(() => _homeworkError = tr(CopyKeys.homeworkEmpty));
      return;
    }

    setState(() {
      _homeworkBusy = true;
      _homeworkError = null;
    });

    final repository = sl<PlayerRepository>();
    final uploaded = <HomeworkImageUpload>[];

    for (final page in _staged) {
      final result = await repository.uploadHomeworkImage(
        widget.lessonId,
        filePath: page.path,
        filename: page.filename,
        contentType: page.contentType,
      );
      if (!mounted) return;

      final failed = result.fold((failure) => failure, (_) => null);
      if (failed != null) {
        setState(() {
          _homeworkBusy = false;
          // The API's own words when it has any — «الصورة كبيرة أوي» tells the
          // student what to do; a generic «مقدرناش نرفع» does not.
          _homeworkError = failed.message;
        });
        return;
      }
      uploaded.add(result.getOrElse(() => throw StateError('unreachable')));
    }

    final submitted = await repository.submitHomework(
      widget.lessonId,
      images: uploaded,
    );
    if (!mounted) return;

    submitted.fold(
      (failure) => setState(() {
        _homeworkBusy = false;
        _homeworkError = failure.message;
      }),
      (submission) {
        context.read<PlayerCubit>().onHomeworkSubmitted(submission);
        setState(() {
          _homeworkBusy = false;
          _staged.clear();
        });
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);

    return Scaffold(
      backgroundColor: c.surface1,
      body: BlocConsumer<PlayerCubit, PlayerState>(
        listenWhen: (before, after) =>
            after is PlayerReady && after.justCompleted,
        listener: (context, state) {
          // The one moment worth interrupting for: the server just decided
          // this lesson is done.
          AppSnack.show(
            context,
            tr(CopyKeys.playerCompleted),
            tone: AppSnackTone.ok,
          );
        },
        builder: (context, state) => switch (state) {
          PlayerLoading() => const Center(child: CircularProgressIndicator()),
          PlayerFailed(:final failure) => _LessonError(failure: failure),
          PlayerReady() => _buildReady(context, state),
        },
      ),
    );
  }

  Widget _buildReady(BuildContext context, PlayerReady state) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final player = state.player;
    final lesson = player.lesson;
    final cubit = context.read<PlayerCubit>();

    return SafeArea(
      child: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: Row(
              children: [
                IconButton(
                  onPressed: () => context.canPop()
                      ? context.pop()
                      : context.open(AppRoutes.courseDetailOf(widget.slug)),
                  tooltip: tr(CopyKeys.courseBack),
                  // Mirrors itself in RTL — see the note in `AppScreen`.
                  icon: const Icon(Icons.arrow_back),
                ),
              ],
            ),
          ),

          // ⚠️ The video is the FIRST pixel of content. The title used to sit
          // above it with ~120pt of chrome, which on a phone is most of the
          // first screen.
          if (lesson.isVideo)
            SliverToBoxAdapter(
              child: LessonVideo(
                video: player.video,
                activated: state.activated,
                mirrorFailed: state.mirrorFailed,
                startSeconds: state.startSeconds,
                youtubeErrorCode: _youtubeErrorCode,
                onPlay: cubit.onActivated,
                onRestart: cubit.onRestart,
                onSource: _attachSource,
                onMirrorFailed: cubit.onMirrorFailed,
                onYoutubeError: (code) =>
                    setState(() => _youtubeErrorCode = code),
              ),
            ),

          SliverPadding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenInset,
              AppSpacing.x16,
              AppSpacing.screenInset,
              AppSpacing.x80,
            ),
            sliver: SliverList.list(
              children: [
                Text(lesson.title, style: type.title2Style(color: c.fg)),
                const SizedBox(height: AppSpacing.x4),
                Text(
                  '${lesson.courseTitle} · ${lesson.sectionTitle}',
                  style: type.numeric(color: c.fgMuted, size: 12),
                ),
                const SizedBox(height: AppSpacing.sectionGap),

                if (lesson.kind == 'text' && player.textHtml != null) ...[
                  AppRichText(html: player.textHtml!),
                  const SizedBox(height: AppSpacing.sectionGap),
                ],

                if (player.homework != null) ...[
                  LessonHomeworkCard(
                    homework: player.homework!,
                    staged: _staged,
                    busy: _homeworkBusy,
                    error: _homeworkError,
                    onPick: () => _pickHomeworkPage(player.homework!),
                    onRemove: (image) => setState(() => _staged.remove(image)),
                    onSubmit: _submitHomework,
                  ),
                  const SizedBox(height: AppSpacing.sectionGap),
                ],

                // The lesson IS a quiz, or one hangs off it. Both open the
                // same runner; only the words differ.
                if (player.quizId != null || lesson.isQuiz) ...[
                  LessonQuizCard(
                    progress: state.progress,
                    isExamLesson: lesson.isQuiz,
                    onOpen: () => context.open(AppRoutes.quizOf(lesson.id)),
                  ),
                  const SizedBox(height: AppSpacing.sectionGap),
                ],

                if (lesson.kind != 'attachment' && player.resources.isNotEmpty) ...[
                  LessonMaterials(
                    resources: player.resources,
                    onOpenFile: _openFile,
                  ),
                  const SizedBox(height: AppSpacing.sectionGap),
                ]
                // An ATTACHMENT lesson IS its materials — no disclosure, and
                // the dwell timer completes it.
                else if (lesson.kind == 'attachment') ...[
                  for (final resource in player.resources) ...[
                    LessonResourceRow(
                      resource: resource,
                      onOpenFile: _openFile,
                    ),
                    const SizedBox(height: AppSpacing.x8),
                  ],
                  const SizedBox(height: AppSpacing.x16),
                ],

                LessonCompletionHint(
                  isQuiz: lesson.isQuiz,
                  autoCompleteAvailable: player.autoCompleteAvailable,
                ),
                if (state.saveFailed) ...[
                  const SizedBox(height: AppSpacing.x8),
                  Semantics(
                    liveRegion: true,
                    child: Text(
                      tr(CopyKeys.playerSaveFailed),
                      style: type.bodySm(color: c.warn),
                    ),
                  ),
                ],
                const SizedBox(height: AppSpacing.sectionGap),

                LessonNav(
                  player: player,
                  isComplete: state.progress.isComplete,
                  completing: state.completing,
                  completeFailed: state.completeFailed,
                  onComplete: () => _complete(state),
                  onOpenNeighbour: (neighbour) => _openLesson(neighbour.id),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// The lesson could not be opened.
///
/// ⚠️ A 404 here is «no such lesson» OR «not yours» OR «the gate has not
/// opened it», deliberately indistinguishable. The way out is the course page,
/// which renders the same outline WITH the gate states and can explain it.
class _LessonError extends StatelessWidget {
  const _LessonError({required this.failure});

  final Failure failure;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.screenInset),
        child: AppErrorView(
          failure: failure,
          onRetry: context.read<PlayerCubit>().load,
        ),
      ),
    );
  }
}
