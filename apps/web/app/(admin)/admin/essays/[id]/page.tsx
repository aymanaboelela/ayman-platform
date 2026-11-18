import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, ChevronLeft, Lightbulb, MessageSquareText, NotebookPen, Phone, UserRound } from 'lucide-react';
import { dailyEssayCopy } from '@ayman/contracts/copy/daily-essay';
import { AdminEssaySubmissionDetailSchema } from '@ayman/contracts/daily-essay';
import { formatCopy } from '@ayman/contracts/format';
import { waMeHref } from '@ayman/contracts/whatsapp';
import { adminGetOrNotFound } from '@/lib/admin-api';
import { getEntitlements } from '@/lib/entitlements';
import { HomeworkImage } from '../../homework/[id]/homework-image';
import { essayDayLabel } from '../essay-day';
import { EssayMarkForm } from './mark-form';

const c = dailyEssayCopy.admin;
const m = c.marking;

export const metadata = { title: c.title };

const submittedAtFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * One answer: the question, the model answer, what the student wrote, and the
 * mark.
 *
 * ## The model answer sits BESIDE the answer, not above it
 *
 * Marking is a comparison, and on a wide screen the two are side by side so
 * the marker's eye moves between them without scrolling. On a phone the model
 * answer comes first, folded open, because that is the order it is needed in.
 *
 * `adminGetOrNotFound`: an id from a stale tab, or an answer whose student
 * deleted their account, is an ordinary missing row and reads as «مش موجود».
 */
export default async function AdminEssayMarkPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getEntitlements()).dailyEssay) notFound();

  const { id } = await params;
  const submission = await adminGetOrNotFound(
    `/api/admin/daily-essays/submissions/${id}`,
    AdminEssaySubmissionDetailSchema,
  );
  const phoneHref = waMeHref(submission.studentPhone);
  const waiting = submission.status === 'submitted';
  // Answers still waiting BESIDES this one.
  const others = submission.pendingCount - (waiting ? 1 : 0);

  return (
    <>
      <p className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/admin/essays?tab=marking"
          className="inline-flex items-center gap-1.5 text-[length:var(--fs-text-sm)] text-fg-muted hover:text-fg"
        >
          <ArrowRight className="size-4" aria-hidden="true" />
          {m.back}
        </Link>
        {others > 0 ? (
          <span className="inline-flex items-center gap-2 text-[length:var(--fs-text-sm)] text-fg-muted tabular-nums">
            {formatCopy(m.remaining, { n: others })}
            {submission.nextPendingId ? (
              <Link href={`/admin/essays/${submission.nextPendingId}`} className="chip chip--quiet">
                {m.skip}
                <ChevronLeft className="size-4" aria-hidden="true" />
              </Link>
            ) : null}
          </span>
        ) : null}
      </p>

      <header className="rounded-xl border border-line bg-surface-2 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[length:var(--fs-title-3)] font-semibold text-fg">{submission.studentName}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[length:var(--fs-text-xs)] text-fg-muted tabular-nums">
              <span>{formatCopy(c.queue.essayDay, { day: essayDayLabel(submission.essayDay) })}</span>
              <span>
                {m.submittedAt} {submittedAtFormatter.format(new Date(submission.submittedAt))}
              </span>
              {submission.markerName ? <span>{formatCopy(c.queue.markedBy, { name: submission.markerName })}</span> : null}
            </p>
          </div>
          {submission.mark !== null ? (
            <span className="rounded-full bg-[color-mix(in_oklch,var(--ok),transparent_86%)] px-3.5 py-1.5 text-[length:var(--fs-text-base)] font-bold text-[color:var(--ok)]">
              {m.currentMark}{' '}
              <bdi dir="ltr" className="font-mono tabular-nums">
                {submission.mark} / {submission.maxMarks}
              </bdi>
            </span>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={`/admin/students/${submission.studentId}`} className="chip chip--quiet">
            <UserRound className="size-4" aria-hidden="true" />
            {m.openProfile}
          </Link>
          {phoneHref ? (
            <a href={phoneHref} target="_blank" rel="noopener noreferrer" className="chip chip--quiet">
              <Phone className="size-4" aria-hidden="true" />
              <bdi dir="ltr">{submission.studentPhone}</bdi>
            </a>
          ) : null}
        </div>
      </header>

      <section className="mt-4 rounded-xl border border-line bg-surface-2 p-4 sm:p-5">
        <h2 className="flex items-center gap-1.5 text-[length:var(--fs-text-sm)] font-semibold text-fg-muted">
          <MessageSquareText className="size-4" aria-hidden="true" />
          {m.question}
        </h2>
        <p className="mt-1.5 whitespace-pre-line text-[length:var(--fs-text-base)] font-medium leading-relaxed text-fg">
          {submission.body}
        </p>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:items-start">
        <section className="rounded-xl border border-[color:var(--ok)]/40 bg-[color-mix(in_oklch,var(--ok),transparent_94%)] p-4 sm:p-5 lg:sticky lg:top-[calc(var(--topbar-h)+1rem)]">
          <h2 className="flex items-center gap-1.5 text-[length:var(--fs-text-sm)] font-semibold text-[color:var(--ok)]">
            <Lightbulb className="size-4" aria-hidden="true" />
            {m.modelAnswer}
          </h2>
          <p className="mt-1.5 whitespace-pre-line text-[length:var(--fs-text-base)] leading-relaxed text-fg">
            {submission.modelAnswer}
          </p>
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-[length:var(--fs-text-sm)] font-semibold text-fg-muted">
            <NotebookPen className="size-4" aria-hidden="true" />
            {m.answer}
          </h2>
          {submission.answerText !== null ? (
            // Typed: plain text with the student's own line breaks, never markup.
            <p
              dir="auto"
              className="whitespace-pre-line rounded-xl border border-line bg-surface-2 p-4 text-[length:var(--fs-text-base)] leading-relaxed text-fg sm:p-5"
            >
              {submission.answerText}
            </p>
          ) : submission.imageIds.length > 0 ? (
            <ul className="grid grid-cols-1 gap-3">
              {submission.imageIds.map((imageId, index) => (
                <li key={imageId} className="overflow-hidden rounded-xl border border-line bg-surface-2">
                  {/* Full width and unclipped — a cropped thumbnail of
                      handwriting is unreadable. `HomeworkImage` is the same
                      viewer الواجب uses: a plain `<img>` off a permission-gated
                      `/api/…` route, with a rotate button for a sideways page. */}
                  <HomeworkImage
                    src={`/api/admin/daily-essays/images/${imageId}`}
                    alt={`${c.queue.imageUnit} ${index + 1}`}
                    eager={index === 0}
                    rotateLabel={m.rotateImage}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-line bg-surface-2 px-5 py-8 text-center text-[length:var(--fs-text-sm)] text-fg-muted">
              {waiting ? m.imagesExpired : m.imagesGone}
            </p>
          )}
        </section>
      </div>

      <EssayMarkForm
        // Remounted per answer: «حفظ والتالي» navigates to the same route with
        // another id, and the previous answer's mark must not carry over.
        key={submission.id}
        id={submission.id}
        maxMarks={submission.maxMarks}
        initialMark={submission.mark}
        initialNote={submission.reviewNote}
        nextPendingId={submission.nextPendingId}
        hasImages={submission.imageIds.length > 0}
      />
    </>
  );
}
