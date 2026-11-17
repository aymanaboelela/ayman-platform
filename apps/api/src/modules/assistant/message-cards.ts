import {
  MessageCardPayloadSchema,
  type HomeworkFeedbackCard,
  type MessageCardPayload,
} from '@ayman/contracts/assistant/homework-card';
import { isFeatureEnabled } from '../../common/entitlements';
import type { PrismaService } from '../../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

/**
 * The cards in one page of a thread, keyed by message id.
 *
 * One query for the whole page, not one per card: the stored payload holds the
 * lesson's id, and its title and the course's slug are read here, at render
 * time, for the reason `homework-card.ts` gives. A message whose payload no
 * longer parses, or whose lecture is gone, is simply absent from the map — and
 * the caller then draws the plain bubble, which still carries every word.
 *
 * Gated on READ as well as on write: closing `homeworkChatCard` on a stack
 * takes the cards already in its threads back to plain bubbles, rather than
 * leaving a feature the owner switched off still drawing on every screen.
 */
export async function resolveMessageCards(
  prisma: PrismaService,
  messages: readonly { id: string; card: Prisma.JsonValue | null }[],
): Promise<Map<string, HomeworkFeedbackCard>> {
  const cards = new Map<string, HomeworkFeedbackCard>();
  if (!isFeatureEnabled('homeworkChatCard')) return cards;

  const parsed: { messageId: string; payload: MessageCardPayload }[] = [];
  for (const message of messages) {
    if (message.card === null) continue;
    const result = MessageCardPayloadSchema.safeParse(message.card);
    if (result.success) parsed.push({ messageId: message.id, payload: result.data });
  }
  if (parsed.length === 0) return cards;

  const lessons = await prisma.lesson.findMany({
    where: { id: { in: [...new Set(parsed.map((entry) => entry.payload.lessonId))] } },
    select: { id: true, title: true, course: { select: { slug: true } } },
  });
  const byId = new Map(lessons.map((lesson) => [lesson.id, lesson]));

  for (const { messageId, payload } of parsed) {
    const lesson = byId.get(payload.lessonId);
    if (!lesson) continue;
    cards.set(messageId, {
      submissionId: payload.submissionId,
      lessonId: payload.lessonId,
      lessonTitle: lesson.title,
      courseSlug: lesson.course.slug,
      verdict: payload.verdict,
      grade: payload.grade,
      attempt: payload.attempt,
    });
  }
  return cards;
}
