import { formatMark } from '@ayman/contracts/format';
import type { HonorBoardEntry } from '@ayman/contracts/admin/exams';
import { Mono, NeonHead, NeonWindow } from './neon-chrome';
import { MARKERS, neonCopy } from './neon-copy';

/**
 * The `honorBoard` block — `// honor_board`, rendered as a log.
 *
 * The names come from the page, not from the block: the stored row is
 * `{ type: 'honorBoard' }` and nothing else, so an admin who positioned this
 * section months ago keeps working through every change to what it shows.
 * `<HonorBoardSection>` documents that contract and this preset honours it.
 *
 * ## No photographs, and that is a decision rather than an omission
 *
 * `HonorBoardEntry` carries two of them — `avatarKey`, the student's own, which
 * NOTHING public renders, and `photoKey`, the one an instructor cleared for the
 * classic board. This preset renders neither, for two reasons that point the
 * same way.
 *
 * The aesthetic one: there is no round photo slot anywhere on this page. Every
 * other card here is a code window with monospace rows in it, and a portrait
 * dropped into that is the one element that would say "this section was
 * designed somewhere else".
 *
 * The one that actually decides it: this is the only payload on the platform
 * that is public to the entire internet AND describes a named minor — the
 * contract says so in as many words, and says the board therefore carries the
 * least that still makes a board. A preset built for an instructor who has not
 * yet thought about any of this should not be the surface that quietly starts
 * publishing children's faces. The initial in the bracket identifies the row
 * next to the name that is already there; a photograph identifies the child to
 * a stranger.
 *
 * ## The empty board is ONE line, not four reserved places
 *
 * The classic section draws four outlined slots and a «لسه» line under them,
 * and that is right for a platform where the first paper has a date. On a
 * stack that has not scheduled an exam at all, four empty boxes read as a
 * section that failed to load — which is exactly why `NEUTRAL_FALLBACK_BLOCKS`
 * leaves the block off a new tenant's starter page entirely. An admin who puts
 * it back deliberately gets the honest version: one line saying the board is
 * empty and what fills it.
 */
export function NeonHonorBoard({
  entries,
  level,
}: {
  entries: readonly HonorBoardEntry[];
  level: 1 | 2;
}) {
  return (
    <section className="neon-section" id="honor-board">
      <div className="neon-shell">
        <NeonHead
          marker={MARKERS.honorBoard}
          title={neonCopy.honorTitle}
          lead={neonCopy.honorLead}
          level={level}
        />

        <div className="neon-board">
          <NeonWindow file={neonCopy.honorFile}>
            {entries.length === 0 ? (
              <p className="neon-board__empty">
                <Mono className="neon-board__hash" hidden>
                  #
                </Mono>
                <span>{neonCopy.honorEmpty}</span>
              </p>
            ) : (
              <ol className="neon-board__list">
                {entries.map((entry, index) => (
                  <li className="neon-board__row" key={`${entry.studentName}-${index}`}>
                    {/* The rank. `<ol>` already numbers this list for a screen
                        reader, so the printed index is ornament and is hidden
                        from the tree — otherwise every row is announced with
                        its position twice. */}
                    <Mono className="neon-board__rank" hidden>
                      {String(index + 1).padStart(2, '0')}
                    </Mono>
                    <span className="neon-board__initial" aria-hidden="true">
                      {entry.studentName.trim().charAt(0)}
                    </span>
                    <span className="neon-board__who">
                      <span className="neon-board__name">{entry.studentName}</span>
                      <span className="neon-board__quiz">{entry.quizTitle}</span>
                    </span>
                    <span className="neon-board__leader" aria-hidden="true" />
                    {/*
                      «95/100». Two Latin numbers and a slash inside an RTL
                      line: without the isolate the bidi algorithm reorders it
                      to «100/95», which is a different — and much better —
                      mark than the student actually got.
                    */}
                    <Mono className="neon-board__score">
                      {`${formatMark(entry.scaledScore)}/${formatMark(entry.gradeOutOf)}`}
                    </Mono>
                  </li>
                ))}
              </ol>
            )}
          </NeonWindow>
        </div>
      </div>
    </section>
  );
}
