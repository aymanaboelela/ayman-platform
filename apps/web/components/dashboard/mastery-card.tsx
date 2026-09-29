import Link from 'next/link';
import { ArrowLeft, Target } from 'lucide-react';
import { copy, formatCopy, type MasteryTopic, type StudentMastery } from '@ayman/contracts';
import { scoreBand } from '@/lib/results-view';
import { isolateLtrRuns } from './ltr-runs';
import { PanelHead } from './panel-head';
import { SpotIllustration } from './spot-illustration';

const c = copy.dashboard.mastery;

/**
 * «نقوّي النقط دي» (was «ذاكر ده») — the three topics whose marks the student
 * is losing most of, and a way into the lesson that taught each.
 *
 * ## What it is for
 *
 * Every other block on this page describes a QUANTITY: how many courses, how
 * many lessons, what average. This is the only one that names a CAUSE, and the
 * only one whose rows a student can act on one at a time. Before it, the most
 * specific answer the dashboard could give to "what should I study" was "the
 * video you paused".
 *
 * ## Why it is not red any more
 *
 * It was: a washed red track, a solid red fill and a red-ink figure on every
 * row, so the card read as three alarms — on the one block whose whole point
 * is that each of these is fixable. Reported from a phone as flat and
 * alarming. The rows are now coloured by the SAME bands `/results` uses for a
 * score (`scoreBand` in `lib/results-view.ts`): amber under the pass line,
 * green over it, violet from «امتياز» up. So a 27% here and a 27% average on
 * «نتائجي» are the same colour, and neither is a verdict — amber is a place
 * on a road, the word `/results` chose for exactly this.
 *
 * ## Why the button is amber now
 *
 * It used to be `.chip--quiet`, on the argument that the resume card above
 * owns the screen's one filled amber button and three more would make four
 * primary actions. That still holds, and it is why these are `--accent` —
 * the OUTLINED amber weight — and not `--solid`: they read as buttons at a
 * glance (the ember chip read as a label), and they still lose to the one
 * filled action on the page.
 *
 * ## Why the all-clear state is separate from the empty one
 *
 * "We have not measured you yet" and "we measured you and you are fine" are
 * different facts. Collapsing them means a student who has mastered everything
 * is told the platform knows nothing about them — the worst possible reading
 * for the student who has earned the best one.
 */
export function MasteryCard({ mastery }: { mastery: StudentMastery }) {
  const hasWeak = mastery.weakest.length > 0;
  const measured = mastery.evaluated > 0;

  return (
    <section className="aside-card">
      <PanelHead
        icon={Target}
        hue="blue"
        title={c.title}
        // The lead describes ROWS; with none on screen it would describe
        // nothing, and the empty state below says what this card is for.
        lead={hasWeak ? c.lead : undefined}
        // Without this count, three rows read as "these are all the topics
        // that exist". It is the difference between a diagnosis and a
        // syllabus.
        meta={measured ? formatCopy(c.evaluatedCount, { n: mastery.evaluated }) : undefined}
      />

      <div className="aside-card__body">
        {hasWeak ? (
          <>
            <ul className="topic-list">
              {mastery.weakest.map((topic) => (
                <li key={topic.categoryId}>
                  <TopicRow topic={topic} />
                </li>
              ))}
            </ul>

            {mastery.pending > 0 ? (
              <p className="mt-3 text-[length:var(--fs-text-sm)] text-fg-muted">
                {formatCopy(c.pendingNote, { n: mastery.pending })}
              </p>
            ) : null}
          </>
        ) : (
          /* A drawing beside the sentence rather than above it: the old
             stacked `.empty` box was ~220px tall for two lines of text, in a
             column where every card already has a coloured header. */
          <div className="topic-empty">
            <SpotIllustration name="topics" />
            <p className="topic-empty__body">{measured ? c.allClearBody : c.emptyBody}</p>
          </div>
        )}

        <StrongLine topics={mastery.strongest} />
      </div>
    </section>
  );
}

function TopicRow({ topic }: { topic: MasteryTopic }) {
  const percent = topic.accuracyPercent;

  return (
    <div className="topic-row" data-band={scoreBand(percent)}>
      {/*
        `aria-hidden`, and so is the bar: the `sr-only` line below states the
        topic and the percentage in words. A `progressbar` role here would
        announce the same number a second time — the call `StatTile`
        documents at its own meter, made the same way.
      */}
      <span className="topic-row__score" aria-hidden="true">
        {percent}%
      </span>

      <span className="topic-row__title">{isolateLtrRuns(topic.name)}</span>

      <span className="topic-row__bar" aria-hidden="true">
        {/* Omitted entirely at zero rather than drawn at width 0: the fill
            carries a 3px floor so a 2% topic is still visible, and that floor
            would otherwise put ink on a bar that earned none. The tinted
            track is what a 0% row shows — see `.topic-row__bar`. */}
        {percent > 0 ? (
          <span className="topic-row__fill" style={{ inlineSize: `${Math.min(percent, 100)}%` }} />
        ) : null}
      </span>

      <span className="sr-only">
        {formatCopy(c.accessibleRow, { topic: topic.name, percent })}
      </span>

      {/* Both fields, not one. They are populated and nulled together by the
          service, but a row that renders a link to `/courses/null/lessons/…`
          because only one of them was checked is a 404 with a button on it.

          `.topic-row__link` stretches this link's hit area over the whole row
          without adding a second tab stop or a second accessible name — see
          study.css. A student aims at the topic's NAME, and tapping it used
          to do nothing at all. */}
      {topic.courseSlug && topic.lessonId ? (
        <Link
          href={`/courses/${topic.courseSlug}/lessons/${topic.lessonId}`}
          className="chip chip--accent topic-row__cta topic-row__link"
        >
          {c.reviewCta}
          {/* ← is FORWARD in a right-to-left page. */}
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

/** The mastered topics, one chip each. Renders nothing at all when there are
 *  none — an empty «نقط القوة:» label is worse than no label. */
function StrongLine({ topics }: { topics: readonly MasteryTopic[] }) {
  if (topics.length === 0) return null;

  return (
    <p className="topic-strong">
      <span>{c.strongLabel}</span>
      {topics.map((topic) => (
        <span key={topic.categoryId} className="topic-strong__item" data-band={scoreBand(topic.accuracyPercent)}>
          {isolateLtrRuns(topic.name)}{' '}
          <span className="topic-strong__value">{topic.accuracyPercent}%</span>
        </span>
      ))}
    </p>
  );
}
