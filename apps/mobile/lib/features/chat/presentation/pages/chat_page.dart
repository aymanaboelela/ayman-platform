import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/di/injection_container.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/feedback/app_error_view.dart';
import '../../../../core/presentation/widgets/feedback/app_snack.dart';
import '../../../../core/services/media/image_pick_service.dart';
import '../../../../core/services/voice/voice_recorder_service.dart';
import '../../../../core/theme/app_colors.dart';
import '../../domain/repositories/chat_repository.dart';
import '../cubit/chat_cubit.dart';
import '../widgets/chat_composer.dart';
import '../widgets/chat_empty_state.dart';
import '../widgets/chat_message_list.dart';
import '../widgets/chat_status_banner.dart';

/// «محادثتك مع مهندس أيمن».
///
/// A full screen, not the docked panel the web uses. A panel is the right
/// shape beside a 1440px page and the wrong one on a phone: a chat with a
/// keyboard, a voice recorder and image previews needs the whole viewport and
/// its own back stack.
class ChatPage extends StatelessWidget {
  const ChatPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => ChatCubit(
        repository: sl<ChatRepository>(),
        // Constructed per page, not registered as singletons: both hold
        // platform resources — a microphone session and a picker — and one
        // instance shared across the app would keep the mic indicator lit
        // after the screen is gone.
        recorder: VoiceRecorderService(),
        images: ImagePickService(),
      )..load(),
      child: const _ChatView(),
    );
  }
}

class _ChatView extends StatefulWidget {
  const _ChatView();

  @override
  State<_ChatView> createState() => _ChatViewState();
}

class _ChatViewState extends State<_ChatView> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    context.read<ChatCubit>().startPolling();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// ⚠️ Polling STOPS when the app is backgrounded and restarts on resume.
  ///
  /// Without this the timer keeps firing while the phone is in a pocket, which
  /// spends the student's rate-limit allowance on a screen nobody is looking
  /// at and drains the battery for nothing. A reply that lands while the app
  /// is closed arrives as a push notification instead.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final cubit = context.read<ChatCubit>();
    if (state == AppLifecycleState.resumed) {
      cubit.startPolling();
      cubit.refresh();
    } else {
      cubit.stopPolling();
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);

    return BlocConsumer<ChatCubit, ChatState>(
      listenWhen: (previous, current) =>
          previous.sendFailure != current.sendFailure && current.sendFailure != null,
      listener: (context, state) {
        // A SEND failure is a snack, not a screen: the thread is still
        // perfectly readable and only the last action did not land.
        AppSnack.show(context, state.sendFailure!.message, tone: AppSnackTone.err);
        context.read<ChatCubit>().dismissSendFailure();
      },
      builder: (context, state) {
        return Scaffold(
          backgroundColor: c.surface1,
          appBar: AppBar(
            title: Text(tr(CopyKeys.assistantThreadTitle)),
            // The chat is pushed onto the ROOT navigator, so there is a real
            // route underneath and a real back button. `AppBar` supplies it.
            leading: BackButton(onPressed: () => context.pop()),
          ),
          // The composer must ride above the keyboard; the message list
          // shrinks to make room.
          resizeToAvoidBottomInset: true,
          body: Column(
            children: [
              if (state.thread != null) ChatStatusBanner(status: state.thread!.status),
              Expanded(
                child: switch (state) {
                  ChatState(loading: true) => const Center(
                    child: CircularProgressIndicator(),
                  ),
                  ChatState(failure: final failure?) => AppErrorView(
                    failure: failure,
                    onRetry: context.read<ChatCubit>().load,
                  ),
                  ChatState(thread: null) => const ChatEmptyState(),
                  ChatState(thread: final thread?) => ChatMessageList(
                    messages: thread.messages,
                  ),
                },
              ),
              const ChatComposer(),
            ],
          ),
        );
      },
    );
  }
}
