import Link from 'next/link';
import { ArrowLeft, PenLine } from 'lucide-react';
import { dailyEssayCopy } from '@ayman/contracts/copy/daily-essay';
import { EssaySummarySchema } from '@ayman/contracts/daily-essay';
import { formatCopy } from '@ayman/contracts/format';
import { apiGetAuthed } from '@/lib/api-server';
import '@/components/engagement/engagement.css';
import './essay.css';

const c = dailyEssayCopy.student.home;

/**
 * «سؤال مقالي اليوم» on the dashboard.
 *
 * Its own card and not a row in «النهارده»: that strip is not drawn on the
 * cinema home at all, and this is the one daily thing with a person waiting on
 * the other end of it. Streamed in its own Suspense boundary by the page, and
 * a failed read is the card missing — never the dashboard.
 *
 * Says one of four things: there is a question to answer today, yesterday's is
 * still open, the answer is waiting on a mark, or the mark has arrived. With
 * none of those true it draws nothing.
 */
export async function EssayHomeCard() {
  let summary;
  try {
    summary = await apiGetAuthed('/api/me/essay/summary', EssaySummarySchema);
  } catch {
    return null;
  }
  const essay = summary.essay;
  if (!essay) return null;

  const submission = essay.submission;
  const marked = submission?.status === 'marked' && submission.mark !== null;
  // A closed question nobody answered has nothing to ask for from the home page.
  if (!submission && !essay.open) return null;

  const title = !submission && essay.day !== summary.day ? c.titleYesterday : c.title;
  const line = marked
    ? formatCopy(c.marked, { mark: submission.mark ?? 0, max: submission.maxMarks ?? essay.maxMarks })
    : submission
      ? c.waiting
      : c.hint;
  const cta = marked ? c.ctaMarked : submission ? c.ctaWaiting : c.cta;

  return (
    <section className="es es-home" aria-label={c.title}>
      <span className="es-home__icon" aria-hidden="true">
        <PenLine className="size-6" />
      </span>
      <div className="es-home__main">
        <h2 className="es-home__title">{title}</h2>
        <p className="es-home__question">{essay.body.split('\n')[0]}</p>
        <p className="es-home__line">{line}</p>
      </div>
      <Link href="/essay" className="es-home__cta">
        {cta}
        <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
      </Link>
    </section>
  );
}
