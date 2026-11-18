import type { Metadata } from 'next';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { CalendarClock, CheckCircle2, NotebookPen, Percent } from 'lucide-react';
import { dailyEssayCopy } from '@ayman/contracts/copy/daily-essay';
import { EssayPayloadSchema } from '@ayman/contracts/daily-essay';
import { EssayHistoryItem, EssayTodayCard } from '@/components/essay/essay-card';
import { EngagementHead, readOr404 } from '@/components/engagement/page-shell';
import { featureEnabled } from '@/lib/entitlements';
import '@/components/engagement/engagement.css';
import '@/components/essay/essay.css';

const c = dailyEssayCopy.student;

export const metadata: Metadata = { title: c.meta.title };

/**
 * «السؤال المقالي اليومي» — behind `dailyEssay`.
 *
 * One page holds the whole section, on purpose: today's question, the
 * student's answers, their marks and the model answers are all here, so the
 * question, what was written, what it scored and what it should have been are
 * read together.
 *
 * Per request: what is on the page depends on the Cairo day and on what was
 * marked a minute ago, so nothing here can be filled at build time.
 */
export default async function EssayPage() {
  await connection();
  if (!(await featureEnabled('dailyEssay'))) notFound();
  const payload = await readOr404('/api/me/essay', EssayPayloadSchema);
  const { stats } = payload;

  return (
    <main className="es mx-auto w-full max-w-[var(--w-app)] px-4 py-6 md:px-6 md:py-10">
      <EngagementHead {...c.page} />

      {stats.answered > 0 ? (
        <ul className="eg-tiles mb-5">
          <li className="eg-tile" data-hue="teal">
            <span className="eg-tile__icon" aria-hidden="true">
              <NotebookPen className="size-5" />
            </span>
            <span className="eg-tile__value eg-ltr-num">{stats.answered}</span>
            <span className="eg-tile__label">{c.stats.answered}</span>
          </li>
          <li className="eg-tile" data-hue="green">
            <span className="eg-tile__icon" aria-hidden="true">
              <CheckCircle2 className="size-5" />
            </span>
            <span className="eg-tile__value eg-ltr-num">{stats.marked}</span>
            <span className="eg-tile__label">{c.stats.marked}</span>
          </li>
          {stats.averagePercent !== null ? (
            <li className="eg-tile" data-hue="amber">
              <span className="eg-tile__icon" aria-hidden="true">
                <Percent className="size-5" />
              </span>
              <span className="eg-tile__value eg-ltr-num">{stats.averagePercent}%</span>
              <span className="eg-tile__label">{c.stats.average}</span>
            </li>
          ) : null}
        </ul>
      ) : null}

      {payload.today ? (
        <EssayTodayCard essay={payload.today} />
      ) : (
        <div className="es-empty">
          <span className="es-empty__icon" aria-hidden="true">
            <CalendarClock className="size-6" />
          </span>
          <p className="es-empty__title">{c.empty.title}</p>
          <p className="es-empty__body">{payload.history.length > 0 ? c.empty.bodyWithHistory : c.empty.body}</p>
        </div>
      )}

      {payload.history.length > 0 ? (
        <section className="mt-8" aria-labelledby="essay-history">
          <div className="group-head">
            <span className="group-head__mark" aria-hidden="true" />
            <h2 id="essay-history" className="group-head__title">
              {c.history.title}
            </h2>
          </div>
          <div className="es-history">
            {payload.history.map((essay) => (
              <EssayHistoryItem key={essay.id} essay={essay} today={payload.day} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
