import { z } from '@ayman/contracts/zod';

/**
 * «تصحيح الواجب» as a CARD in the student's chat thread.
 *
 * «عاوز لما نرد على الواجب يبقى الشخص عارف غلط في إيه والتحسين إيه، ويبقى في
 * الشات، ولما يضغط عليها يشوف فاهمين الغلطات.»
 *
 * ## The words stay on `body`; the card is only what frames them
 *
 * A review already lands in the thread as an ordinary admin message whose body
 * is the reviewer's note (`HomeworkService.review`). The card does not replace
 * that text, it hangs a small typed payload off the SAME row
 * (`conversation_messages.card`). Everything that already reads `body` keeps
 * working with no change: the inbox preview, a reply's quote, an edit of the
 * words, a client that predates the card. A card that kept its own copy of the
 * note would be a second place for the feedback to drift from the first.
 *
 * ## Stored ids, resolved titles
 *
 * The stored payload (`MessageCardPayloadSchema`) holds ids plus the VERDICT
 * and the MARK as they were when he pressed the button. Those two are snapshots
 * on purpose: the submission row moves on (a returned answer is resubmitted
 * and goes back to `submitted`), and a card that re-read it would turn
 * yesterday's «فيه ملاحظات» into «مستني التصحيح». The lesson's title and the
 * course's slug are resolved when the thread is read, like every slug in the
 * notification feed, so a renamed lecture is not linked under its old name.
 *
 * `kind` is a discriminator so the essay-exam feedback can be a second card on
 * the same column later without a migration.
 */
export const HOMEWORK_REVIEW_CARD = 'homework_review' as const;

export const HomeworkReviewCardPayloadSchema = z.object({
  kind: z.literal(HOMEWORK_REVIEW_CARD),
  submissionId: z.uuid(),
  /**
   * Which hand-in this verdict was on. One row per student per lecture, so a
   * resubmission is the SAME `submissionId` with the next attempt — and a
   * fresh verdict on it is a fresh card, while a second verdict on the same
   * attempt (a corrected mark) rewrites the card already in the thread.
   */
  attempt: z.number().int().min(1),
  lessonId: z.uuid(),
  verdict: z.enum(['accepted', 'needs_work']),
  grade: z.number().min(0).max(100).nullable(),
});
export type HomeworkReviewCardPayload = z.infer<typeof HomeworkReviewCardPayloadSchema>;

/** What `conversation_messages.card` may hold. One kind today. */
export const MessageCardPayloadSchema = z.discriminatedUnion('kind', [HomeworkReviewCardPayloadSchema]);
export type MessageCardPayload = z.infer<typeof MessageCardPayloadSchema>;

/**
 * The card as a THREAD renders it.
 *
 * `null` on the message when the row has no card, when the stored payload no
 * longer parses, when the lecture it points at is gone, or when the feature is
 * closed on this stack — and every one of those falls back to the plain
 * bubble, which still carries the note.
 */
export const HomeworkFeedbackCardSchema = z.object({
  submissionId: z.uuid(),
  lessonId: z.uuid(),
  lessonTitle: z.string(),
  /** The lecture's own address is `/courses/:slug/lessons/:id`. */
  courseSlug: z.string(),
  verdict: z.enum(['accepted', 'needs_work']),
  /** `null` for «مقبول من غير درجة», which is the ordinary case. */
  grade: z.number().min(0).max(100).nullable(),
  attempt: z.number().int().min(1),
});
export type HomeworkFeedbackCard = z.infer<typeof HomeworkFeedbackCardSchema>;

/**
 * Where the card goes: the lecture, scrolled to its homework panel.
 *
 * The panel is the first tab whenever a lecture has homework, so it is open on
 * arrival, and `#homework` is its `id` (`lesson-homework.tsx`). That is where
 * the full note, the mark and the photographs (while they are kept) are.
 */
export function homeworkCardHref(card: Pick<HomeworkFeedbackCard, 'courseSlug' | 'lessonId'>): string {
  return `/courses/${encodeURIComponent(card.courseSlug)}/lessons/${card.lessonId}#homework`;
}

/* ── reading the note ───────────────────────────────────────────────── */

/**
 * The reviewer's note, sorted into what was right and what to improve.
 *
 * The house format — the one «صحح» writes and the one he types — marks each
 * point with an emoji at the start of its line: «✅ …» for something done
 * well, «✏️ …» for something to fix. Anything else is said in his own words
 * and is kept, in order, as `lead` (the opening line, usually) and `tail`.
 *
 * `structured` is false when no line carries a mark, and then the card shows
 * the note exactly as written. Nothing is ever dropped: every non-empty line of
 * the input is in exactly one of the four lists.
 */
export interface ReviewNoteParts {
  structured: boolean;
  lead: string[];
  good: string[];
  improve: string[];
  tail: string[];
}

/*
 * The marks, and the near-misses a phone keyboard produces for them: ✏ with
 * and without the emoji selector (U+FE0F), ✔/☑ for the tick, and 📝 which is
 * what half of people reach for when they mean «اكتبها تاني».
 */
const GOOD_MARK = /^\s*(?:✅|✔️?|☑️?|👍)\s*/u;
const IMPROVE_MARK = /^\s*(?:✏️?|📝|⚠️?|❌)\s*/u;
/** A bullet the reviewer typed in front of the mark, or instead of nothing. */
const BULLET = /^\s*(?:[-•*·]|\d+[.)]|[٠-٩]+[.)])\s*/u;

export function splitReviewNote(note: string): ReviewNoteParts {
  const parts: ReviewNoteParts = { structured: false, lead: [], good: [], improve: [], tail: [] };

  for (const raw of note.split('\n')) {
    const line = raw.trim();
    if (line.length === 0) continue;
    const unbulleted = line.replace(BULLET, '');

    if (GOOD_MARK.test(unbulleted)) {
      const text = unbulleted.replace(GOOD_MARK, '').trim();
      if (text.length > 0) parts.good.push(text);
      parts.structured = true;
    } else if (IMPROVE_MARK.test(unbulleted)) {
      const text = unbulleted.replace(IMPROVE_MARK, '').trim();
      if (text.length > 0) parts.improve.push(text);
      parts.structured = true;
    } else if (parts.structured) {
      parts.tail.push(line);
    } else {
      parts.lead.push(line);
    }
  }

  return parts;
}
