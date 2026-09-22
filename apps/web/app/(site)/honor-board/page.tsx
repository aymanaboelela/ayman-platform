import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Medal, Trophy } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { HonorFace } from '@/components/site/honor-face';
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

  return (
    <main className="honor-archive site-shell">
      <header className="honor-archive__head">
        <p className="honor-archive__eyebrow">
          <Trophy size={18} strokeWidth={1.5} aria-hidden="true" />
          {c.eyebrow}
        </p>
        <h1 className="honor-archive__title">{c.archiveTitle}</h1>
        <p className="honor-archive__lead">{c.archiveLead}</p>
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
                    {/* لوحة كلها بالإيد مالهاش اسم امتحان، والسطر بيتشال
                        خالص بدل ما يفضل فاضي وياخد مسافته. */}
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

        <ul className="honor-board__slots honor-archive__slots">
          {active.entries.map((entry) => (
            <li
              className="honor-board__slot honor-board__slot--filled"
              key={`${entry.studentName}-${entry.courseLabel}-${entry.rank}`}
            >
              <span className="honor-board__slot-mark" aria-hidden="true">
                <Medal size={22} strokeWidth={1.5} />
              </span>
              <span className="honor-board__slot-rank">
                {c.placeRanks[entry.rank - 1] ?? ''}
              </span>
              <span className="honor-board__slot-course">{entry.courseLabel}</span>
              {/* The same face as the landing board, drawn by the same
                  component — an archived round has to keep looking like the
                  board it was. */}
              <HonorFace name={entry.studentName} photoKey={entry.photoKey} />
              <span className="honor-board__slot-name">{entry.studentName}</span>
              <span className="honor-board__slot-quiz">{entry.title}</span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

/** Day, month and year in Western digits — the rule every date on this site
 *  follows, and the year matters here in a way it does not on a live board. */
const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'Africa/Cairo',
});
