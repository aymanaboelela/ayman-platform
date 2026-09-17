/**
 * The six reasons the platform speaks first.
 *
 * A leaf module of its own, imported by the composer, the wire schemas and the
 * API alike — the Prisma enum `outreach_kind` mirrors it value for value, and
 * `outreach.service.spec.ts` asserts the two agree, so adding a reason on one
 * side without the other is a failing test rather than a runtime insert error.
 *
 * Order matters only for the admin screen, which renders the kinds in it.
 *
 * ## Four are swept, two are pressed
 *
 * The first four are `OutreachSweeper`'s: nobody decides to send them, a cron
 * finds a fact that became true and writes about it. The last two are
 * `/admin/follow-up`'s, and they are the instructor pressing a button on a
 * named student — which is why neither has a settings toggle and neither is
 * ever sent by a timer. They still live in this list, and not on the
 * `sendManual` path the broadcast screen uses, for two reasons that only this
 * table provides: `dedupeKey` stops «ابعت للكل» pressed twice from writing the
 * same note twice, and `variantKey` stops forty students in one press from
 * reading the identical sentence.
 */
export const OUTREACH_KINDS = [
  /** A paper was graded. Names the topics to go back to. */
  'quiz_result',
  /** The lesson is finished and its quiz has never been opened. */
  'quiz_nudge',
  /** A lesson with no quiz was completed — the only message with nothing to ask for. */
  'lesson_praise',
  /** Join the WhatsApp group. Also rides along on the other three. */
  'whatsapp_invite',
  /**
   * «إزاي الأخبار؟» — the lectures and quizzes that went by untouched, named,
   * and one question. Sent by hand from `/admin/follow-up`.
   */
  'follow_up',
  /**
   * The student has an account and no seat in the course their own year and
   * stream point at. Carries the link to that course and nothing else.
   */
  'subscribe_nudge',
] as const;

export type OutreachKind = (typeof OUTREACH_KINDS)[number];

/**
 * The kinds a human presses, rather than the ones a cron finds.
 *
 * Read by `/admin/outreach`'s settings block, which must not offer a switch
 * for a message no sweeper will ever send — a toggle that turns nothing off is
 * worse than no toggle.
 */
export const MANUAL_OUTREACH_KINDS = ['follow_up', 'subscribe_nudge'] as const;

export function isOutreachKind(value: string): value is OutreachKind {
  return (OUTREACH_KINDS as readonly string[]).includes(value);
}
