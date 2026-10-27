import { arabicCount } from '@ayman/contracts/arabic-count';
import { guardianCopy as c } from '@ayman/contracts/copy/guardian';
import { formatCopy } from '@ayman/contracts/format';
import type { GuardianPaper, GuardianView } from '@ayman/contracts/guardian-view';
import { ScoreTrend } from '@/components/results/score-trend';
import { formatDate, mark } from '@/lib/guardian-view';
import { GuardianEmptyArt } from './guardian-art';
import { SectionHead } from './section-head';

/** Papers shown before «كل الدرجات» — a phone screen and a bit. */
const VISIBLE = 6;

type Verdict = 'passed' | 'failed' | 'pending';

/** A passed best stays passed whatever is being marked; otherwise a sitting on
 *  the teacher's desk is «لسه بيتصحح», never a fail — the same three-way rule
 *  the API counts with (`foldScores`). */
function verdictOf(paper: GuardianPaper): Verdict {
  if (paper.result?.passed) return 'passed';
  if (paper.pending) return 'pending';
  return 'failed';
}

/**
 * «الدرجات»: the trend line the student sees on «نتايجي» (same component,
 * same points — marked sittings only), then one row per paper. A paper still
 * being marked shows the marked part out of what it is worth and the rest as
 * an amount still coming — never a provisional total as if it were the mark.
 */
export function GuardianMarks({ quizzes }: { quizzes: GuardianView['quizzes'] }) {
  const papers = quizzes.papers;
  return (
    <section className="gd-section" data-tone="quizzes" aria-labelledby="gd-marks">
      <SectionHead
        id="gd-marks"
        title={c.marks.title}
        aside={
          papers.length > 0 ? (
            <ul className="gd-tally">
              {quizzes.passed > 0 ? (
                <li data-verdict="passed">{formatCopy(c.marks.passedCount, { count: quizzes.passed })}</li>
              ) : null}
              {quizzes.failed > 0 ? (
                <li data-verdict="failed">{formatCopy(c.marks.failedCount, { count: quizzes.failed })}</li>
              ) : null}
              {quizzes.pending > 0 ? (
                <li data-verdict="pending">{formatCopy(c.marks.pendingCount, { count: quizzes.pending })}</li>
              ) : null}
            </ul>
          ) : null
        }
      />

      {papers.length === 0 ? (
        <div className="gd-empty">
          <GuardianEmptyArt />
          <p className="gd-empty__title">{c.marks.emptyTitle}</p>
          <p className="gd-empty__body">{c.marks.emptyBody}</p>
        </div>
      ) : (
        <>
          {quizzes.series.length > 0 ? (
            <div className="rs gd-trend">
              <ScoreTrend series={quizzes.series} title={c.marks.trendTitle} />
            </div>
          ) : null}

          <ul className="gd-papers">
            {papers.slice(0, VISIBLE).map((paper) => (
              <PaperRow key={paper.lessonId} paper={paper} />
            ))}
          </ul>
          {papers.length > VISIBLE ? (
            <details className="gd-more">
              <summary>{formatCopy(c.marks.showAll, { count: papers.length })}</summary>
              <ul className="gd-papers">
                {papers.slice(VISIBLE).map((paper) => (
                  <PaperRow key={paper.lessonId} paper={paper} />
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}

function PaperRow({ paper }: { paper: GuardianPaper }) {
  const verdict = verdictOf(paper);
  const sittings = paper.sittings > 1 ? arabicCount(paper.sittings, c.marks.sittings) : '';

  return (
    <li className="gd-paper" data-kind={paper.kind} data-verdict={verdict}>
      <span className="gd-paper__kind">{c.marks.kind[paper.kind]}</span>
      <span className="gd-paper__main">
        <span className="gd-paper__title">{paper.title}</span>
        <span className="gd-paper__meta">
          {paper.courseTitle} · {formatDate(paper.lastSubmittedAt)}
        </span>
        {paper.pending && !paper.result ? (
          <span className="gd-paper__pending">
            {formatCopy(c.marks.pending, {
              score: mark(paper.pending.gradedScore),
              outOf: mark(paper.pending.gradedOutOf),
              rest: mark(paper.pending.pendingOutOf),
            })}
          </span>
        ) : null}
        {sittings ? <span className="gd-paper__meta">{sittings}</span> : null}
      </span>
      <span className="gd-paper__score">
        {paper.result ? (
          <>
            <span className="gd-paper__pct gd-num">{paper.result.percent}%</span>
            <span className="gd-paper__raw">
              {formatCopy(c.marks.score, { score: mark(paper.result.score), outOf: mark(paper.result.outOf) })}
            </span>
          </>
        ) : null}
        <span className="gd-verdict" data-verdict={verdict}>
          {c.marks.verdict[verdict]}
        </span>
      </span>
    </li>
  );
}
