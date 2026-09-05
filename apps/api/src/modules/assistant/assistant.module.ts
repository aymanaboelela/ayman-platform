import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MediaModule } from '../media/media.module';
import { CatalogModule } from '../catalog/catalog.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { BooksModule } from '../books/books.module';
import { AssistantController } from './assistant.controller';
import { AdminInboxController } from './admin-inbox.controller';
import { AssistantService } from './assistant.service';
import { ConversationAttachmentService } from './conversation-attachment.service';
import { AssistantAskController } from './ai/assistant-ask.controller';
import { AssistantAiService } from './ai/assistant-ai.service';
import { AssistantStudentService } from './ai/assistant-student.service';
import { AssistantQuestionService } from './ai/assistant-question.service';
import { AssistantFactsService } from './ai/assistant-facts.service';
import { AdminAssistantQuestionsController } from './ai/admin-questions.controller';

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
 *
 * ## `BooksModule`, and why the assistant is allowed near money at all
 *
 * `AssistantFactsService` is the fifth thing, and it exists because «الكتاب
 * بكام؟» and «الاشتراك بكام؟» are the two questions المساعد used to refuse.
 * Refusing was right while the only way to answer was a number typed into a
 * prompt — that number outlives the admin form that set it. It is not right
 * now that the figures are read off `books` and `courses` at answer time.
 *
 * `BooksModule` is imported for ONE method, `BooksService.shippingCents()`,
 * which resolves the delivery fee out of `SiteSettings.store.shippingCents`
 * with its default. Reading that setting here instead would be a second copy
 * of the expression that prices a real basket, and the day the two drift is
 * the day المساعد quotes a delivery fee the checkout does not charge.
 *
 * The books it reads are the ACTIVE ones and the courses are the PUBLISHED
 * ones — the same rows the public shop and the public catalogue already serve
 * to anybody, so this adds no reach into anything private. Still no session,
 * still one student at a time, still nothing stored.
 */
@Module({
  imports: [
    PrismaModule,
    AuthModule,
    NotificationsModule,
    MediaModule,
    CatalogModule,
    DashboardModule,
    BooksModule,
  ],
  controllers: [
    AssistantController,
    AdminInboxController,
    AssistantAskController,
    AdminAssistantQuestionsController,
  ],
  providers: [
    AssistantService,
    ConversationAttachmentService,
    AssistantAiService,
    AssistantStudentService,
    AssistantQuestionService,
    AssistantFactsService,
  ],
})
export class AssistantModule {}
