import type { ComponentType, ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CalendarCheck2,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  CircleCheck,
  ClipboardCheck,
  Hourglass,
  Lock,
  NotebookPen,
  PartyPopper,
  PlayCircle,
  RotateCcw,
  Sparkles,
  Target,
} from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { RANK_POINTS, type CohortRank } from '@ayman/contracts/rank';
import type {
  RankNextExam,
  RankNextHomework,
  RankNextQuiz,
  RankNextQuizState,
  RankNextSteps,
} from '@ayman/contracts/rank-next';
import { quizHref } from '@/lib/quiz-links';

const c = copy.rank;

/** كام صف بيبان من غير ما يتفتح «وكمان». تلاتة بيملوا الكارت من غير ما يطوّلوه. */
const VISIBLE_ROWS = 3;

/**
 * `Africa/Cairo` ثابت، والتنسيق على السيرفر بس — نفس سبب `exam-countdown-band`:
 * السيرفر في الإنتاج UTC، وامتحان الساعة ٨ كان هيتطبع ٥.
 */
const stamp = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  timeZone: 'Africa/Cairo',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: 'numeric',
  minute: '2-digit',
});

const homeworkHref = (row: RankNextHomework) =>
  // `#homework` هو كارت الواجب تحت الفيديو (`LessonHomework`) — الطالب بينزل
  // عليه على طول بدل ما يدوّر عليه تحت المشغّل.
  `/courses/${encodeURIComponent(row.courseSlug)}/lessons/${row.lessonId}#homework`;

/**
 * «الطريق لفوق» — تلات كروت، وكل كارت بيودّي على اللي ناقص.
 *
 * كانت الكروت بتشرح النقط وبس («٤٠ نقطة على التسليم…») ومابتودّيش حتة. دلوقتي
 * تحت كل شرح: شريط بالعدد بيفتح أول حاجة، وصفوف كل واحد رابط لمكانه بالظبط
 * (الواجب تحت الفيديو، الكويز، الامتحان)، و«وكمان N» بيفتح الباقي في مكانه.
 * ولو الكارت فضي — كل الواجبات اتسلّمت — بيقولها، مش بيسيب فراغ.
 *
 * `steps = null` (الراوت ماردّش) بيرجّع الكروت زي ما كانت بالظبط: الشرح وشريط
 * العدد من `/api/me/rank`. الصفحة مابتقعش عشان حتة منها.
 *
 * كل صف اتعدّى على البوابة في السيرفر (`LessonAccessService.require`)، فمفيش
 * صف بيودّي على قفل. اللي مقفول باشتراك بيتقال عليه في سطر واحد بباب
 * الاشتراك.
 */
export function Climb({ data, steps }: { data: CohortRank; steps: RankNextSteps | null }) {
  // اسم الكورس جنب كل صف بس لو فيه أكتر من كورس — طالب في كورس واحد مش محتاج
  // يقرا اسمه تلات مرات.
  const courses = new Set(
    [
      ...(steps?.homework?.items ?? []),
      ...(steps?.quizzes.items ?? []),
      ...[steps?.exams?.next, steps?.exams?.last].filter((row) => row != null),
    ].map((row) => row.courseSlug),
  );
  const showCourse = courses.size > 1;

  return (
    <section className="mt-8" aria-labelledby="rk-climb-title">
      <div className="rk-climb__head">
        <div>
          <h2 id="rk-climb-title" className="rk-section-title">
            <Sparkles className="size-5" aria-hidden="true" />
            {c.climbTitle}
          </h2>
          <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.climbLead}</p>
        </div>
        <Link href="/path" className="rk-cta">
          {c.climbCta}
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <ul className="rk-climb">
        <HomeworkCard data={data} steps={steps} showCourse={showCourse} />
        <QuizCard data={data} steps={steps} showCourse={showCourse} />
        <ExamCard steps={steps} showCourse={showCourse} />
      </ul>

      {data.me.pendingReview > 0 ? (
        <p className="rk-pending">
          <Hourglass className="size-4" aria-hidden="true" />
          {formatCopy(c.climbPending, { count: data.me.pendingReview })}
        </p>
      ) : null}
    </section>
  );
}

function Tip({
  kind,
  icon: Icon,
  title,
  body,
  max,
  children,
}: {
  kind: 'homework' | 'quiz' | 'exam';
  icon: ComponentType<{ className?: string }>;
  title: string;
  body: string;
  max: number;
  children?: ReactNode;
}) {
  return (
    <li className="rk-tip" data-kind={kind}>
      <span className="rk-tip__icon" aria-hidden="true">
        <Icon className="size-5" />
      </span>
      <span className="rk-tip__badge">{formatCopy(c.upTo, { points: max })}</span>
      <h3 className="rk-tip__title">{title}</h3>
      <p className="rk-tip__body">{body}</p>
      {children}
    </li>
  );
}

/* ── الواجب ─────────────────────────────────────────────────────────────── */

function HomeworkCard({
  data,
  steps,
  showCourse,
}: {
  data: CohortRank;
  steps: RankNextSteps | null;
  showCourse: boolean;
}) {
  const hw = steps?.homework ?? null;
  // من غير الصفوف (الراوت ماردّش، أو الواجب مقفول على الستاك): نفس الشريط
  // اللي كان، من أرقام الترتيب.
  const owedLeft = data.me.homework.owed - data.me.homework.submitted;

  return (
    <Tip
      kind="homework"
      icon={NotebookPen}
      title={c.climbHomeworkTitle}
      body={formatCopy(c.climbHomeworkBody, {
        submitted: RANK_POINTS.homeworkSubmitted,
        accepted: RANK_POINTS.homeworkAcceptedMax,
      })}
      max={RANK_POINTS.homeworkSubmitted + RANK_POINTS.homeworkAcceptedMax}
    >
      {hw === null ? (
        owedLeft > 0 ? <p className="rk-tip__alert">{formatCopy(c.climbHomeworkOwed, { count: owedLeft })}</p> : null
      ) : hw.items.length === 0 ? (
        <>
          {/* «كله اتسلّم» بس لو اتسلّم حاجة فعلًا — طالب لسه ماعندوش ولا
              واجب مايتقالوش مبروك على حاجة ماعملهاش. */}
          {data.me.homework.submitted > 0 ? <Done>{c.climbHomeworkDone}</Done> : <Quiet>{c.climbHomeworkNone}</Quiet>}
          <Locked locked={hw.locked} />
        </>
      ) : (
        <>
          <Strip href={homeworkHref(hw.items[0]!)}>{formatCopy(c.climbHomeworkOwed, { count: hw.total })}</Strip>
          <Rows
            items={hw.items}
            total={hw.total}
            render={(row) => (
              <Step
                key={row.lessonId}
                href={homeworkHref(row)}
                glyph={row.status === 'needs_work' ? RotateCcw : NotebookPen}
                tone={row.status === 'needs_work' ? 'warn' : 'go'}
                title={row.lessonTitle}
                course={showCourse ? row.courseTitle : null}
                chips={
                  row.status === 'needs_work' ? (
                    <>
                      <Chip tone="warn">{c.climbHomeworkRedo}</Chip>
                      <Chip tone="go">{c.climbHomeworkRedoCta}</Chip>
                    </>
                  ) : (
                    <Chip tone="go">{c.climbHomeworkUpload}</Chip>
                  )
                }
              />
            )}
          />
          <Locked locked={hw.locked} />
        </>
      )}
    </Tip>
  );
}

/* ── الكويز ─────────────────────────────────────────────────────────────── */

const QUIZ_GLYPH: Record<RankNextQuizState, ComponentType<{ className?: string }>> = {
  resume: PlayCircle,
  new: Target,
  retake: RotateCcw,
  upcoming: CalendarClock,
  grading: Hourglass,
  spent: ClipboardCheck,
};

/** الحالة بتتقال مرة واحدة: شيب بالحالة، وشيب تاني بالفعل لو فيه حاجة تتعمل. */
function quizChips(state: RankNextQuizState): ReactNode {
  switch (state) {
    case 'resume':
      return (
        <>
          <Chip tone="warn">{c.climbQuizResume}</Chip>
          <Chip tone="go">{c.climbQuizResumeCta}</Chip>
        </>
      );
    case 'new':
      return (
        <>
          <Chip tone="muted">{c.climbQuizNew}</Chip>
          <Chip tone="go">{c.climbQuizNewCta}</Chip>
        </>
      );
    case 'retake':
      return <Chip tone="go">{c.climbQuizRetakeCta}</Chip>;
    case 'upcoming':
      return <Chip tone="muted">{c.climbQuizUpcoming}</Chip>;
    case 'grading':
      return <Chip tone="info">{c.climbQuizGrading}</Chip>;
    case 'spent':
      // مفيش فعل: الصف بيودّي على صفحة الكويز، واللي فيها المراجعة.
      return <Chip tone="muted">{c.climbQuizSpent}</Chip>;
  }
}

function QuizCard({
  data,
  steps,
  showCourse,
}: {
  data: CohortRank;
  steps: RankNextSteps | null;
  showCourse: boolean;
}) {
  const quizzes = steps?.quizzes ?? null;
  const first = quizzes?.items.find((row) => row.state === 'resume' || row.state === 'new' || row.state === 'retake');

  return (
    <Tip
      kind="quiz"
      icon={Target}
      title={c.climbQuizTitle}
      body={formatCopy(c.climbQuizBody, { bonus: RANK_POINTS.quizFullMarkBonus })}
      max={100 * RANK_POINTS.quizPerPercent + RANK_POINTS.quizFullMarkBonus}
    >
      {quizzes === null ? null : quizzes.items.length === 0 ? (
        <>
          {data.me.quizzes.count > 0 ? <Done>{c.climbQuizDone}</Done> : <Quiet>{c.climbQuizNone}</Quiet>}
          <Locked locked={quizzes.locked} />
        </>
      ) : (
        <>
          {first && quizzes.actionable > 0 ? (
            <Strip href={quizHref(first.lessonId)}>{formatCopy(c.climbQuizOwed, { count: quizzes.actionable })}</Strip>
          ) : null}
          <Rows
            items={quizzes.items}
            total={quizzes.total}
            render={(row: RankNextQuiz) => (
              <Step
                key={row.lessonId}
                href={quizHref(row.lessonId)}
                glyph={QUIZ_GLYPH[row.state]}
                tone={row.state === 'spent' || row.state === 'upcoming' ? 'muted' : row.state === 'grading' ? 'info' : 'go'}
                title={row.title}
                course={showCourse ? row.courseTitle : null}
                chips={
                  <>
                    {row.bestPercent !== null && row.state !== 'grading' ? (
                      <Chip tone="score">
                        {c.climbQuizBest} <Num>{`${formatPercent(row.bestPercent)}%`}</Num>
                      </Chip>
                    ) : null}
                    {quizChips(row.state)}
                  </>
                }
              />
            )}
          />
          <Locked locked={quizzes.locked} />
        </>
      )}
    </Tip>
  );
}

/* ── امتحان الشهر ───────────────────────────────────────────────────────── */

function ExamCard({ steps, showCourse }: { steps: RankNextSteps | null; showCourse: boolean }) {
  const exams = steps?.exams ?? null;

  return (
    <Tip
      kind="exam"
      icon={CalendarCheck2}
      title={c.climbExamTitle}
      body={formatCopy(c.climbExamBody, {
        bonus: RANK_POINTS.examFullMarkBonus,
        max: 100 * RANK_POINTS.examPerPercent + RANK_POINTS.examFullMarkBonus,
      })}
      max={100 * RANK_POINTS.examPerPercent + RANK_POINTS.examFullMarkBonus}
    >
      {exams === null ? null : (
        <>
          {exams.next ? <NextExam exam={exams.next} showCourse={showCourse} /> : <NotYet />}
          {exams.last ? <LastExam exam={exams.last} showCourse={showCourse} /> : null}
        </>
      )}
    </Tip>
  );
}

/**
 * الامتحان الجاي — أكبر حاجة في الكارت، لأن ده الوحيد اللي عليه ميعاد. الكتلة
 * كلها رابط واحد: الطالب يضغط في أي حتة.
 */
function NextExam({ exam, showCourse }: { exam: RankNextExam; showCourse: boolean }) {
  const open = exam.phase === 'open';
  const status = !open
    ? exam.openFrom
      ? formatCopy(c.climbExamOpens, { when: stamp.format(new Date(exam.openFrom)) })
      : c.climbQuizUpcoming
    : exam.state === 'retake'
      ? c.climbExamRetake
      : c.climbExamOpen;
  const closes = open && exam.openUntil ? formatCopy(c.climbExamCloses, { when: stamp.format(new Date(exam.openUntil)) }) : null;
  const cta = exam.state === 'resume' ? c.climbExamResumeCta : c.climbExamOpenCta;

  return (
    <Link href={quizHref(exam.lessonId)} className="rk-exam" data-open={open || undefined}>
      <span className="rk-exam__eyebrow">{c.climbExamNext}</span>
      <span className="rk-exam__title">{exam.title}</span>
      {showCourse ? <span className="rk-exam__course">{exam.courseTitle}</span> : null}
      <span className="rk-exam__status">
        {open ? <span className="rk-exam__live" aria-hidden="true" /> : <CalendarClock className="size-4" aria-hidden="true" />}
        {status}
      </span>
      {closes ? <span className="rk-exam__when">{closes}</span> : null}
      {open ? (
        <span className="rk-exam__cta">
          {cta}
          <ArrowLeft className="size-4" aria-hidden="true" />
        </span>
      ) : null}
    </Link>
  );
}

function NotYet() {
  return (
    <p className="rk-exam rk-exam--empty">
      <CalendarClock className="size-5" aria-hidden="true" />
      {c.climbExamNotYet}
    </p>
  );
}

function LastExam({ exam, showCourse }: { exam: RankNextExam; showCourse: boolean }) {
  const full = exam.bestPercent !== null && exam.bestPercent >= 100;
  return (
    <ol className="rk-steps" aria-label={c.climbExamLast}>
      <Step
        href={quizHref(exam.lessonId)}
        glyph={exam.state === 'grading' ? Hourglass : full ? CircleCheck : ClipboardCheck}
        tone={exam.state === 'grading' ? 'info' : full ? 'done' : 'muted'}
        title={exam.title}
        eyebrow={c.climbExamLast}
        course={showCourse ? exam.courseTitle : null}
        chips={
          exam.state === 'grading' ? (
            <Chip tone="info">{c.climbExamGrading}</Chip>
          ) : exam.bestPercent !== null ? (
            <>
              <Chip tone="score">
                <Num>{`${formatPercent(exam.bestPercent)}%`}</Num>
              </Chip>
              {full ? <Chip tone="done">{c.climbExamFull}</Chip> : null}
            </>
          ) : (
            <Chip tone="muted">{c.climbQuizSpentCta}</Chip>
          )
        }
      />
    </ol>
  );
}

/* ── الأجزاء المشتركة ───────────────────────────────────────────────────── */

/** الشريط بالعدد — أول حاجة بتتقري في الكارت، وبيفتح أول صف. */
function Strip({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="rk-tip__alert rk-tip__alert--link">
      <span>{children}</span>
      <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
    </Link>
  );
}

/**
 * أول `VISIBLE_ROWS` ظاهرين، والباقي جوّه `<details>` — بيتفتح في مكانه من غير
 * جافاسكريبت ولا صفحة تانية. ولو الصفوف اللي وصلت أقل من العدد الكلي (السيرفر
 * بيبعت ٢٠ بالكتير)، آخر حاجة رابط للمسار.
 */
function Rows<T>({ items, total, render }: { items: readonly T[]; total: number; render: (row: T) => ReactNode }) {
  const head = items.slice(0, VISIBLE_ROWS);
  const rest = items.slice(VISIBLE_ROWS);
  const beyond = total - items.length;

  return (
    <>
      <ol className="rk-steps">{head.map(render)}</ol>
      {rest.length > 0 ? (
        <details className="rk-more">
          <summary className="rk-more__toggle">
            <span className="rk-more__open">{formatCopy(c.climbMore, { count: rest.length + Math.max(0, beyond) })}</span>
            <span className="rk-more__close">{c.climbLess}</span>
            <ChevronDown className="rk-more__chev size-4" aria-hidden="true" />
          </summary>
          <ol className="rk-steps">{rest.map(render)}</ol>
          {beyond > 0 ? (
            <Link href="/path" className="rk-more__path">
              {formatCopy(c.climbMore, { count: beyond })}
              <span aria-hidden="true">·</span>
              {c.climbCta}
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Link>
          ) : null}
        </details>
      ) : null}
    </>
  );
}

type Tone = 'go' | 'warn' | 'info' | 'muted' | 'done' | 'score';

function Step({
  href,
  glyph: Glyph,
  tone,
  title,
  eyebrow,
  course,
  chips,
}: {
  href: string;
  glyph: ComponentType<{ className?: string }>;
  tone: Exclude<Tone, 'score'>;
  title: string;
  eyebrow?: string;
  course: string | null;
  chips: ReactNode;
}) {
  return (
    <li>
      <Link href={href} className="rk-step" data-tone={tone}>
        <span className="rk-step__glyph" aria-hidden="true">
          <Glyph className="size-4" />
        </span>
        <span className="rk-step__main">
          {eyebrow ? <span className="rk-step__eyebrow">{eyebrow}</span> : null}
          <span className="rk-step__title">{title}</span>
          <span className="rk-step__chips">
            {chips}
            {course ? <span className="rk-step__course">{course}</span> : null}
          </span>
        </span>
        <ChevronLeft className="rk-step__chev" aria-hidden="true" />
      </Link>
    </li>
  );
}

function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className="rk-chip-sm" data-tone={tone}>
      {children}
    </span>
  );
}

/** رقم لاتيني جوّه جملة عربي: لازم يتعزل وإلا «70%» بتتقلب «%70». */
function Num({ children }: { children: ReactNode }) {
  return <span className="rk-num">{children}</span>;
}

function Done({ children }: { children: ReactNode }) {
  return (
    <p className="rk-done">
      <PartyPopper className="size-5 shrink-0" aria-hidden="true" />
      <span>
        {children} <span aria-hidden="true">🎉</span>
      </span>
    </p>
  );
}

/** فاضي من غير ما يكون اتقفل: جملة هادية، من غير احتفال. */
function Quiet({ children }: { children: ReactNode }) {
  return (
    <p className="rk-done" data-quiet="">
      <CircleCheck className="size-5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** المقفول باشتراك: سطر واحد بالعدد وباب الاشتراك، مش صفوف بتفتح على قفل. */
function Locked({ locked }: { locked: { count: number; courseSlug: string } | null }) {
  if (locked === null) return null;
  return (
    <Link href={`/library/${encodeURIComponent(locked.courseSlug)}`} className="rk-locked">
      <Lock className="size-4 shrink-0" aria-hidden="true" />
      <span>
        {formatCopy(c.climbLocked, { count: locked.count })}
        <span className="rk-locked__cta">{c.climbLockedCta}</span>
      </span>
      <ChevronLeft className="size-4 shrink-0" aria-hidden="true" />
    </Link>
  );
}

function formatPercent(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
