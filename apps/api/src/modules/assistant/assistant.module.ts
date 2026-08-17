import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MediaModule } from '../media/media.module';
import { AssistantController } from './assistant.controller';
import { AdminInboxController } from './admin-inbox.controller';
import { AssistantService } from './assistant.service';
import { ConversationAttachmentService } from './conversation-attachment.service';

/**
 * المساعد — the guided assistant's conversations, and the inbox that answers
 * them.
 *
 * The question TREE is not here and never will be: it lives in
 * `@ayman/contracts/assistant/script` as data the web app walks locally. The
 * server is not consulted to answer "الكورس فيه إيه؟", which is why the
 * assistant stays responsive on a bad connection and why this module has no
 * read path into content at all.
 *
 * Depends on `NotificationsModule` for one reason — telling a signed-in
 * student their question was answered — and on `AuthModule` for the optional
 * session lookup its public routes need. Neither reaches back.
 *
 * `MediaModule` is the third, and it is imported for
 * `ConversationAttachmentService` alone: the two upload pipelines and the byte
 * store. `AssistantService` itself still reaches nothing but its two tables —
 * that separation is the reason the file layer is a second service rather than
 * three more methods on the first one.
 */
@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule, MediaModule],
  controllers: [AssistantController, AdminInboxController],
  providers: [AssistantService, ConversationAttachmentService],
})
export class AssistantModule {}
