import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MediaModule } from '../media/media.module';
import { CatalogModule } from '../catalog/catalog.module';
import { AssistantController } from './assistant.controller';
import { AdminInboxController } from './admin-inbox.controller';
import { AssistantService } from './assistant.service';
import { ConversationAttachmentService } from './conversation-attachment.service';
import { AssistantAskController } from './ai/assistant-ask.controller';
import { AssistantAiService } from './ai/assistant-ai.service';

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
 *
 * ## `./ai` — the typed question, and why it is a fourth thing
 *
 * `AssistantAiService` answers what the tree has no node for. It is a separate
 * provider rather than more methods on `AssistantService` for the same reason
 * the attachment layer is: `assistant.service.spec.ts` asserts that service
 * reaches exactly two Prisma delegates, and that assertion is the product's
 * strongest statement about what a stranger's question can touch. The AI side
 * needs the public catalog, so it takes `CatalogModule` — the same
 * already-public read the catalog PAGE performs, which returns published
 * courses and nothing else — and the two invariants stay separately checkable.
 */
@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule, MediaModule, CatalogModule],
  controllers: [AssistantController, AdminInboxController, AssistantAskController],
  providers: [AssistantService, ConversationAttachmentService, AssistantAiService],
})
export class AssistantModule {}
