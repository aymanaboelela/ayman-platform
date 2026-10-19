import Link from 'next/link';
import type { CSSProperties } from 'react';
import { z } from 'zod';
import { CheckCircle2, FileQuestion, Flag, Layers, NotebookPen } from 'lucide-react';
import { formatCopy } from '@ayman/contracts/format';
import { adminPractice as c } from '@ayman/contracts/copy/admin-practice';
import { AdminPracticeSetRowSchema, type PracticeTrack, type PracticeYear } from '@ayman/contracts/practice';
import { adminGetOrNull } from '@/lib/admin-api';
import { AdminEmpty } from '@/components/admin/admin-empty';
import { StatTile } from '@/components/dashboard/stat-tile';
import { NewSetDialog } from '@/components/admin/practice/new-set-dialog';
import { SetCard } from '@/components/admin/practice/set-card';
import { questionCount, shelvesOf, unitHue } from '@/components/admin/practice/practice-model';
import '@/components/admin/practice/practice-admin.css';

export const metadata = { title: c.title };

/** A hue per year·track shelf — decorative, always beside its own words. */
const SHELF_HUE: Record<`${PracticeYear}:${PracticeTrack}`, number> = {
  '1:arabic': 205,
  '1:languages': 260,
  '2:arabic': 295,
  '2:languages': 330,
};

/**
 * «اختبارات مجانية» — `/admin/practice`.
 *
 * The band says what the section is and holds «إضافة درس»; four tiles count
 * it; the year and track filters narrow it; and the sets sit on one shelf per
 * year·track, grouped by unit the way the book is, each a card with every
 * action on it.
 *
 * Uncached like every admin read (`lib/admin-api.ts`): an instructor must see
 * the set he just published as published.
 */
export default async function AdminPracticePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string): string => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value) ?? '';
  };
  const year: PracticeYear | null = one('year') === '1' ? 1 : one('year') === '2' ? 2 : null;
  const rawTrack = one('track');
  const track: PracticeTrack | null = rawTrack === 'arabic' || rawTrack === 'languages' ? rawTrack : null;

  // 404 here is not «no sets» — that is `[]`. It is `PracticeOpenGuard`: the
  // `practice.enabled` flag is off on this stack (the default on every new
  // teacher's), and every practice route answers 404 until it is switched on.
  const listed = await adminGetOrNull('/api/admin/practice/sets', z.array(AdminPracticeSetRowSchema));
  if (listed === null) {
    return (
      <>
        <section className="stage">
          <div className="stage__body">
            <p className="stage__eyebrow">{c.eyebrow}</p>
            <h1 className="stage__title">{c.title}</h1>
            <p className="stage__sub">{c.lead}</p>
          </div>
        </section>
        <div className="mt-6">
          <AdminEmpty
            spot="topics"
            title={c.disabled.title}
            hint={c.disabled.hint}
            action={
              <Link href="/admin/flags" className="chip chip--solid">
                <Flag className="size-4" aria-hidden="true" />
                {c.disabled.action}
              </Link>
            }
          />
        </div>
      </>
    );
  }
  const rows = listed;

  const totalQuestions = rows.reduce((sum, row) => sum + row.questionCount, 0);
  const published = rows.filter((row) => row.published).length;
  const visible = rows.filter((row) => (year === null || row.year === year) && (track === null || row.track === track));
  const shelves = shelvesOf(visible);

  const href = (next: { year?: PracticeYear | null; track?: PracticeTrack | null }): string => {
    const merged = { year: 'year' in next ? next.year : year, track: 'track' in next ? next.track : track };
    const query = new URLSearchParams();
    if (merged.year) query.set('year', String(merged.year));
    if (merged.track) query.set('track', merged.track);
    return query.size === 0 ? '/admin/practice' : `/admin/practice?${query}`;
  };
  const countWhere = (predicate: (row: (typeof rows)[number]) => boolean) => rows.filter(predicate).length;

  return (
    <>
      <section className="stage">
        <div className="stage__body">
          <p className="stage__eyebrow">{c.eyebrow}</p>
          <h1 className="stage__title">{c.title}</h1>
          <p className="stage__sub">{c.lead}</p>
          <div className="prx-hero__actions">
            <NewSetDialog defaultYear={year ?? 2} defaultTrack={track ?? 'arabic'} triggerClassName="prx-hero__primary" />
          </div>
        </div>
      </section>

      <div className="prx-stats">
        <StatTile icon={<Layers className="size-5" />} value={rows.length} label={c.stats.sets} hue={255} />
        <StatTile icon={<FileQuestion className="size-5" />} value={totalQuestions} label={c.stats.questions} hue={195} />
        <StatTile icon={<CheckCircle2 className="size-5" />} value={published} label={c.stats.published} hue={175} />
        <StatTile icon={<NotebookPen className="size-5" />} value={rows.length - published} label={c.stats.drafts} hue={65} />
      </div>

      {rows.length === 0 ? (
        <AdminEmpty spot="topics" title={c.empty.title} hint={c.empty.hint} action={<NewSetDialog />} />
      ) : (
        <>
          <nav className="prx-filters" aria-label={c.filters.label}>
            <div className="prx-seg">
              <span className="prx-seg__label">{c.filters.year}</span>
              {([null, 1, 2] as const).map((option) => (
                <Link
                  key={String(option)}
                  href={href({ year: option })}
                  className="prx-seg__item"
                  aria-current={year === option ? 'page' : undefined}
                >
                  {option === null ? c.filters.all : c.years[option]}
                  <span className="prx-count">
                    {countWhere((row) => option === null || row.year === option)}
                  </span>
                </Link>
              ))}
            </div>
            <div className="prx-seg">
              <span className="prx-seg__label">{c.filters.track}</span>
              {([null, 'arabic', 'languages'] as const).map((option) => (
                <Link
                  key={String(option)}
                  href={href({ track: option })}
                  className="prx-seg__item"
                  aria-current={track === option ? 'page' : undefined}
                >
                  {option === null ? c.filters.all : c.tracks[option]}
                  <span className="prx-count">
                    {countWhere((row) => (year === null || row.year === year) && (option === null || row.track === option))}
                  </span>
                </Link>
              ))}
            </div>
          </nav>

          {shelves.length === 0 ? (
            <AdminEmpty spot="topics" title={c.empty.filtered} />
          ) : (
            shelves.map((shelf) => {
              const count = shelf.units.reduce((sum, unit) => sum + unit.rows.length, 0);
              const questions = shelf.units.reduce(
                (sum, unit) => sum + unit.rows.reduce((inner, row) => inner + row.questionCount, 0),
                0,
              );
              return (
                <section
                  key={`${shelf.year}:${shelf.track}`}
                  className="prx-shelf"
                  style={{ '--shelf-h': SHELF_HUE[`${shelf.year}:${shelf.track}`] } as CSSProperties}
                  aria-labelledby={`shelf-${shelf.year}-${shelf.track}`}
                >
                  <div className="prx-shelf__head">
                    <h2 id={`shelf-${shelf.year}-${shelf.track}`} className="prx-shelf__title">
                      {c.years[shelf.year]}
                    </h2>
                    <span className="prx-tag prx-tag--shelf">{c.tracks[shelf.track]}</span>
                    <span className="prx-count">{count}</span>
                    <span className="prx-hint">{questionCount(questions)}</span>
                  </div>
                  {shelf.units.map((unit) => (
                    <div
                      key={unit.unit}
                      className="prx-unit"
                      style={{ '--unit-h': unitHue(unit.unit) } as CSSProperties}
                    >
                      <h3 className="prx-unit__head">
                        <span className="prx-unit__dot" aria-hidden="true" />
                        {formatCopy(c.unit, { n: unit.unit })}
                        {unit.unitTitle ? <span className="prx-unit__sub">{unit.unitTitle}</span> : null}
                      </h3>
                      <div className="prx-grid">
                        {unit.rows.map((row) => (
                          <SetCard key={row.id} row={row} />
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              );
            })
          )}
        </>
      )}
    </>
  );
}
