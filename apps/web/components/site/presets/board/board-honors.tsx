import { Crown, Medal } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import type { HonorBoardEntry } from '@ayman/contracts/admin/exams';
import { initials } from '@/components/app/user-avatar';
import { BoardHeading } from './board-heading';
import { boardCopy } from './board-copy';

const c = copy.landing.honorBoard;

/** The podium's three places, and the colour each one is struck in. */
const PODIUM = [1, 2, 3] as const;
const METAL = { 1: 'gold', 2: 'silver', 3: 'bronze' } as const;

/**
 * «لوحة الشرف» — EVERY name on the newest board, not the first four.
 *
 * The owner asked for it on Adel's stack (2026-11-04): «كل الناس اللي
 * هيضافوا». The board there carried thirteen names and the landing showed four,
 * so nine students the instructor had put on it publicly never appeared where
 * their parents look. The page hands this preset the full newest round
 * (`getHonorBoardRounds().entries` in `(site)/page.tsx`), and it is drawn as:
 *
 * - a PODIUM for places 1–3 — the first in the middle and tallest, struck in
 *   gold / silver / bronze, with a crown over the first;
 * - every other place as a compact numbered card under it, so a list of ten
 *   more names reads as a roll of honour and not as ten more podiums.
 *
 * One podium per COURSE. The board runs one race per course, so two courses
 * give two «المركز الأول» — a single podium would put one of them on the
 * silver step. The course label and the exam's name are printed once per
 * group instead of on every card, which is where the old cards spent half
 * their height.
 *
 * ## The empty board is ONE LINE here, not four reserved places
 *
 * A visitor who has never seen this platform has no reason to read four empty
 * boxes as a promise — they read them as a section that failed to load. So an
 * empty board on this preset is `copy.landing.honorBoard.waiting` and nothing
 * else.
 *
 * ## What is deliberately NOT on a card
 *
 * - The photograph. Initials only: the board names a minor on the one page a
 *   stranger reads (`board-landing.test.tsx` pins it with a real-looking key).
 * - The mark. «بدون درجات» — `scaledScore` / `percent` stay in the payload
 *   and never reach the markup.
 *
 * Every entry is here because an instructor put it here — never because a
 * score crossed a line (`quiz_attempts.honor_board_at`).
 */
export function BoardHonors({
  entries,
  level,
}: {
  entries: readonly HonorBoardEntry[];
  level: 1 | 2;
}) {
  const groups = groupByCourse(entries);

  return (
    <section className="board-band board-honors-band" id="honor-board">
      <div className="board-shell">
        <BoardHeading chip={boardCopy.honors.chip} title={c.title} lead={c.lead} level={level} />

        {entries.length === 0 ? (
          <div className="board-empty">
            <p className="board-empty__body">{c.waiting}</p>
          </div>
        ) : (
          <div className="board-honors">
            {groups.map((group) => (
              <HonorGroup key={group.courseLabel} group={group} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

interface CourseGroup {
  courseLabel: string;
  titles: string[];
  podium: HonorBoardEntry[];
  rest: HonorBoardEntry[];
}

/**
 * Groups in the order the board lists them — entries arrive sorted by place
 * with ties in course order, so the first course seen is the first podium.
 * A course with no entry ranked 1–3 (every place hand-set lower) simply has
 * no podium and shows its roll.
 */
function groupByCourse(entries: readonly HonorBoardEntry[]): CourseGroup[] {
  const groups = new Map<string, CourseGroup>();
  for (const entry of entries) {
    const group = groups.get(entry.courseLabel) ?? {
      courseLabel: entry.courseLabel,
      titles: [],
      podium: [],
      rest: [],
    };
    groups.set(entry.courseLabel, group);
    if (!group.titles.includes(entry.title)) group.titles.push(entry.title);
    // Two hand-set entries can share a place; only the first takes the step.
    const onPodium =
      entry.rank <= 3 && !group.podium.some((placed) => placed.rank === entry.rank);
    (onPodium ? group.podium : group.rest).push(entry);
  }
  for (const group of groups.values()) group.rest.sort((a, b) => a.rank - b.rank);
  return [...groups.values()];
}

function HonorGroup({ group }: { group: CourseGroup }) {
  return (
    <div className="board-honor-group">
      <div className="board-honor-group__head">
        <span className="board-honor-group__course">{group.courseLabel}</span>
        {group.titles.map((title) => (
          <span className="board-honor-group__quiz" key={title}>
            {title}
          </span>
        ))}
      </div>

      {group.podium.length > 0 ? (
        <ol className="board-podium" role="list">
          {PODIUM.map((place) => {
            const entry = group.podium.find((candidate) => candidate.rank === place);
            if (!entry) return null;
            return (
              <li
                className={`board-honor board-honor--podium board-honor--${METAL[place]}`}
                data-place={place}
                key={`${entry.studentName}-${place}`}
              >
                {place === 1 ? (
                  <span className="board-honor__crown" aria-hidden="true">
                    <Crown size={26} strokeWidth={2} />
                  </span>
                ) : null}
                <span className="board-honor__avatar" aria-hidden="true">
                  {initials(entry.studentName)}
                </span>
                <span className="board-honor__name">{entry.studentName}</span>
                <span className="board-honor__rank">{c.placeRanks[place - 1]}</span>
                {/* The step itself — its height is the place, so the podium
                    reads as a podium before a single word is read. */}
                <span className="board-honor__step" aria-hidden="true">
                  <Medal size={22} strokeWidth={2} />
                  <span className="board-honor__step-n tabular-nums">{place}</span>
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}

      {group.rest.length > 0 ? (
        <ol className="board-roll" role="list">
          {group.rest.map((entry, index) => (
            <li
              className="board-honor board-honor--row"
              key={`${entry.studentName}-${entry.rank}-${index}`}
            >
              <span className="board-honor__n tabular-nums" aria-hidden="true">
                {entry.rank}
              </span>
              <span className="board-honor__avatar" aria-hidden="true">
                {initials(entry.studentName)}
              </span>
              <span className="board-honor__who">
                <span className="board-honor__name">{entry.studentName}</span>
                {/* The word for screen readers and for places that have one;
                    past the tenth the number in the disc says it. */}
                {c.placeRanks[entry.rank - 1] ? (
                  <span className="board-honor__rank">{c.placeRanks[entry.rank - 1]}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
