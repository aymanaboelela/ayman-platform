import 'package:flutter/material.dart';

import '../../../../core/config/app_environment.dart';
import '../../../../core/data/network/api_headers.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/presentation/widgets/media/app_image_viewer.dart';
import '../../../../core/presentation/widgets/media/authenticated_image.dart';
import '../../../../core/services/storage_service/secure_store.dart';
import '../../../../core/theme/app_radius.dart';
import '../../domain/entities/chat_attachment.dart';
import 'chat_document_card.dart';
import 'chat_voice_player.dart';

/// Renders whichever of the three kinds a message carries.
///
/// A switch rather than three call sites, because the bubble should not have
/// to know which kinds exist — and a kind added server-side falls back to the
/// document card rather than rendering nothing.
class ChatAttachmentView extends StatelessWidget {
  const ChatAttachmentView({required this.attachment, super.key});

  final ChatAttachment attachment;

  @override
  Widget build(BuildContext context) {
    return switch (attachment.kind) {
      ChatAttachmentKind.image => ChatImageAttachment(attachment: attachment),
      ChatAttachmentKind.voice => ChatVoicePlayer(attachment: attachment),
      ChatAttachmentKind.document => ChatDocumentCard(attachment: attachment),
    };
  }
}

/// A photo in a bubble. Tapping opens it full-screen.
class ChatImageAttachment extends StatelessWidget {
  const ChatImageAttachment({required this.attachment, super.key});

  final ChatAttachment attachment;

  @override
  Widget build(BuildContext context) {
    final store = sl<SecureStore>();

    return GestureDetector(
      onTap: () async {
        // The token is read at TAP time, not at build time: a thread that has
        // been open across a token refresh would otherwise open the viewer
        // with the stale one and show a 401.
        final token = await store.readSessionToken();
        if (!context.mounted) return;
        await AppImageViewer.show(
          context,
          imageUrl: '${AppEnvironment.apiOrigin}${attachment.path}',
          httpHeaders: {
            if (token != null && token.isNotEmpty)
              ApiHeaders.authorization: 'Bearer $token',
          },
          semanticLabel: attachment.filename,
        );
      },
      child: ConstrainedBox(
        // A tall portrait photo of a page is the common case; without a
        // ceiling one message fills the whole thread and the student loses
        // their place scrolling past it.
        constraints: const BoxConstraints(maxHeight: 320, minWidth: 200),
        child: AuthenticatedImage(
          path: attachment.path,
          store: store,
          borderRadius: AppRadius.mdAll,
        ),
      ),
    );
  }
}
