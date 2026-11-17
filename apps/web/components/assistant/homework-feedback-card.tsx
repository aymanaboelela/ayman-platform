import { ArrowLeft, CircleCheck, ClipboardCheck, ClipboardPen, PencilLine } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy, formatMark } from '@ayman/contracts/format';
import {
  homeworkCardHref,
  splitReviewNote,
  type HomeworkFeedbackCard as Card,
} from '@ayman/contracts/assistant/homework-card';
import { cn } from '@ayman/ui/lib/cn';

const c = copy.assistant.thread.homeworkCard;

/**
 * «تصحيح الواجب» — a homework review, drawn as a card in the student's thread.
 *
 * «عاوز لما نرد على الواجب يبقى الشخص عارف غلط في إيه والتحسين إيه، ويبقى في
 * الشات، ولما يضغط عليها يشوف فاهمين الغلطات.»
 *
 * Three objects, top to bottom, so a glance answers the three questions in the
 * order a student asks them: a coloured band (WHICH homework, and did it pass
 * — green for «مقبول», amber for «فيه ملاحظات», with the mark on a chip), the
 * note sorted into «نقط القوة» and «نقط للتحسين» when the reviewer marked his
 * lines with ✅ / ✏️ (as written when he did not), and one amber button into
 * the lecture's homework panel, where the photographs and the full verdict
 * are. He reads a plain bordered bubble as unfinished (memory: ayman-ui-taste),
 * so colour carries the meaning here rather than decorating it.
 *
 * ## The whole card is the link
 *
 * «ولما يضغط عليها» — a tap anywhere lands on the homework, not only on the
 * button. That is also why the note is plain TEXT here rather than
 * `MessageBody`: a link inside the card would be an anchor inside an anchor.
 * It is a real `<a>`, not a soft navigation, for the reason `CourseCard` gives
 * — this renders inside المساعد's overlay with its scroll lock.
 *
 * Colours are tokens (`chat.css`, `.chat-hw*`): unlike the WhatsApp and course
 * cards, this one sits in HIS bubble — paper, on the theme — never in the
 * student's own accent-coloured one.
 */
export function HomeworkFeedbackCard({ card, note }: { card: Card; note: string }) {
  const accepted = card.verdict === 'accepted';
  const parts = splitReviewNote(note);
  const VerdictIcon = accepted ? ClipboardCheck : ClipboardPen;

  return (
    <a
      href={homeworkCardHref(card)}
      className={cn('chat-hw', accepted ? 'chat-hw--accepted' : 'chat-hw--needs-work')}
    >
      <span className="chat-hw__band">
        <span className="chat-hw__disc" aria-hidden="true">
          <VerdictIcon className="size-5" />
        </span>
        <span className="chat-hw__head">
          <span className="chat-hw__eyebrow">{c.eyebrow}</span>
          <span className="chat-hw__title">{card.lessonTitle}</span>
          <span className="chat-hw__chips">
            <span className="chat-hw__chip chat-hw__chip--verdict">
              {accepted ? c.accepted : c.needsWork}
            </span>
            {card.grade !== null ? (
              <span className="chat-hw__chip chat-hw__chip--grade">
                {formatCopy(c.grade, { grade: formatMark(card.grade) })}
              </span>
            ) : null}
            {card.attempt > 1 ? (
              <span className="chat-hw__chip">{formatCopy(c.attempt, { n: card.attempt })}</span>
            ) : null}
          </span>
        </span>
      </span>

      <span className="chat-hw__body bidi-auto">
        {parts.structured ? (
          <>
            {parts.lead.map((line, index) => (
              <span key={`lead-${index}`} className="chat-hw__line">
                {line}
              </span>
            ))}
            {parts.good.length > 0 ? (
              <Section tone="good" heading={c.good} items={parts.good} />
            ) : null}
            {parts.improve.length > 0 ? (
              <Section tone="improve" heading={c.improve} items={parts.improve} />
            ) : null}
            {parts.tail.map((line, index) => (
              <span key={`tail-${index}`} className="chat-hw__line">
                {line}
              </span>
            ))}
          </>
        ) : (
          /* No marks — the note exactly as he wrote it, under a plain heading. */
          <>
            <span className="chat-hw__heading">{c.note}</span>
            <span className="chat-hw__note">{note.trim()}</span>
          </>
        )}
      </span>

      {/* A `<span>`: the card is already the anchor — see above. */}
      <span className="chat-hw__action">
        {c.action}
        <ArrowLeft className="size-4" aria-hidden="true" />
      </span>
    </a>
  );
}

function Section({
  tone,
  heading,
  items,
}: {
  tone: 'good' | 'improve';
  heading: string;
  items: readonly string[];
}) {
  const Icon = tone === 'good' ? CircleCheck : PencilLine;
  return (
    <span className={cn('chat-hw__section', `chat-hw__section--${tone}`)}>
      <span className="chat-hw__heading">
        <Icon className="size-4" aria-hidden="true" />
        {heading}
      </span>
      {/* A real list for a screen reader, inside an anchor: `role` on spans,
          because `<ul>` is not phrasing content and an `<a>` inside a `<p>`-
          less bubble still has to be valid where it is placed. */}
      <span role="list" className="chat-hw__list">
        {items.map((item, index) => (
          <span key={index} role="listitem" className="chat-hw__item">
            {item}
          </span>
        ))}
      </span>
    </span>
  );
}
