import Link from 'next/link';
import { copy, formatCopy, type MasteryTopic, type StudentMastery } from '@ayman/contracts';
import { SpotIllustration } from './spot-illustration';

const c = copy.dashboard.mastery;

/**
 * «ذاكر ده» — the three topics whose marks the student is losing most of, and
 * a way into the lesson that taught each.
 *
 * ## What it is for
 *
 * Every other block on this page describes a QUANTITY: how many courses, how
 * many lessons, what average. This is the only one that names a CAUSE, and the
 * only one whose rows a student can act on one at a time. Before it, the most
 * specific answer the dashboard could give to "what should I study" was "the
 * video you paused".
 *
 * ## Why red is licensed here
 *
 * `--err` holds the same meaning it holds on `.verdict--fail` three sections
 * below on this same page: marks that were not collected. See the colour note
 * in `study.css` — the rule is "a graded outcome and nothing else", and every
 * figure on this card is computed from marks.
 *
 * ## Why the buttons are quiet
 *
 * Three of them on one card, and the resume card directly above owns the
 * screen's single accent-filled button. Three amber buttons here would make
 * four primary actions on one screen, which is the exact failure the dashboard
 * rebuild exists to have removed.
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
    <section>
      <div className="group-head">
        <span className="group-head__mark" aria-hidden="true" />
        <h2 className="group-head__title">{c.title}</h2>
        {/* Without this count, three rows read as "these are all the topics
            that exist". It is the difference between a diagnosis and a
            syllabus. */}
        {measured ? (
          <span className="group-head__count">
            {formatCopy(c.evaluatedCount, { n: mastery.evaluated })}
          </span>
        ) : null}
      </div>

      {hasWeak ? (
        <>
          <ul className="space-y-2">
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

          <StrongLine topics={mastery.strongest} />
        </>
      ) : (
        /* Ember-tinted with a drawing rather than a dashed neutral box, for
           the reason the empty course grid gives: a dashed grey rectangle is
           indistinguishable from something that failed to load. */
        <div className="empty">
          <SpotIllustration name="topics" />
          <p className="empty__body">{measured ? c.allClearBody : c.emptyBody}</p>
          <StrongLine topics={mastery.strongest} />
        </div>
      )}
    </section>
  );
}

function TopicRow({ topic }: { topic: MasteryTopic }) {
  return (
    <div className="topic-row">
      <span className="topic-row__text">
        <span className="topic-row__title">{topic.name}</span>
        {/*
          `aria-hidden`, and so is the figure beside it: the `sr-only` line
          below states the topic and the percentage in words. A `progressbar`
          role here would announce the same number a second time — the call
          `StatTile` documents at its own meter, made the same way.
        */}
        <span className="topic-row__bar" aria-hidden="true">
          {/* Omitted entirely at zero rather than drawn at width 0: the fill
              carries a 3px floor so a 2% topic is still visible, and that floor
              would otherwise put ink on a bar that earned none. The washed
              track is what a 0% row shows — see `.topic-row__bar`. */}
          {topic.accuracyPercent > 0 ? (
            <span
              className="topic-row__fill"
              style={{ inlineSize: `${Math.min(topic.accuracyPercent, 100)}%` }}
            />
          ) : null}
        </span>
      </span>

      <span className="topic-row__value" aria-hidden="true">
        {topic.accuracyPercent}%
      </span>

      <span className="sr-only">
        {formatCopy(c.accessibleRow, { topic: topic.name, percent: topic.accuracyPercent })}
      </span>

      {/* Both fields, not one. They are populated and nulled together by the
          service, but a row that renders a link to `/courses/null/lessons/…`
          because only one of them was checked is a 404 with a button on it. */}
      {topic.courseSlug && topic.lessonId ? (
        <Link
          href={`/courses/${topic.courseSlug}/lessons/${topic.lessonId}`}
          className="chip chip--quiet flex-shrink-0"
        >
          {c.reviewCta}
        </Link>
      ) : null}
    </div>
  );
}

/** The mastered topics. Renders nothing at all when there are none — an empty
 *  «متمكّن في:» label is worse than no label. */
function StrongLine({ topics }: { topics: readonly MasteryTopic[] }) {
  if (topics.length === 0) return null;

  return (
    <p className="topic-strong">
      <span>{c.strongLabel}</span>
      {topics.map((topic) => (
        <span key={topic.categoryId} className="topic-strong__item">
          {topic.name} {topic.accuracyPercent}%
        </span>
      ))}
    </p>
  );
}
