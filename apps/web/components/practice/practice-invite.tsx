import Link from 'next/link';
import { ArrowLeft, BookOpenCheck, Lightbulb, ListChecks } from 'lucide-react';
import { practiceCopy as p } from '@ayman/contracts/copy/practice';
import { getPracticeListOrEmpty, practicePath, practiceTotals } from '@/lib/practice/catalog';
import { PracticeShowcase } from './practice-showcase';

/**
 * «اختبارات مجانية» on the landing page — the way in to `/practice` for
 * someone who arrived on the home page.
 *
 * ⚠️ Rendered by the classic landing page only, and only on Ayman's stack (see
 * `app/(site)/page.tsx`). It is not a home BLOCK: a block would need a new
 * `home_block_type` value, a composer form and a row inserted on his live
 * database before anyone could see it. Hidden entirely while no set is
 * published, so the section can never advertise an empty page.
 */
export async function PracticeInvite() {
  const { sets } = await getPracticeListOrEmpty();
  const totals = practiceTotals(sets);
  if (totals.lessons === 0) return null;

  return (
    <section className="practice-invite" aria-labelledby="practice-invite-title">
      <div className="site-shell">
        <div className="practice-invite__card">
          <div className="practice-invite__copy">
            <span className="practice-badge">{p.invite.eyebrow}</span>
            <h2 id="practice-invite-title" className="practice-invite__title">
              {p.invite.title}
            </h2>
            <p className="practice-invite__lead">{p.invite.lead}</p>
            <ul className="practice-stats">
              <li data-tone="accent">
                <ListChecks size={22} aria-hidden="true" />
                <strong>{totals.questions}</strong>
                <span>{p.index.stats.questions}</span>
              </li>
              <li data-tone="ok">
                <BookOpenCheck size={22} aria-hidden="true" />
                <strong>{totals.lessons}</strong>
                <span>{p.index.stats.lessons}</span>
              </li>
              <li data-tone="info">
                <Lightbulb size={22} aria-hidden="true" />
                <span>{p.index.stats.instant}</span>
              </li>
            </ul>
            <div className="practice-invite__actions">
              <Link href={practicePath(2)} className="practice-btn practice-btn--primary">
                {p.invite.year2}
                <ArrowLeft size={18} aria-hidden="true" />
              </Link>
              <Link href={practicePath(1)} className="practice-btn practice-btn--glow">
                {p.invite.year1}
                <ArrowLeft size={18} aria-hidden="true" />
              </Link>
              <Link href="/practice" className="practice-invite__all">
                {p.invite.all}
              </Link>
            </div>
        </div>
          <PracticeShowcase />
        </div>
      </div>
    </section>
  );
}
