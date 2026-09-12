import { Medal, Trophy } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy, formatMark } from '@ayman/contracts/format';
import type { HonorBoardEntry } from '@ayman/contracts/admin/exams';
import { UserAvatar } from '@/components/app/user-avatar';

const c = copy.landing.honorBoard;

/**
 * «لوحة الشرف» on the landing page — the board itself, standing empty.
 *
 * ## What this is, and what it is not
 *
 * It is not a loading state and it is not a stub. The honour board fills from
 * the monthly exam's results and the first paper has not been sat, so there
 * are genuinely no names — and the owner asked for the SECTION to be on the
 * page this week regardless, with one line explaining when the names arrive.
 * That is the entire brief, and everything below serves it: four places that
 * read as reserved, and a «؟» that says when they fill.
 *
 * The distinction matters visually. A skeleton — pulsing bars, a shimmer —
 * says "this is arriving in a moment"; three seconds later, when it has not,
 * it says "this is broken". Nothing here animates. The places are outlined,
 * static and clearly empty, which reads as a wall with nothing hung on it yet
 * rather than as a section that failed to load.
 *
 * ## It has no loader, and that is deliberate
 *
 * There is nothing to fetch. That also means this section has no failure mode
 * of its own — it cannot render `null`, cannot 500, and costs the landing page
 * nothing on a cold cache. The one way it could still vanish is the page-level
 * one: `getHomeBlocks()` falls back to `DEFAULT_HOME_BLOCKS` when the API is
 * unreachable or the table reads empty, so the block is in that list too. A
 * deploy-window blank or one API blip must not silently delete the owner's
 * deliverable of the week — see `apps/web/lib/home-blocks.ts`, and the seed
 * migration `20260909020000_seed_honor_board_block` for the live row.
 *
 * ## Why the later slice slots straight in here
 *
 * The block is placement-only: `{ type: 'honorBoard' }` and nothing else, so
 * there are no stored props to migrate when the real board lands. The full
 * slice replaces the contents of `<ul className="honor-board__slots">` with
 * the marked results and drops the `waiting` line; the section shell, the
 * heading, the «؟» and every class name below survive unchanged. A row that
 * an admin has already positioned and published keeps working through that
 * change without being touched.
 *
 * ## Server component
 *
 * No state, no effects, no client boundary. The landing page is the LCP path
 * for every first-time visitor and an empty section must not cost it a
 * kilobyte of JavaScript — which is also why the disclosure below is a
 * `<details>` rather than a toggle (see it for the rest of that argument).
 */
export function HonorBoardSection({ entries = [] }: { entries?: HonorBoardEntry[] }) {
  return (
    <section className="site-section" id="honor-board">
      <div className="site-shell">
        <div className="honor-board__head">
          <div className="honor-board__intro">
            <span className="site-badge">{c.eyebrow}</span>
            <h2 className="site-h2">
              {/* The trophy is the section's only figurative mark. It sits in
                  the heading rather than on the cards so the four places stay
                  uniform — a cup on the first one and nothing on the fourth
                  would rank empty boxes against each other. */}
              <Trophy className="honor-board__crest" size={32} strokeWidth={1.5} aria-hidden="true" />
              {c.title}
            </h2>
            <p className="site-lead">{c.lead}</p>
          </div>

          {/*
            THE «؟», AND WHY IT IS A `<details>`.

            Zero JavaScript: it works in the server HTML, before hydration and
            without it, on a page whose whole point this week is that the
            section is visible. It is focusable and operable from the keyboard
            for free, it announces its own expanded state to a screen reader,
            and a tap opens it on touch — where a `title` tooltip, the obvious
            alternative, is unreachable and a `:hover` panel is worse.

            `.site-faq`'s accordion is the same element with a GSAP height
            tween on top. This one gets no tween: it is one short line, and a
            120ms measure-and-animate dance for a sentence is motion that
            exists to be noticed rather than to explain anything.

            ⚠️ The answer panel is positioned against `.honor-board__head`, not
            against this element — see `sections.css`. Anchored to the button
            it ran off the inline-end edge of the screen in Arabic, which is
            the only direction anybody reads this page in.
          */}
          <details className="honor-board__note">
            <summary className="honor-board__note-btn">
              {/* The glyph carries no meaning to a screen reader — «؟» would
                  be read as punctuation or skipped — so the real question is
                  in the sibling span, visually hidden but in the accessible
                  name. `aria-label` on a `<summary>` is honoured unevenly
                  across the AT/browser matrix; a text node is not. */}
              <span className="honor-board__note-glyph" aria-hidden="true">
                ؟
              </span>
              <span className="honor-board__note-label">{c.helpLabel}</span>
            </summary>
            <p className="honor-board__note-body">{c.helpBody}</p>
          </details>
        </div>

        {/* A list, not a row of divs: four reserved places ARE a list, and the
            later slice replaces its items with the real standings without
            changing what this element is. */}
        {/*
          The board, once there are names on it.

          Every entry is here because an instructor put it here — never because
          a score crossed a line. That is the whole membership rule (see
          `quiz_attempts.honor_board_at`), and it is why this list can carry a
          child's name and photograph on a public page at all: a board that
          filled itself would publish them automatically.

          The empty places below are NOT a loading state and are still the
          honest render when the board is empty — see this component's header.
        */}
        {entries.length > 0 ? (
          <ul className="honor-board__slots">
            {entries.map((entry, index) => (
              <li className="honor-board__slot honor-board__slot--filled" key={`${entry.studentName}-${index}`}>
                <span className="honor-board__slot-mark" aria-hidden="true">
                  <Medal size={22} strokeWidth={1.5} />
                </span>
                {/* The rank word only exists for the first four places; past
                    that the list simply continues, which is what the fourth
                    place was written to promise. */}
                <span className="honor-board__slot-rank">{c.ranks[index] ?? ''}</span>
                <UserAvatar name={entry.studentName} image={entry.avatarKey} size={56} />
                <span className="honor-board__slot-name">{entry.studentName}</span>
                <span className="honor-board__slot-score mono tabular-nums">
                  {formatCopy(c.entryScore, {
                    score: formatMark(entry.scaledScore),
                    outOf: formatMark(entry.gradeOutOf),
                  })}
                </span>
                <span className="honor-board__slot-quiz">{entry.quizTitle}</span>
              </li>
            ))}
          </ul>
        ) : (
        <ul className="honor-board__slots">
          {c.ranks.map((rank, index) => (
            <li className="honor-board__slot" key={rank}>
              <span className="honor-board__slot-mark" aria-hidden="true">
                <Medal size={22} strokeWidth={1.5} />
              </span>
              <span className="honor-board__slot-rank">{rank}</span>
              {/*
                The empty name line. `aria-hidden` because it is a drawn blank
                and not a value: a screen reader that announced it would say
                nothing four times, while the `waiting` line below states the
                same fact once, in words.

                ⚠️ The index is used for width only — see
                `--honor-board-slot-index` in `sections.css`. Four identical
                bars read as a template; four slightly different lengths read
                as four names that have not been written yet.
              */}
              <span
                className="honor-board__slot-line"
                aria-hidden="true"
                style={{ '--honor-board-slot-index': index } as React.CSSProperties}
              />
            </li>
          ))}
        </ul>
        )}

        {/* The «لسه» line belongs to the empty board only. Leaving it under a
            board with four names on it would say the names have not arrived. */}
        {entries.length === 0 ? <p className="honor-board__waiting">{c.waiting}</p> : null}
      </div>
    </section>
  );
}
