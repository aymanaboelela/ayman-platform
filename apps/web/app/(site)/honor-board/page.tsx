import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Crown, Medal, Trophy } from 'lucide-react';
import type { HonorBoardEntry } from '@ayman/contracts/admin/exams';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { HonorFace } from '@/components/site/honor-face';
import { getBrandAsset } from '@/lib/brand-assets';
import { tenantName } from '@/lib/tenant';
import { getHonorBoardRounds } from '@/lib/home-blocks';
import { getEntitlements } from '@/lib/entitlements';

const c = copy.landing.honorBoard;

export const metadata: Metadata = { title: c.archiveTitle };

/**
 * «عرض الكل» — لوحة الشرف, every round that has ever been pinned.
 *
 * ## Why a rail of rounds and not one long list
 *
 * The board is four names at a time and it refills every exam. Stacked
 * end to end that reads as one ever-growing leaderboard, which is the one
 * thing it is not: a تانية-لغات first place from September and a تانية-عربي
 * first place from October never sat the same paper and are not ranked
 * against each other. The rail makes the round the unit — «الناس اللي كانت
 * وقتها على اللوحة» — and each panel is then a board exactly like the one on
 * the landing page.
 *
 * ## The round is a link, not a tab
 *
 * `?round=` in the URL rather than client state, so a round can be sent to
 * somebody. It also means this page has no JavaScript of its own: the rail is
 * links and the panel is server-rendered, the same shape `/admin/grading`
 * uses for its tabs.
 *
 * ## Why it can 404
 *
 * A `?round=` that matches nothing is a wrong URL, not an empty board, and
 * rendering the newest round instead would quietly show the reader something
 * other than what they asked for. An EMPTY archive is different — that is a
 * true answer about a board nobody has filled, and it renders in place.
 */
export default async function HonorBoardArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ round?: string }>;
}) {
  /*
   * الصفحة نفسها مش موجودة على ستاك الفيتشر دي مقفولة فيه — `notFound()`
   * مش صفحة فاضية.
   *
   * اللودر تحت بيرجّع «مفيش حاجة» أصلًا، وده كان هيسيب عنوان وسطر وصف
   * لقسم مالوش وجود. و`notFound()` مش ٤٠٣ لنفس السبب المكتوب في
   * `(admin)/layout.tsx`: الصفحة دي مش «ممنوعة»، هي مش هنا.
   */
  if (!(await getEntitlements()).honorBoard) notFound();

  const [{ round }, board] = await Promise.all([searchParams, getHonorBoardRounds()]);

  if (board.periods.length === 0) {
    return (
      <main className="honor-archive site-shell">
        <header className="honor-archive__head">
          <p className="honor-archive__eyebrow">
            <Trophy size={18} strokeWidth={1.5} aria-hidden="true" />
            {c.eyebrow}
          </p>
          <h1 className="honor-archive__title">{c.archiveTitle}</h1>
          <p className="honor-archive__lead">{c.archiveEmpty}</p>
        </header>
      </main>
    );
  }

  const active = round ? board.periods.find((period) => period.key === round) : board.periods[0];
  if (!active) notFound();

  /* The instructor's portrait beside «ألف مبروك للأوائل». `getBrandAsset`
     answers undefined on every stack but his, and the band then closes up
     to the words alone — nothing else branches. */
  const host = getBrandAsset('honorHost');
  const races = groupByRace(active.entries);

  return (
    <main className="honor-archive site-shell">
      <header className={host ? 'honor-hero honor-hero--host' : 'honor-hero'}>
        <div className="honor-hero__text">
          <p className="honor-archive__eyebrow">
            <Trophy size={18} strokeWidth={1.5} aria-hidden="true" />
            {c.title}
          </p>
          <h1 className="honor-hero__title">{c.hostTitle}</h1>
          <p className="honor-hero__lead">{c.hostBody}</p>
          {active.titles.length > 0 ? (
            <p className="honor-hero__exam">
              {active.titles.join(' · ')}
              {' — '}
              {dateFormatter.format(new Date(active.pinnedAt))}
            </p>
          ) : null}
        </div>
        {host ? (
          <figure className="honor-hero__host">
            <Image
              src={host.src}
              width={host.width}
              height={host.height}
              alt=""
              sizes="(min-width: 64rem) 18rem, 11rem"
              priority
              className="honor-hero__host-photo"
            />
            <figcaption className="honor-hero__host-name">
              {formatCopy(c.hostCaption, { name: tenantName(copy.site.name) })}
            </figcaption>
          </figure>
        ) : null}
      </header>

      <div className="honor-archive__body">
        {/* The rail. `<nav>` and not a list of buttons: these are addresses. */}
        <nav className="honor-archive__rail" aria-label={c.archivePeriods}>
          <h2 className="honor-archive__rail-title">{c.archivePeriods}</h2>
          <ul className="honor-archive__rail-list">
            {board.periods.map((period) => {
              const current = period.key === active.key;
              return (
                <li key={period.key}>
                  <Link
                    href={`/honor-board?round=${period.key}`}
                    aria-current={current ? 'page' : undefined}
                    className={
                      current
                        ? 'honor-archive__rail-item honor-archive__rail-item--on'
                        : 'honor-archive__rail-item'
                    }
                  >
                    {/* The date first, because that is what the reader is
                        scanning for; the exam under it, because two rounds a
                        month apart otherwise look identical. Western digits
                        via `ar-EG-u-nu-latn`, the rule every date here
                        follows. */}
                    <span className="honor-archive__rail-date">
                      {dateFormatter.format(new Date(period.pinnedAt))}
                    </span>
                    {period.titles.length > 0 && (
                      <span className="honor-archive__rail-exam">
                        {period.titles.join(' · ')}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* One race per course — the board's own rule (see `courseLabel` in
            the contract): a podium for each, never one podium across them. */}
        <div className="honor-races">
          {races.map((race) => {
            const podium = race.entries.filter((entry) => entry.rank <= 3);
            const rest = race.entries.filter((entry) => entry.rank > 3);
            return (
              <section className="honor-race" key={race.label || 'all'}>
                {race.label ? <h2 className="honor-race__label">{race.label}</h2> : null}

                {podium.length > 0 ? (
                  <ol className="honor-podium" aria-label={c.podiumTitle}>
                    {podium.map((entry) => (
                      <li
                        className="honor-podium__place"
                        data-place={entry.rank}
                        key={`${entry.studentName}-${entry.rank}`}
                      >
                        <span className="honor-podium__badge" aria-hidden="true">
                          {entry.rank === 1 ? (
                            <Crown size={20} strokeWidth={1.75} />
                          ) : (
                            <Medal size={20} strokeWidth={1.75} />
                          )}
                        </span>
                        <span className="honor-podium__ring">
                          <HonorFace
                            name={entry.studentName}
                            photoKey={entry.photoKey}
                            className="honor-podium__face"
                            sizes="(min-width: 64rem) 10rem, 8rem"
                          />
                          <span className="honor-podium__num" aria-hidden="true">
                            {entry.rank}
                          </span>
                        </span>
                        <span className="honor-podium__rank">{c.placeRanks[entry.rank - 1] ?? ''}</span>
                        <span className="honor-podium__name">{entry.studentName}</span>
                        <Score entry={entry} className="honor-podium__score" />
                      </li>
                    ))}
                  </ol>
                ) : null}

                {rest.length > 0 ? (
                  <>
                    <h3 className="honor-rest__title">{c.restTitle}</h3>
                    <ol className="honor-rest">
                      {rest.map((entry) => (
                        <li className="honor-rest__row" key={`${entry.studentName}-${entry.rank}`}>
                          <span className="honor-rest__num" aria-hidden="true">
                            {entry.rank}
                          </span>
                          <HonorFace
                            name={entry.studentName}
                            photoKey={entry.photoKey}
                            className="honor-rest__face"
                            sizes="3.5rem"
                          />
                          <span className="honor-rest__who">
                            <span className="honor-rest__name">{entry.studentName}</span>
                            <span className="honor-rest__rank">{c.placeRanks[entry.rank - 1] ?? ''}</span>
                          </span>
                          <Score entry={entry} className="honor-rest__score" />
                        </li>
                      ))}
                    </ol>
                  </>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}

/** «48 من 50» — or nothing on a hand-added card, which has no paper. The
 *  digits are isolated: a Latin number inside an Arabic line flips. */
function Score({ entry, className }: { entry: HonorBoardEntry; className: string }) {
  if (entry.scaledScore === null || entry.gradeOutOf === null) {
    return <span className={`${className} ${className}--reason`}>{entry.title}</span>;
  }
  return (
    <span className={className}>
      <bdi dir="ltr">
        {formatCopy(c.score, {
          score: formatMark(entry.scaledScore),
          outOf: formatMark(entry.gradeOutOf),
        })}
      </bdi>
    </span>
  );
}

/** 47.5 stays 47.5, 48 stays 48 — never «48.0000» off a Decimal(10,4). */
function formatMark(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** Entries in the order they came (already sorted by place), split by course. */
function groupByRace(entries: HonorBoardEntry[]): Array<{ label: string; entries: HonorBoardEntry[] }> {
  const races = new Map<string, HonorBoardEntry[]>();
  for (const entry of entries) {
    const list = races.get(entry.courseLabel);
    if (list) list.push(entry);
    else races.set(entry.courseLabel, [entry]);
  }
  return [...races.entries()].map(([label, list]) => ({ label, entries: list }));
}

/** Day, month and year in Western digits — the rule every date on this site
 *  follows, and the year matters here in a way it does not on a live board. */
const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'Africa/Cairo',
});
