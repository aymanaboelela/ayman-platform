import Link from 'next/link';
import { CheckCircle2, ClipboardList, ListChecks, PenLine, Target } from 'lucide-react';
import { AdminAttemptListSchema, type AdminAttemptRow } from '@ayman/contracts/admin/attempts';
import { arabicCount } from '@ayman/contracts/arabic-count';
import { copy } from '@ayman/contracts/copy/admin';
import { adminStudentPanel as c } from '@ayman/contracts/copy/admin-student-panel';
import { formatCopy, formatMark } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';
import { adminGetOrForbidden } from '@/lib/admin-api';
import { can, getSession } from '@/lib/session';
import { formatCairoShort } from '@/components/admin/exams/exam-time';
import { AttemptActions } from '@/components/admin/quiz/attempt-actions';
import { AttemptReviewDialog } from '../../../outreach/attempt-review-dialog';
import { wholePercent } from '../../../attempts/format';
import { STATE_LABEL, STATE_WASH, WASH } from '../../../attempts/labels';
import { KindChip } from '../../../attempts/quiz-card';
import { ExtraAttemptButton } from './extra-attempt-button';
import { ScoreEditor } from './score-editor';
import { groupAttemptsByExam, summarizeExams, type ExamGroup } from './exam-groups';
import { PanelNotice } from './panel-notice';

const b = copy.quizAdmin.board;

/** `perPage` must be one of `PAGE_SIZES`; 100 is the largest, and a student
 *  with more sittings than that sees the newest hundred plus a way to the
 *  full list. */
const PER_PAGE = 100;

/**
 * «الامتحانات» — every exam this student sat, its mark, and «اعمله محاولة».
 *
 * One card per EXAM (see `groupAttemptsByExam`), the newest sitting's mark
 * large on it, the earlier sittings as a strip under the title. The actions
 * are the attempts screen's own — the paper in the same popup, the same
 * reopen / extra-time controls — with «محاولة جديدة» lifted out of the fold,
 * because here it is the reason the tab was opened.
 *
 * Each action renders only for the permission the API checks behind it
 * (`attempt:grade`, `attempt:unlock`), the rule `AttemptRow` follows.
 */
export async function ExamsTab({ userId }: { userId: string }) {
  let list;
  try {
    list = await adminGetOrForbidden(
      `/api/admin/attempts?userId=${encodeURIComponent(userId)}&perPage=${PER_PAGE}&sort=newest`,
      AdminAttemptListSchema,
    );
  } catch {
    return <PanelNotice title={c.unavailable} />;
  }
  if (list === null) {
    return <PanelNotice title={copy.admin.settings.panelForbidden} hint={copy.admin.settings.panelForbiddenHint} />;
  }

  const session = await getSession();
  const abilities = { grade: can(session, 'attempt:grade'), unlock: can(session, 'attempt:unlock') };

  const groups = groupAttemptsByExam(list.rows);
  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-8 text-center">
        <span aria-hidden="true" className={cn('mx-auto grid size-12 place-items-center rounded-2xl', WASH.info)}>
          <ClipboardList className="size-6" />
        </span>
        <p className="mt-3 font-semibold text-fg">{c.exams.empty}</p>
        <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.exams.emptyHint}</p>
      </div>
    );
  }

  const summary = summarizeExams(groups);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile icon={ClipboardList} tone="info" label={c.exams.sat} value={String(summary.sat)} />
        <SummaryTile
          icon={Target}
          tone="accent"
          label={c.exams.average}
          value={summary.average === null ? '—' : `${wholePercent(summary.average)}%`}
        />
        <SummaryTile icon={CheckCircle2} tone="ok" label={c.exams.passed} value={String(summary.passed)} />
        <SummaryTile icon={PenLine} tone="warn" label={c.exams.pending} value={String(summary.pending)} />
      </div>

      <ul className="flex flex-col gap-3">
        {groups.map((group) => (
          <li key={group.quizId}>
            <ExamCard group={group} userId={userId} abilities={abilities} />
          </li>
        ))}
      </ul>

      {list.rowCount > list.rows.length ? (
        <p className="text-center text-[length:var(--fs-text-sm)] text-fg-muted">
          {formatCopy(c.exams.capped, { n: list.rows.length })}{' '}
          <Link href="/admin/attempts" className="font-medium text-accent-text underline-offset-2 hover:underline">
            {c.exams.allAttempts}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function SummaryTile({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: typeof Target;
  tone: keyof typeof WASH;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3">
      <span aria-hidden="true" className={cn('grid size-9 shrink-0 place-items-center rounded-xl', WASH[tone])}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[length:var(--fs-title-4)] font-bold leading-tight text-fg tabular-nums">{value}</p>
        <p className="truncate text-[length:var(--fs-text-xs)] text-fg-muted">{label}</p>
      </div>
    </div>
  );
}

/** The colour a sitting's mark is painted: green pass, red fail, amber for a
 *  paper waiting on its marker, grey for one with no verdict yet. */
function markTone(row: AdminAttemptRow): 'ok' | 'err' | 'accent' | 'neutral' {
  if (row.state === 'pending_review') return 'accent';
  if (row.passed === null) return 'neutral';
  return row.passed ? 'ok' : 'err';
}

const RING_COLOR = {
  ok: 'var(--ok)',
  err: 'var(--err)',
  accent: 'var(--color-accent)',
  neutral: 'var(--color-fg-faint)',
} as const;

function ExamCard({
  group,
  userId,
  abilities,
}: {
  group: ExamGroup;
  userId: string;
  abilities: { grade: boolean; unlock: boolean };
}) {
  const { latest } = group;
  const tone = markTone(latest);
  const handedIn = latest.state === 'submitted' || latest.state === 'pending_review';
  const toGrade = latest.state === 'pending_review' && abilities.grade;
  /* Every sitting the API will let him re-mark — `overrideScore` refuses an
     open one (`attempt_not_finished`). Newest first, so the editor opens on
     the sitting the ring is showing. */
  const editable = group.attempts
    .filter((row) => row.state === 'submitted' || row.state === 'pending_review')
    .map((row) => ({ id: row.id, attemptNumber: row.attemptNumber, score: row.score, gradeOutOf: row.gradeOutOf }));

  return (
    <article
      className={cn(
        'flex gap-4 rounded-2xl border bg-surface-2 p-4',
        latest.state === 'pending_review' ? 'border-accent/40' : 'border-line',
      )}
    >
      <ScoreRing row={latest} tone={tone} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <KindChip kind={latest.kind} lectureNumber={null} />
          <span className="rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted tabular-nums">
            {arabicCount(group.attempts.length, c.exams.attempts)}
          </span>
          <span
            className={cn('rounded-full px-2 py-0.5 text-[length:var(--fs-text-xs)] font-medium', WASH[STATE_WASH[latest.state]])}
          >
            {STATE_LABEL[latest.state]}
          </span>
          {latest.paper === 'improvement' ? (
            <span className={cn('rounded-full px-2 py-0.5 text-[length:var(--fs-text-xs)] font-medium', WASH.accent)}>
              {b.improvementPaper}
            </span>
          ) : null}
        </div>

        <h4 className="mt-1.5 font-semibold text-fg">{latest.lessonTitle}</h4>
        <p className="mt-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
          {latest.courseTitle} · {latest.sectionTitle}
        </p>
        <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-faint tabular-nums">
          {formatCopy(c.exams.latestAt, { at: formatCairoShort(latest.startedAt) })}
        </p>

        {/* The earlier sittings, oldest first so the strip reads as a
            progression toward the mark on the ring. */}
        {group.attempts.length > 1 ? (
          <ol className="mt-2 flex flex-wrap gap-1.5">
            {[...group.attempts].reverse().map((row) => (
              <li
                key={row.id}
                className={cn(
                  'rounded-md px-2 py-0.5 text-[length:var(--fs-text-xs)] font-medium tabular-nums',
                  WASH[markTone(row)],
                )}
              >
                {formatCopy(c.exams.attemptMark, {
                  n: row.attemptNumber,
                  mark:
                    row.score === null || row.state === 'pending_review'
                      ? '—'
                      : `${formatMark(row.score)}/${formatMark(row.gradeOutOf)}`,
                })}
              </li>
            ))}
          </ol>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {abilities.unlock ? <ExtraAttemptButton quizId={latest.quizId} userId={userId} /> : null}
          {handedIn ? <AttemptReviewDialog attemptId={latest.id} /> : null}
          {abilities.grade && editable.length > 0 ? <ScoreEditor sittings={editable} /> : null}
          {/* The marking screen, question by question — for a paper waiting
              on an essay it is THE action («تصحيح الورقة»); for a marked one
              it is how a single answer's mark is changed rather than the
              total. */}
          {abilities.grade && handedIn ? (
            <Link
              href={`/admin/grading/${latest.id}`}
              className={
                toGrade
                  ? 'chip chip--solid'
                  : 'inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[length:var(--fs-text-sm)] font-medium text-fg transition-colors duration-[160ms] ease-out hover:border-accent/50'
              }
            >
              {toGrade ? null : <ListChecks className="size-4" aria-hidden="true" />}
              {toGrade ? b.grade : c.exams.gradePaper}
            </Link>
          ) : null}
          {abilities.unlock ? (
            <details className="min-w-0 open:basis-full">
              <summary className="cursor-pointer select-none rounded-md px-1 py-1 text-[length:var(--fs-text-xs)] text-fg-muted hover:text-fg">
                {c.exams.moreActions}
              </summary>
              <div className="mt-2">
                <AttemptActions attemptId={latest.id} quizId={latest.quizId} userId={userId} canReopen={handedIn} />
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/**
 * The newest sitting's mark as a ring that fills to its percent — the one
 * thing on the card readable from across the room. A paper waiting on an
 * essay shows no number (its score counts the essay as zero; see
 * `AttemptScore`), and an open one shows a dash.
 */
function ScoreRing({ row, tone }: { row: AdminAttemptRow; tone: keyof typeof RING_COLOR }) {
  const percent = row.state === 'pending_review' ? null : row.percent;
  const fill = percent === null ? 0 : Math.max(0, Math.min(100, percent));

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div
        className="grid size-[4.5rem] place-items-center rounded-full"
        style={{
          // The track is the verdict's own colour, washed — so a 0% fail still
          // reads red, not as an empty grey circle.
          background: `conic-gradient(${RING_COLOR[tone]} ${fill}%, color-mix(in oklch, ${RING_COLOR[tone]}, transparent 82%) 0)`,
        }}
      >
        <div className="grid size-[3.6rem] place-items-center rounded-full bg-surface-2">
          <span className="text-[length:var(--fs-text-base)] font-bold text-fg tabular-nums">
            {percent === null ? (row.state === 'pending_review' ? '…' : '—') : `${wholePercent(percent)}%`}
          </span>
        </div>
      </div>
      <span className="text-[length:var(--fs-text-xs)] text-fg-muted tabular-nums">
        {row.state === 'pending_review'
          ? b.pendingScore
          : row.score === null
            ? '—'
            : formatCopy(b.scoreOf, { score: formatMark(row.score), outOf: formatMark(row.gradeOutOf) })}
      </span>
    </div>
  );
}
