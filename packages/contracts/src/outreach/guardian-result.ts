import { formatCopy } from '@ayman/contracts/format';
import type { QuizResultRecipient } from '@ayman/contracts/admin/settings';
import {
  GUARDIAN_RESULT_CLOSERS,
  GUARDIAN_RESULT_GREETINGS,
  GUARDIAN_RESULT_INTROS,
  GUARDIAN_RESULT_SCORE_LINES,
} from '@ayman/contracts/copy/outreach-guardian';
import { bandFor, firstNameOf } from '@ayman/contracts/outreach/compose';

/**
 * «نتيجة الامتحان لولي الأمر» — the two decisions about it that need no
 * database, as pure functions, so both API sweepers ask the SAME question and
 * cannot disagree about who was told.
 *
 * The student's chat message is written by `OutreachSweeper.sendResults`; the
 * guardian's WhatsApp by `GuardianResultSweeper`. They run apart (one has no
 * device, the other must hold the sender lock), so the only thing keeping
 * them consistent is that both route through `resultRoute`.
 */

export interface ResultRoute {
  /** The student's own chat message. */
  student: boolean;
  /** The WhatsApp to the guardian's number. */
  guardian: boolean;
}

/**
 * Who hears about one graded paper.
 *
 * `guardianChannel` — the stack can send WhatsApp at all (`outreach.whatsapp`
 * and `marketing.whatsapp`). Without it the setting is read as `student`, so a
 * stored `guardian` on a stack with no device can never mean «nobody».
 *
 * `guardianPhone` — the guardian's number already normalised to E.164, or
 * `null` when there is none or it is not a valid Egyptian number. In
 * `guardian` mode a student with no reachable guardian falls back to their
 * own message: the admin chose WHO should be told, not that some students
 * should be told nothing.
 *
 * What it cannot know: an opted-out or not-on-WhatsApp number is discovered at
 * the send, by a different sweeper, minutes later. In `guardian` mode that
 * paper reaches nobody — logged on the ledger row with the reason.
 */
export function resultRoute(input: {
  setting: QuizResultRecipient;
  guardianChannel: boolean;
  guardianPhone: string | null;
}): ResultRoute {
  const recipient: QuizResultRecipient = input.guardianChannel ? input.setting : 'student';
  const reachable = input.guardianPhone !== null;
  return {
    guardian: recipient !== 'student' && reachable,
    student: recipient !== 'guardian' || !reachable,
  };
}

export interface GuardianResultInput {
  /** The account name; only the first name is printed. */
  studentName: string;
  /** `tenantName(OUTREACH_SIGNATURE)` — resolved by the API, never here. */
  instructorName: string;
  quizTitle: string;
  /** 0–100, already rounded. */
  scorePercent: number;
  /** Stable per paper, so a retry composes the identical body. */
  seed: string;
}

/**
 * The body. Plain text, `\n`-separated, the way WhatsApp renders it.
 *
 * Variety comes from the seed alone, with no history: a guardian hears about
 * a paper every week or two, not four times an evening, and this message has
 * no ledger of variant keys to read (see `GuardianResultMessage`).
 */
export function composeGuardianResult(input: GuardianResultInput): string {
  const pick = <T>(slot: string, pool: readonly T[]): T =>
    pool[hash(`${input.seed}:${slot}`) % pool.length]!;
  const band = bandFor(input.scorePercent);
  const vars = {
    instructor: input.instructorName,
    // Falls back to nothing rather than a placeholder word: «نتيجة  في …» is a
    // typo a parent forgives; «نتيجة الطالب» from his teacher is not.
    name: firstNameOf(input.studentName),
    quiz: input.quizTitle,
    score: input.scorePercent,
  };

  return [
    [pick('g', GUARDIAN_RESULT_GREETINGS), formatCopy(pick('i', GUARDIAN_RESULT_INTROS), vars)].join('\n'),
    formatCopy(pick(`s.${band}`, GUARDIAN_RESULT_SCORE_LINES[band]), vars),
    formatCopy(pick('c', GUARDIAN_RESULT_CLOSERS), vars),
  ].join('\n\n');
}

/** FNV-1a, 32-bit — the same choice `compose.ts` makes, for the same reasons. */
function hash(input: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}
