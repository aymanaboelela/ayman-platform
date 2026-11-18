import { CheckCircle2, ChevronLeft, Clock3, Hourglass, Lightbulb, MessageSquareText, NotebookPen, PenLine } from 'lucide-react';
import { dailyEssayCopy } from '@ayman/contracts/copy/daily-essay';
import { MAX_ESSAY_TEXT, shiftEssayDay, type StudentEssay } from '@ayman/contracts/daily-essay';
import { formatCopy } from '@ayman/contracts/format';
import { EssayAnswerForm } from './essay-answer-form';

const c = dailyEssayCopy.student;

/** «الاثنين ١٠ مارس» from a `YYYY-MM-DD` key — read as UTC so the key's own day is the day shown. */
const dayFormatter = new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

export function essayDayLabel(day: string): string {
  return dayFormatter.format(new Date(`${day}T00:00:00Z`));
}

type Status = 'open' | 'waiting' | 'marked' | 'missed';

function statusOf(essay: StudentEssay): Status {
  if (essay.submission?.status === 'marked') return 'marked';
  if (essay.submission) return 'waiting';
  return essay.open ? 'open' : 'missed';
}

const STATUS_ICON = { open: PenLine, waiting: Hourglass, marked: CheckCircle2, missed: Clock3 } as const;

function StatusChip({ status }: { status: Status }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className="es-status" data-status={status}>
      <Icon className="size-3.5" aria-hidden="true" />
      {c.status[status]}
    </span>
  );
}

/** A mark as «8 / 10», isolated so it does not flip inside the Arabic line. */
function markText(mark: number): string {
  return Number.isInteger(mark) ? String(mark) : mark.toFixed(1);
}

/**
 * Everything under a question's head: the question, then whichever of the
 * four states the student is in.
 *
 * - nothing handed in, still open → the form;
 * - handed in, waiting → their answer, and «تغيير الحل» while it is open;
 * - marked → the mark first (it is what they came back for), the marker's
 *   note, the model answer, and their own answer last, so the eye goes mark →
 *   why → what it should have been → what was written;
 * - closed and never answered → the model answer, so the question still
 *   teaches something.
 *
 * All of it in one place on purpose: the question, the answer, the mark and
 * the model answer side by side is the point of the section.
 */
function EssayBody({ essay }: { essay: StudentEssay }) {
  const { submission } = essay;
  const marked = submission?.status === 'marked';

  return (
    <>
      <p className="es-question">{essay.body}</p>

      {marked && submission.mark !== null ? (
        <div className="es-score">
          <span className="es-score__num">
            {markText(submission.mark)}
            <span className="es-score__of"> / {submission.maxMarks ?? essay.maxMarks}</span>
          </span>
          <span>
            <span className="es-score__label block">{c.answer.mark}</span>
            <span className="es-score__sub block">
              {formatCopy(c.answer.outOf, { mark: markText(submission.mark), max: submission.maxMarks ?? essay.maxMarks })}
            </span>
          </span>
        </div>
      ) : null}

      {marked && submission.reviewNote ? (
        <div className="es-block" data-kind="note">
          <p className="es-block__label">
            <MessageSquareText className="size-4" aria-hidden="true" />
            {c.answer.note}
          </p>
          <p className="es-block__text">{submission.reviewNote}</p>
        </div>
      ) : null}

      {essay.modelAnswer !== null ? (
        <div className="es-block" data-kind="model">
          <p className="es-block__label">
            <Lightbulb className="size-4" aria-hidden="true" />
            {c.answer.model}
          </p>
          <p className="es-block__text">{essay.modelAnswer}</p>
        </div>
      ) : null}

      {submission ? (
        <div className="es-block">
          <p className="es-block__label">
            <NotebookPen className="size-4" aria-hidden="true" />
            {c.answer.mine}
          </p>
          <p className="es-block__meta">
            {submission.answerText !== null ? c.answer.typed : formatCopy(c.answer.photos, { n: submission.imageCount })}
          </p>
          {submission.answerText !== null ? (
            // The student's own words: plain text with their line breaks, never markup.
            <p dir="auto" className="es-block__text mt-2">
              {submission.answerText}
            </p>
          ) : submission.imageIds.length > 0 ? (
            <ul className="es-thumbs">
              {submission.imageIds.map((id) => (
                <li key={id}>
                  {/*
                    A plain `<img>`, never `next/image`: the bytes come from an
                    `/api/…` route that re-checks the session on every request,
                    and the optimizer would cache a photograph of somebody's
                    notebook publicly under `/_next/image`.
                  */}
                  <a href={`/api/me/essay/images/${id}`} target="_blank" rel="noopener noreferrer" className="es-thumb">
                    <img src={`/api/me/essay/images/${id}`} alt="" loading="lazy" />
                  </a>
                </li>
              ))}
            </ul>
          ) : submission.imagesPurged ? (
            // Says what happened AND that the answer is intact — an empty
            // block would read as the platform having lost the work.
            <p className="es-block__meta mt-1">{c.answer.imagesGone}</p>
          ) : null}
        </div>
      ) : null}

      {submission && !marked ? (
        <div className="es-block" data-kind="waiting">
          <p className="es-block__text">{c.answer.waitingBody}</p>
        </div>
      ) : null}

      {essay.open ? (
        <EssayAnswerForm
          essayId={essay.id}
          maxImages={essay.maxImages}
          maxText={MAX_ESSAY_TEXT}
          replacing={submission !== null}
        />
      ) : null}
    </>
  );
}

/** Today's question — the page's one loud object. */
export function EssayTodayCard({ essay }: { essay: StudentEssay }) {
  return (
    <section className="es-card es-card--today" aria-labelledby={`essay-${essay.id}`}>
      <header className="es-card__head">
        <span className="es-card__icon" aria-hidden="true">
          <PenLine className="size-6" />
        </span>
        <div className="es-card__titles">
          <h2 id={`essay-${essay.id}`} className="es-card__title">
            {c.card.today}
          </h2>
          <p className="es-card__date">{essayDayLabel(essay.day)}</p>
        </div>
        <span className="es-marks">{formatCopy(c.card.outOf, { max: essay.maxMarks })}</span>
        <StatusChip status={statusOf(essay)} />
      </header>
      <div className="es-card__body">
        <EssayBody essay={essay} />
      </div>
    </section>
  );
}

/**
 * One earlier question, folded. A native `<details>`: it opens with no
 * JavaScript and keeps its state across a `router.refresh()`.
 *
 * Starts OPEN when there is something to do or to see for the first time —
 * yesterday's question still taking answers — and folded otherwise, so thirty
 * past questions are thirty lines, not thirty screens.
 */
export function EssayHistoryItem({ essay, today }: { essay: StudentEssay; today: string }) {
  const status = statusOf(essay);
  const submission = essay.submission;
  const yesterday = essay.day === shiftEssayDay(today, -1);

  return (
    <details className="es-item" open={essay.open && submission === null}>
      <summary className="es-item__summary">
        <span className="es-item__main">
          <span className="es-item__date block">{yesterday ? `${c.card.yesterday} · ` : ''}{essayDayLabel(essay.day)}</span>
          <span className="es-item__excerpt block">{essay.body.split('\n')[0]}</span>
        </span>
        {status === 'marked' && submission?.mark != null ? (
          <span className="es-item__mark">
            {markText(submission.mark)} / {submission.maxMarks ?? essay.maxMarks}
          </span>
        ) : null}
        <StatusChip status={status} />
        <ChevronLeft className="es-item__chevron size-4" aria-hidden="true" />
      </summary>
      <div className="es-item__body">
        <EssayBody essay={essay} />
      </div>
    </details>
  );
}
