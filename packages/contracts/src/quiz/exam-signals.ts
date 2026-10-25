import { z } from '@ayman/contracts/zod';

/**
 * «لما حد يعمل كوبي بيست أعرف… لو طلع برا الصفحة أو برا الويبسايت» — what the
 * exam runner notices while a monthly or course exam is open, and what the
 * marking screen shows of it.
 *
 * ## Evidence for a human, never a verdict
 *
 * Nothing here changes a mark, blocks an answer or tells the student anything.
 * The runner records quietly and the instructor reads it beside the paper.
 * A phone notification pulls a tab into the background exactly the way
 * switching to a chatbot does, so the screen reports what happened and how
 * long it lasted, and the instructor decides what that means.
 *
 * ## Exams only, his stack only
 *
 * The server decides both (`ExamSignalsService.watches`) and tells the runner
 * through `StartedAttempt.signals`. A lecture quiz and every other teacher's
 * stack never send a byte.
 */
export const EXAM_SIGNAL_TYPES = [
  /** Text pasted into the page. The common case is an AI answer pasted into
   *  an essay box. */
  'paste',
  /** Text copied or cut out of the page, usually a question stem headed for
   *  a chatbot. */
  'copy',
  /** The tab went into the background: another tab, another app, or a
   *  locked phone. */
  'hidden',
  /** Back on the tab. Carries `awayMs`. */
  'visible',
  /** The window lost focus while the page stayed on screen, for example a
   *  split screen or a second window beside the exam. */
  'blur',
  /** Focus came back after a `blur`. Carries `awayMs`. */
  'focus',
  /** The page itself went away: tab closed, reload, typed another address. */
  'pagehide',
  /** Navigated somewhere else inside the site without handing the paper in. */
  'left',
  /** The paper was opened, again. More than one is a reload or a second
   *  device. */
  'opened',
] as const;
export type ExamSignalType = (typeof EXAM_SIGNAL_TYPES)[number];

/** Long enough to recognise a pasted paragraph; short enough that one row
 *  cannot carry a whole essay a second time. */
export const EXAM_SIGNAL_TEXT_MAX = 500;

export const ExamSignalSchema = z
  .object({
    type: z.enum(EXAM_SIGNAL_TYPES),
    /** The student's clock. The server stamps its own `createdAt` beside it;
     *  this one keeps the ORDER right when a batch arrives late. */
    at: z.iso.datetime(),
    /** The question on screen when it happened. */
    slot: z.number().int().min(0).max(1_000).optional(),
    chars: z.number().int().min(0).max(1_000_000).optional(),
    text: z.string().max(EXAM_SIGNAL_TEXT_MAX).optional(),
    awayMs: z.number().int().min(0).max(86_400_000).optional(),
  })
  .strict();
export type ExamSignal = z.infer<typeof ExamSignalSchema>;

export const ExamSignalsBodySchema = z
  .object({ signals: z.array(ExamSignalSchema).min(1).max(50) })
  .strict();
export type ExamSignalsBody = z.infer<typeof ExamSignalsBodySchema>;

export const ExamSignalsResultSchema = z.object({ recorded: z.number().int().min(0) });

/** One row of the marking screen's timeline. `questionNumber` is 1-based, the
 *  number the paper printed. */
export const AdminExamSignalSchema = z.object({
  type: z.enum(EXAM_SIGNAL_TYPES),
  at: z.iso.datetime(),
  questionNumber: z.number().int().positive().nullable(),
  chars: z.number().int().nullable(),
  text: z.string().nullable(),
  awayMs: z.number().int().nullable(),
});
export type AdminExamSignal = z.infer<typeof AdminExamSignalSchema>;

export const AdminExamSignalsSchema = z.object({
  pastes: z.number().int().min(0),
  copies: z.number().int().min(0),
  /** Tab hidden, window blurred, page left: every way of not looking at the
   *  paper, counted once each. */
  leaves: z.number().int().min(0),
  /** Total time away that came back with a measured duration. A leave the
   *  student never returned from has no duration to add. */
  awayMs: z.number().int().min(0),
  opens: z.number().int().min(0),
  events: z.array(AdminExamSignalSchema),
});
export type AdminExamSignals = z.infer<typeof AdminExamSignalsSchema>;

const LEAVE_TYPES: ReadonlySet<ExamSignalType> = new Set(['hidden', 'blur', 'pagehide', 'left']);

/**
 * The counts at the top of the panel, from the timeline under them. Pure, so
 * the number the instructor reads is provably the rows he can scroll.
 */
export function summariseExamSignals(events: readonly AdminExamSignal[]): AdminExamSignals {
  let pastes = 0;
  let copies = 0;
  let leaves = 0;
  let awayMs = 0;
  let opens = 0;
  for (const event of events) {
    if (event.type === 'paste') pastes += 1;
    else if (event.type === 'copy') copies += 1;
    else if (event.type === 'opened') opens += 1;
    else if (LEAVE_TYPES.has(event.type)) leaves += 1;
    if ((event.type === 'visible' || event.type === 'focus') && event.awayMs) awayMs += event.awayMs;
  }
  return { pastes, copies, leaves, awayMs, opens, events: [...events] };
}
