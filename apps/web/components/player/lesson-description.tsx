import { copy } from '@ayman/contracts/copy';

const c = copy.player;

/**
 * «ملخص الدرس» — the recap, as the body of its tab.
 *
 * ## The reading-order line stays, the lock does not
 *
 * This was a closed `<details>` under the video: «قوله متشوفش الوصف إلا لما
 * تشوف الدرس كله». That is about reading ORDER, not secrecy — a summary read
 * first is the answers read first. The tab row now does the folding (the
 * summary is never the tab open on arrival), so the panel keeps the sentence
 * that says when to read it and drops the second disclosure inside the first.
 *
 * It is deliberately NOT gated on `state === 'completed'`. Completion here is
 * a progress heuristic, and a student who watched the whole lecture on a
 * flaky connection can easily not be marked complete. Locking a paragraph
 * behind that would punish the wrong person for a telemetry gap.
 *
 * `whitespace-pre-wrap`: the column is plain text with the instructor's own
 * line breaks, and collapsing them turns a list of four points into one
 * paragraph.
 */
export function LessonDescription({ description }: { description: string | null }) {
  if (!description) return null;

  return (
    <div className="lp-summary">
      <p className="lp-summary__note">{c.descriptionWarning}</p>
      <p className="lp-summary__body">{description}</p>
    </div>
  );
}
