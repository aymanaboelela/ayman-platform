import type { CSSProperties } from 'react';
import { Crown, Medal } from 'lucide-react';
import type { ArenaBoard as Board, ArenaBoardRow } from '@ayman/contracts/arena';
import { arenaCopy } from '@ayman/contracts/copy/arena';
import { formatCopy } from '@ayman/contracts/format';
import { UserAvatar } from '@/components/app/user-avatar';
import { HAS_DRAGONS, PodiumDragon } from '@/components/rank/rank-dragon';
import { Num } from './arena-bits';

const c = arenaCopy.board;
const NUM = new Intl.NumberFormat('en-US');

/**
 * «أبطال الساحة» — نفس منصة «ترتيبي» (`rank.css`: الأعمدة الدهب والفضة
 * والبرونز)، والتلاتة الأوائل فوقها.
 *
 * ⚠️ التنانين لأيمن بس: `PodiumDragon` و`HAS_DRAGONS` من `rank-dragon.tsx`،
 * وهما ورا `aymanOnly`. على أي ستاك تاني فتح الفلاج بتاعه، المنصة نفسها بس
 * بصورة الطالب وتاج على الأول — نفس اللي «الأوائل» في الأدمن بيعمله.
 */
export function ArenaBoard({ board }: { board: Board }) {
  const podium = board.rows.filter((row) => row.rank <= 3).slice(0, 3);
  const rest = board.rows.filter((row) => !podium.includes(row));
  // الأول في النص، التاني على يمينه (أول ما العين تقرا في RTL)، والتالت شمال.
  const order = [podium[1], podium[0], podium[2]];

  return (
    <section className="ca-card ca-board rk" aria-labelledby="ca-board-title">
      <header className="ca-card__head">
        <span className="ca-card__icon" data-tone="gold">
          <Medal className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="ca-board-title" className="ca-card__title">
            {c.title}
          </h2>
          {board.cohortLabel ? <p className="ca-card__sub">{formatCopy(c.sub, { cohort: board.cohortLabel })}</p> : null}
        </div>
      </header>

      {board.rows.length === 0 ? (
        <p className="rk-empty">{c.empty}</p>
      ) : (
        <>
          <ol className="rk-podium ca-podium">
            {order.map((row, slot) =>
              row ? (
                <li
                  key={`${row.rank}-${row.name}-${slot}`}
                  className="rk-podium__slot"
                  data-place={Math.min(row.rank, 3)}
                  data-me={row.isMe || undefined}
                  style={{ '--d': slot } as CSSProperties}
                >
                  {HAS_DRAGONS ? (
                    <span className="ca-podium__dragon">
                      <PodiumDragon place={Math.min(row.rank, 3) as 1 | 2 | 3} />
                      <span className="ca-podium__face">
                        <UserAvatar name={row.name} image={row.image} size={34} />
                      </span>
                    </span>
                  ) : (
                    <span className="ca-podium__who">
                      {row.rank === 1 ? <Crown className="rk-podium__crown" aria-hidden="true" /> : null}
                      <UserAvatar name={row.name} image={row.image} size={row.rank === 1 ? 64 : 52} />
                    </span>
                  )}
                  <span className="rk-podium__name">{row.isMe ? c.me : row.name}</span>
                  <span className="rk-podium__points">
                    <Num value={NUM.format(row.points)} /> {c.points}
                  </span>
                  <span className="rk-podium__pillar">
                    <span className="rk-podium__rank">{row.rank}</span>
                  </span>
                </li>
              ) : (
                <li key={`empty-${slot}`} className="rk-podium__slot rk-podium__slot--empty" aria-hidden="true" />
              ),
            )}
          </ol>

          {rest.length > 0 || (board.me && !board.rows.some((row) => row.isMe)) ? (
            <ol className="ca-ladder">
              {rest.map((row) => (
                <BoardRow key={`${row.rank}-${row.name}`} row={row} />
              ))}
              {board.me && !board.rows.some((row) => row.isMe) ? (
                <>
                  <li className="ca-ladder__gap" aria-hidden="true">
                    ⋯
                  </li>
                  <BoardRow row={board.me} />
                </>
              ) : null}
            </ol>
          ) : null}
        </>
      )}
    </section>
  );
}

function BoardRow({ row }: { row: ArenaBoardRow }) {
  return (
    <li className="ca-ladder__row" data-me={row.isMe || undefined}>
      <span className="ca-ladder__rank">
        <Num value={row.rank} />
      </span>
      <UserAvatar name={row.name} image={row.image} size={36} />
      <span className="ca-ladder__name">{row.isMe ? c.me : row.name}</span>
      <span className="ca-ladder__meta">{formatCopy(c.wins, { n: NUM.format(row.wins) })}</span>
      <span className="ca-ladder__points">
        <Num value={NUM.format(row.points)} />
      </span>
    </li>
  );
}
