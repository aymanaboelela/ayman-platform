import { Medal } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy, formatMark } from '@ayman/contracts/format';
import type { HonorBoardEntry } from '@ayman/contracts/admin/exams';
import { UserAvatar } from '@/components/app/user-avatar';
import { BoardHeading } from './board-heading';
import { boardCopy } from './board-copy';

const c = copy.landing.honorBoard;

/**
 * «لوحة الشرف» — the top marks in the monthly exam, by name.
 *
 * ## The empty board is ONE LINE here, not four reserved places
 *
 * `<HonorBoardSection>` draws four outlined, empty slots with a «؟» explaining
 * when they fill. That is a deliberate and correct design for Ayman's page: the
 * board was shipped before the first paper had been sat, the owner asked for
 * the SECTION to be visible that week regardless, and four reserved places read
 * as a wall with nothing hung on it yet.
 *
 * It does not survive the move to a brand-new deployment, and
 * `lib/home-blocks.ts` says so out loud in the note explaining why the neutral
 * fallback block list has no `honorBoard` entry: «there are no results to put
 * on a board of honour on day one, and reserved empty places on a brand new
 * site read as a broken section rather than a promise». A visitor who has never
 * seen this platform before has no reason to read four empty boxes as a
 * promise — they read them as a section that failed to load.
 *
 * So an empty board on this preset is the sentence and nothing else:
 * `copy.landing.honorBoard.waiting` — «لسه مفيش أسماء — أول امتحان هو اللي
 * هيملاها.» — centred on a slab. It states the same fact the four boxes were
 * stating, once, in words, with nothing on screen that can be mistaken for
 * content that did not arrive.
 *
 * The «؟» disclosure is deliberately NOT carried over either: its one line is
 * «اللوحة بتبدأ تاني يوم امتحان الجمعة», which is one instructor's exam
 * schedule and is false on any other stack.
 *
 * ## Why a board with names on it can carry a child's name at all
 *
 * Every entry is here because an instructor put it here — never because a
 * score crossed a line (see `quiz_attempts.honor_board_at`). A board that
 * filled itself would publish a student's name and photograph automatically.
 * That rule lives on the API and this component only renders the result of it,
 * but it is the reason this section is allowed to exist and is worth knowing
 * before anyone extends it.
 *
 * ## The block stays props-free
 *
 * `{ type: 'honorBoard' }` and nothing else, on this preset exactly as on
 * `classic`: the names are fetched by the page and handed down, never stored
 * in the row. A row an admin positioned months ago keeps working.
 */
export function BoardHonors({
  entries,
  level,
}: {
  entries: readonly HonorBoardEntry[];
  level: 1 | 2;
}) {
  return (
    <section className="board-band" id="honor-board">
      <div className="board-shell">
        <BoardHeading chip={boardCopy.honors.chip} title={c.title} lead={c.lead} level={level} />

        {entries.length === 0 ? (
          <div className="board-empty">
            <p className="board-empty__body">{c.waiting}</p>
          </div>
        ) : (
          <ul className="board-honors" role="list">
            {entries.map((entry, index) => (
              <li className="board-honor" key={`${entry.studentName}-${index}`}>
                <span className="board-honor__mark" aria-hidden="true">
                  <Medal size={20} strokeWidth={2} />
                </span>

                {/* The rank word exists for the first four places only; past
                    that the list simply continues, which is what the fourth
                    place was written to promise. */}
                <span className="board-honor__rank">{c.ranks[index] ?? ''}</span>

                <UserAvatar name={entry.studentName} image={entry.avatarKey} size={52} />

                <span className="board-honor__name">{entry.studentName}</span>

                {/* `.mono` + `.tabular-nums`, and the pair is not decoration:
                    the string is «85 من 100», a Latin-digit run inside an
                    Arabic sentence, and the stylesheet isolates it so the two
                    numbers cannot swap sides around the «من». */}
                <span className="board-honor__score mono tabular-nums">
                  {formatCopy(c.entryScore, {
                    score: formatMark(entry.scaledScore),
                    outOf: formatMark(entry.gradeOutOf),
                  })}
                </span>

                <span className="board-honor__quiz">{entry.quizTitle}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
