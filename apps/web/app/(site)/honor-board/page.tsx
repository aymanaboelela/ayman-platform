import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Crown, Medal, Trophy } from 'lucide-react';
import type { HonorBoardEntry } from '@ayman/contracts/admin/exams';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { HonorFace } from '@/components/site/honor-face';
import { brandImage } from '@/lib/brand-image';
import { getBranding } from '@/lib/settings';
import { ThemedImage } from '@/components/themed-image';
import { tenantName } from '@/lib/tenant';
import { getHonorBoardRounds } from '@/lib/home-blocks';
import { honorPlaceWord } from '@/lib/honor-place';
import { getEntitlements } from '@/lib/entitlements';
import { HonorLaurel } from '@/components/site/honor-laurel';

const c = copy.landing.honorBoard;

export const metadata: Metadata = { title: c.archiveTitle };

/**
 * «عرض الكل» — لوحة الشرف, every round that has ever been pinned.
 *
 * ## Why a row of rounds and not one long list
 *
 * The board is four names at a time and it refills every exam. Stacked
 * end to end that reads as one ever-growing leaderboard, which is the one
 * thing it is not: a تانية-لغات first place from September and a تانية-عربي
 * first place from October never sat the same paper and are not ranked
 * against each other. The row makes the round the unit — «الناس اللي كانت
 * وقتها على اللوحة» — and each panel is then a board exactly like the one on
 * the landing page.
 *
 * ## The round is a link, not a tab
 *
 * `?round=` in the URL rather than client state, so a round can be sent to
 * somebody. It also means this page has no JavaScript of its own: the rounds
 * are links and the panel is server-rendered, the same shape `/admin/grading`
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
      <main className="honor-hall site-shell">
        <header className="hall-hero hall-hero--empty">
          <HonorLaurel className="hall-hero__wreath" />
          <div className="hall-hero__text">
            <p className="hall-hero__eyebrow">
              <Trophy size={16} strokeWidth={1.75} aria-hidden="true" />
              {c.eyebrow}
            </p>
            <h1 className="hall-hero__title">{c.archiveTitle}</h1>
            <p className="hall-hero__lead">{c.archiveEmpty}</p>
          </div>
        </header>
      </main>
    );
  }

  const active = round ? board.periods.find((period) => period.key === round) : board.periods[0];
  if (!active) notFound();

  /* The instructor's portrait beside «ألف مبروك للأوائل» — an upload from
     «الهوية البصرية» first, his file second. With neither (any stack but his
     that has not uploaded one) the band closes up to the words alone —
     nothing else branches. */
  const host = brandImage(await getBranding(), 'honorHost');
  const races = groupByRace(active.entries);
  const firsts = active.entries.filter((entry) => entry.rank === 1).length;

  return (
    <main className="honor-hall site-shell">
      {/*
        THE BAND. «بروفشنال وشيك»: one dark, quiet panel with a gold hairline,
        the congratulation, and two figures — how many names this round put on
        the board and how many of them took first place. Dark in BOTH themes on
        purpose: a prize-giving is lit like a stage, and the tenant accent only
        tints it, so the three stacks each get their own colour of the same
        room. Fixed hues (gold, cream, ink) are the metal and the paper, not
        brand — see `.hall-hero` in sections.css.
      */}
      <header className={host ? 'hall-hero hall-hero--host' : 'hall-hero'}>
        <HonorLaurel className="hall-hero__wreath" />
        <div className="hall-hero__text">
          <p className="hall-hero__eyebrow">
            <Trophy size={16} strokeWidth={1.75} aria-hidden="true" />
            {c.title}
          </p>
          <h1 className="hall-hero__title">{c.hostTitle}</h1>
          <p className="hall-hero__lead">{c.hostBody}</p>
          <dl className="hall-hero__stats">
            <div className="hall-hero__stat">
              <dt className="hall-hero__stat-label">{c.statNames}</dt>
              <dd className="hall-hero__stat-n">{active.entries.length}</dd>
            </div>
            {firsts > 0 ? (
              <div className="hall-hero__stat">
                <dt className="hall-hero__stat-label">{c.statFirsts}</dt>
                <dd className="hall-hero__stat-n">{firsts}</dd>
              </div>
            ) : null}
          </dl>
          {active.titles.length > 0 ? (
            <p className="hall-hero__exam">
              <span>{active.titles.join(' · ')}</span>
              <span className="hall-hero__exam-date">{dateFormatter.format(new Date(active.pinnedAt))}</span>
            </p>
          ) : null}
        </div>
        {host ? (
          <figure className="hall-hero__host">
            <ThemedImage
              image={host}
              alt=""
              sizes="(min-width: 64rem) 17rem, 11rem"
              priority
              className="hall-hero__host-photo"
            />
            <figcaption className="hall-hero__host-name">
              {formatCopy(c.hostCaption, { name: tenantName(copy.site.name) })}
            </figcaption>
          </figure>
        ) : null}
      </header>

      {/*
        The rounds, as one row of chips across the top rather than a side
        rail. The rail took a quarter of the width from a board that, on a
        round where thirty-five students scored 100, needs all of it. A row
        scrolls sideways on a phone and wraps on a desk. Still `<nav>` + links:
        a round is an address (`?round=`), and the page has no JavaScript.
      */}
      {board.periods.length > 1 ? (
        <nav className="hall-rounds" aria-label={c.archivePeriods}>
          <h2 className="hall-rounds__title">{c.archivePeriods}</h2>
          <ul className="hall-rounds__list">
            {board.periods.map((period) => {
              const current = period.key === active.key;
              return (
                <li key={period.key}>
                  <Link
                    href={`/honor-board?round=${period.key}`}
                    aria-current={current ? 'page' : undefined}
                    className={current ? 'hall-rounds__item hall-rounds__item--on' : 'hall-rounds__item'}
                  >
                    {/* The date first, because that is what the reader is
                        scanning for; the exam under it, because two rounds a
                        month apart otherwise look identical. Western digits
                        via `ar-EG-u-nu-latn`, the rule every date here
                        follows. */}
                    <span className="hall-rounds__date">{dateFormatter.format(new Date(period.pinnedAt))}</span>
                    {period.titles.length > 0 && (
                      <span className="hall-rounds__exam">{period.titles.join(' · ')}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}

      {/* One race per course — the board's own rule (see `courseLabel` in
          the contract): its own medals for each, never one ranking across
          them. */}
      <div className="hall-races">
        {races.map((race) => {
          const { podium, tiers, rest } = splitMedals(race.entries);
          return (
            <section className="hall-race" key={race.label || 'all'}>
              {race.label ? (
                <header className="hall-race__head">
                  <h2 className="hall-race__label">{race.label}</h2>
                  <span className="hall-race__rule" aria-hidden="true" />
                </header>
              ) : null}

              {podium.length > 0 ? (
                <ol className="hall-podium" aria-label={c.podiumTitle}>
                  {podium.map((entry, index) => (
                    <MedalCard key={`${entry.studentName}-${entry.rank}-${index}`} entry={entry} podium />
                  ))}
                </ol>
              ) : null}

              {tiers.map((tier) => (
                <div className="hall-tier" data-place={tier.rank} key={tier.rank}>
                  <h3 className="hall-tier__title">
                    <span className="hall-tier__medal" aria-hidden="true">
                      {tier.rank === 1 ? <Crown size={16} strokeWidth={2} /> : <Medal size={16} strokeWidth={2} />}
                    </span>
                    {honorPlaceWord(tier.rank)}
                    <span className="hall-tier__count">{tier.entries.length}</span>
                  </h3>
                  <ol className="hall-cards">
                    {tier.entries.map((entry, index) => (
                      <MedalCard key={`${entry.studentName}-${entry.rank}-${index}`} entry={entry} />
                    ))}
                  </ol>
                </div>
              ))}

              {rest.length > 0 ? (
                <div className="hall-board-wrap">
                  {/* «باقي» only says something under medals; a race with
                      none is headed by its course alone. */}
                  {podium.length + tiers.length > 0 ? <h3 className="hall-board__title">{c.restTitle}</h3> : null}
                  <ol className="hall-board">
                    {rest.map((entry, index) => (
                      <li className="hall-row" key={`${entry.studentName}-${entry.rank}-${index}`}>
                        <span className="hall-row__num" aria-hidden="true">
                          {entry.rank}
                        </span>
                        <HonorFace
                          name={entry.studentName}
                          photoKey={entry.photoKey}
                          className="hall-row__face"
                          sizes="3rem"
                        />
                        <span className="hall-row__who">
                          <span className="hall-row__name">{entry.studentName}</span>
                          <span className="hall-row__rank">{honorPlaceWord(entry.rank)}</span>
                        </span>
                        <Score entry={entry} className="hall-row__score" />
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </main>
  );
}

/**
 * One medal-holder: a portrait in a ring of the place's metal, the name, the
 * mark. The same card on the podium and in a tier, so a round that has a
 * podium and a round that has thirty-five firsts read as the same board.
 */
function MedalCard({ entry, podium = false }: { entry: HonorBoardEntry; podium?: boolean }) {
  return (
    <li className={podium ? 'hall-card hall-card--podium' : 'hall-card'} data-place={entry.rank}>
      <span className="hall-card__ring">
        <HonorFace
          name={entry.studentName}
          photoKey={entry.photoKey}
          className="hall-card__face"
          sizes={podium ? '(min-width: 64rem) 10rem, 8rem' : '7rem'}
        />
        <span className="hall-card__coin" aria-hidden="true">
          {entry.rank === 1 ? <Crown size={14} strokeWidth={2.25} /> : entry.rank}
        </span>
      </span>
      {/* The place word only on the podium: in a tier it is the tier's
          heading, and repeating it under every one of thirty-five names is
          noise. */}
      {podium ? <span className="hall-card__rank">{honorPlaceWord(entry.rank)}</span> : null}
      <span className="hall-card__name">{entry.studentName}</span>
      <Score entry={entry} className="hall-card__score" />
    </li>
  );
}

/** «48 من 50» — or the reason line on a hand-added card, which has no paper. */
function Score({ entry, className }: { entry: HonorBoardEntry; className: string }) {
  if (entry.scaledScore === null || entry.gradeOutOf === null) {
    return <span className={`${className} ${className}--reason`}>{entry.title}</span>;
  }
  return (
    // RTL flow, not `dir="ltr"`: an LTR run around «من» put the total first
    // and read «20 من 19». Each number is its own run, so it still never flips.
    <span className={className}>
      {formatCopy(c.score, {
        score: formatMark(entry.scaledScore),
        outOf: formatMark(entry.gradeOutOf),
      })}
    </span>
  );
}

/** 47.5 stays 47.5, 48 stays 48 — never «48.0000» off a Decimal(10,4). */
function formatMark(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * The podium, or the medal tiers.
 *
 * A podium is three steps with one person on each: the first raised in the
 * middle, the second and third beside it (`data-place` → CSS `order`). That
 * only exists while places 1–3 are each held by ONE card. Places come from the
 * score, so a round where thirty-five students scored 100 has thirty-five
 * firsts — and picking one of them for the middle step would crown a student
 * the board itself says is level with the rest.
 *
 * So the moment any of the top three places is shared, those places are drawn
 * as TIERS instead: «المركز الأول» with every first under it as equals, then
 * «المركز التاني», then «التالت» — each in its own metal. Everybody from the
 * fourth place down is the ranked list, whichever shape the top took. («اللي
 * جابوا ١٠٠ كلهم الأول، وتحتهم الباقي واحد تحت التاني».)
 */
function splitMedals(entries: HonorBoardEntry[]): {
  podium: HonorBoardEntry[];
  tiers: Array<{ rank: number; entries: HonorBoardEntry[] }>;
  rest: HonorBoardEntry[];
} {
  const top = entries.filter((entry) => entry.rank <= 3);
  const rest = entries.filter((entry) => entry.rank > 3);
  const shared = new Set(top.map((entry) => entry.rank)).size !== top.length;
  if (!shared) return { podium: top, tiers: [], rest };
  const tiers = [1, 2, 3]
    .map((rank) => ({ rank, entries: top.filter((entry) => entry.rank === rank) }))
    .filter((tier) => tier.entries.length > 0);
  return { podium: [], tiers, rest };
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
