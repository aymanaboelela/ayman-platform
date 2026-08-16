/**
 * The four reasons the platform speaks first.
 *
 * A leaf module of its own, imported by the composer, the wire schemas and the
 * API alike — the Prisma enum `outreach_kind` mirrors it value for value, and
 * `outreach.service.spec.ts` asserts the two agree, so adding a reason on one
 * side without the other is a failing test rather than a runtime insert error.
 *
 * Order matters only for the admin screen, which renders the kinds in it.
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
] as const;

export type OutreachKind = (typeof OUTREACH_KINDS)[number];

export function isOutreachKind(value: string): value is OutreachKind {
  return (OUTREACH_KINDS as readonly string[]).includes(value);
}
