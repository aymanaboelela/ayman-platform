import type { ReactNode } from 'react';
import Link from 'next/link';
import { Check, Lock, Play } from 'lucide-react';
import { copy, type LearningPath } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { CourseArt } from '@/components/course-art';
import { ExamLockedDialog } from '@/components/library/exam-locked-dialog';
import { LtrRatio } from '@/components/ltr-ratio';
import { CourseClosedDialog } from './course-closed-dialog';

const c = copy.path;

type PathCourse = LearningPath['courses'][number];
type PathNode = PathCourse['nodes'][number];

/** Lectures shown around the next one in the open course — see `windowOf`. */
const BEFORE = 1;
const AFTER = 3;

/**
 * «مساري» as a vertical timeline of courses — the shape the owner approved.
 *
 * It was a full map of stations per course, every course drawn open: four
 * courses of twelve stops was a screen of discs to scroll past to find where
 * the student is. Now each course is ONE card on a line (its art, its name,
 * how far, one button), and only the course they are in opens — to a few
 * short rows around the lecture that is next, not all forty.
 *
 * The rows are links into the lessons, so this still works as the path; the
 * full outline is one press away on the course page («كل المحاضرات»).
 */
export function PathTimeline({ path }: { path: LearningPath }) {
  const currentId = path.currentCourseId ?? path.courses[0]?.id ?? null;

  return (
    <ol className="ptl" aria-label={c.courses}>
      {path.courses.map((course, index) => (
        <CourseStep course={course} index={index} open={course.id === currentId} key={course.id} />
      ))}
      <li className="ptl__finish" aria-hidden="true">
        <span className="ptl__marker ptl__marker--finish">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
        <span>
          {c.finish} · {path.totalLessons}
        </span>
      </li>
    </ol>
  );
}

function CourseStep({ course, index, open }: { course: PathCourse; index: number; open: boolean }) {
  const done = course.totalLessons > 0 && course.clearedLessons === course.totalLessons;
  const next = course.nodes.find((node) => node.id === course.nextLessonId) ?? null;
  const n = index + 1;

  const marker = done ? (
    <span className="ptl__marker ptl__marker--done">
      <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
    </span>
  ) : (
    <span className={cn('ptl__marker', open ? 'ptl__marker--now' : 'ptl__marker--todo')}>{n}</span>
  );

  /* The one button. A closed course has none — its lessons 404 — and says why. */
  let action: ReactNode = null;
  if (!course.published) {
    action = <span className="ptl__badge">{c.closedBadge}</span>;
  } else if (done) {
    action = (
      <span className="chip chip--done">
        <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
        {course.contentComplete ? c.courseDone : c.courseUpToDate}
      </span>
    );
  } else if (next) {
    action = (
      <Link
        href={`/courses/${course.slug}/lessons/${next.lessonId}`}
        className={cn('chip', open ? 'chip--solid' : 'chip--quiet')}
        aria-label={`${course.clearedLessons > 0 ? c.timelineResume : c.timelineStart} — ${course.title}`}
      >
        {course.clearedLessons > 0 ? c.timelineResume : c.timelineStart}
      </Link>
    );
  }

  const head = (
    <div className="ptl__head">
      <span className="ptl__art" aria-hidden="true">
        <CourseArt coverKey={course.coverKey} subjectNameAr={course.subjectNameAr} seed={course.slug} compact sizes="5rem" />
      </span>
      <span className="ptl__text">
        <span className="ptl__eyebrow">
          {c.courseIndex.replace('{n}', String(n))}
          {open && !done ? ` · ${copy.player.units.youAreHere}` : ''}
        </span>
        {course.published ? (
          <Link href={`/library/${course.slug}`} className="ptl__title">
            {course.title}
          </Link>
        ) : (
          <span className="ptl__title">{course.title}</span>
        )}
        <span className="ptl__bar" aria-hidden="true">
          <span style={{ inlineSize: `${Math.min(100, Math.max(0, course.progressPercent))}%` }} />
        </span>
      </span>
      <span className="ptl__ratio">
        <LtrRatio value={course.clearedLessons} of={course.totalLessons} />
      </span>
      {action}
    </div>
  );

  return (
    <li className="ptl__step">
      {marker}
      <div className={cn('ptl__card', open && 'ptl__card--open', !course.published && 'ptl__card--closed')} id={`course-${course.id}`}>
        {head}
        {open && course.nodes.length > 0 ? <LessonWindow course={course} /> : null}
        {open && course.nodes.length === 0 ? <p className="ptl__empty">{c.nothingOpen}</p> : null}
      </div>
    </li>
  );
}

/**
 * The few rows around the next lecture: one behind it, three ahead, and a line
 * saying how many more there are. A course of forty lectures is not forty rows
 * on a page whose job is «where am I, what is next».
 */
function windowOf(nodes: readonly PathNode[], nextId: string | null) {
  const at = Math.max(0, nodes.findIndex((node) => node.id === nextId));
  const start = Math.max(0, at - BEFORE);
  const end = Math.min(nodes.length, at + AFTER + 1);
  return { rows: nodes.slice(start, end), hidden: nodes.length - (end - start) };
}

function LessonWindow({ course }: { course: PathCourse }) {
  const { rows, hidden } = windowOf(course.nodes, course.nextLessonId);
  const remaining = Math.max(0, course.totalLessons - course.clearedLessons);

  return (
    <ol className="ptl__rows">
      {rows.map((node) => (
        <LessonRow
          node={node}
          course={course}
          isNext={node.id === course.nextLessonId}
          remaining={remaining}
          key={node.id}
        />
      ))}
      {hidden > 0 && course.published ? (
        <li className="ptl__more">
          <span>{c.moreLessons.replace('{n}', String(hidden))}</span>
          <Link href={`/library/${course.slug}`}>{c.allLessons}</Link>
        </li>
      ) : null}
    </ol>
  );
}

function LessonRow({
  node,
  course,
  isNext,
  remaining,
}: {
  node: PathNode;
  course: PathCourse;
  isNext: boolean;
  remaining: number;
}) {
  const done = node.gate === 'cleared';
  const locked = node.gate === 'locked';
  const quiz = node.kind === 'quiz';

  const mark = (
    <span
      className={cn(
        'ptl__mark',
        done && 'ptl__mark--done',
        isNext && 'ptl__mark--now',
        locked && 'ptl__mark--locked',
        quiz && 'ptl__mark--quiz',
      )}
      aria-hidden="true"
    >
      {done ? <Check className="size-3" strokeWidth={3} /> : isNext ? <Play className="size-3" fill="currentColor" /> : locked ? <Lock className="size-3" /> : null}
    </span>
  );
  const className = cn('ptl__row', isNext && 'ptl__row--now', done && 'ptl__row--done');
  const href = `/courses/${course.slug}/lessons/${node.lessonId}`;

  if (!course.published) {
    return (
      <li>
        <CourseClosedDialog triggerClassName={className} triggerLabel={`${node.title} — ${c.closedBadge}`}>
          {mark}
          <span className="ptl__rowtitle">{node.title}</span>
        </CourseClosedDialog>
      </li>
    );
  }

  if (locked && node.isExam) {
    return (
      <li>
        <ExamLockedDialog
          remaining={remaining}
          total={course.totalLessons}
          triggerClassName={className}
          triggerLabel={`${node.title} — ${c.locked}`}
        >
          {mark}
          <span className="ptl__rowtitle">{node.title}</span>
          <span className="ptl__rowtag">{c.locked}</span>
        </ExamLockedDialog>
      </li>
    );
  }

  if (locked) {
    return (
      <li className={className}>
        {mark}
        <span className="ptl__rowtitle">{node.title}</span>
        <span className="ptl__rowtag">{c.locked}</span>
      </li>
    );
  }

  return (
    <li>
      <Link href={href} className={className} aria-current={isNext ? 'step' : undefined}>
        {mark}
        <span className="ptl__rowtitle">{node.title}</span>
        {isNext ? <span className="chip chip--solid ptl__rowchip">{c.timelineResume}</span> : null}
        {!isNext && node.isExam ? <span className="ptl__rowtag">{c.exam}</span> : null}
      </Link>
    </li>
  );
}
