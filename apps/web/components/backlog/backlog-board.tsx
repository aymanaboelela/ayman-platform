'use client';

import { useState, type ComponentType } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCheck,
  CirclePlay,
  ClipboardPen,
  Hourglass,
  Layers,
  ListChecks,
  Route,
  Trophy,
  type LucideProps,
} from 'lucide-react';
import { arabicCount } from '@ayman/contracts/arabic-count';
import type { BacklogCourse, BacklogItem, BacklogItemKind, StudentBacklog } from '@ayman/contracts/backlog';
import { backlogCopy } from '@ayman/contracts/copy/backlog';
import { CourseArt, SubjectMark } from '@/components/course-art';
import { CountUp } from '@/components/rank/count-up';

const c = backlogCopy;

type Filter = 'all' | 'lectures' | 'quizzes' | 'homework';

/** Which tile a row belongs to. The exam rides with the quizzes: both are a
 *  sitting waiting to be taken, and a fourth tile for a single row is noise. */
const FILTER_OF: Record<BacklogItemKind, Exclude<Filter, 'all'>> = {
  lecture: 'lectures',
  quiz: 'quizzes',
  exam: 'quizzes',
  homework: 'homework',
};

const KIND_ICON: Record<BacklogItemKind, ComponentType<LucideProps>> = {
  lecture: CirclePlay,
  quiz: ListChecks,
  exam: Trophy,
  homework: ClipboardPen,
};

function statusLabel(item: BacklogItem): string {
  switch (item.kind) {
    case 'lecture':
      return item.status === 'in_progress' ? c.status.lectureStarted : c.status.lectureNew;
    case 'quiz':
      return item.status === 'in_progress' ? c.status.quizStarted : c.status.quizNew;
    case 'exam':
      return item.status === 'in_progress' ? c.status.quizStarted : c.status.examOpen;
    case 'homework':
      return item.status === 'redo' ? c.status.homeworkRedo : c.status.homeworkNew;
  }
}

function actionLabel(item: BacklogItem): string {
  switch (item.kind) {
    case 'lecture':
      return item.status === 'in_progress' ? c.action.resume : c.action.watch;
    case 'quiz':
      return c.action.quiz;
    case 'exam':
      return c.action.exam;
    case 'homework':
      return item.status === 'redo' ? c.action.homeworkRedo : c.action.homework;
  }
}

/** The lesson page; homework lands on its own card under the video
 *  (`#homework`, the same anchor «الطريق لفوق» in `/rank` uses). */
function itemHref(item: BacklogItem): string {
  const page = `/courses/${encodeURIComponent(item.courseSlug)}/lessons/${item.lessonId}`;
  return item.kind === 'homework' ? `${page}#homework` : page;
}

export function BacklogBoard({ backlog }: { backlog: StudentBacklog }) {
  const [filter, setFilter] = useState<Filter>('all');
  const { counts } = backlog;
  const total = counts.lectures + counts.quizzes + counts.homework;

  if (total === 0) return <BacklogClear awaiting={counts.awaitingReview} />;

  const tiles: { key: Filter; label: string; n: number; icon: ComponentType<LucideProps> }[] = [
    { key: 'all', label: c.stats.all, n: total, icon: Layers },
    { key: 'lectures', label: c.stats.lectures, n: counts.lectures, icon: CirclePlay },
    { key: 'quizzes', label: c.stats.quizzes, n: counts.quizzes, icon: ListChecks },
    { key: 'homework', label: c.stats.homework, n: counts.homework, icon: ClipboardPen },
  ];

  const courses = backlog.courses
    .map((course) => ({
      ...course,
      items: filter === 'all' ? course.items : course.items.filter((item) => FILTER_OF[item.kind] === filter),
    }))
    .filter((course) => course.items.length > 0);

  return (
    <>
      <section className="bl-hero">
        <div className="bl-hero__shapes" aria-hidden="true">
          <span className="bl-shape bl-shape--ring" />
          <span className="bl-shape bl-shape--blob" />
        </div>
        <span className="bl-hero__pill">
          <Hourglass className="size-3.5" aria-hidden="true" />
          {c.hero.pill}
        </span>
        <p className="bl-hero__total">
          <span className="bl-hero__num">
            <CountUp to={total} />
          </span>
          <span className="bl-hero__label">{arabicCount(total, c.hero.total)}</span>
        </p>
        {counts.awaitingReview > 0 ? (
          <span className="bl-hero__chip">
            <CheckCheck className="size-3.5" aria-hidden="true" />
            {arabicCount(counts.awaitingReview, c.hero.awaiting)}
          </span>
        ) : null}
      </section>

      <div className="bl-tiles" role="group" aria-label={c.stats.filterLabel}>
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <button
              key={tile.key}
              type="button"
              className="bl-tile"
              data-tile={tile.key}
              aria-pressed={filter === tile.key}
              onClick={() => setFilter(tile.key)}
            >
              <span className="bl-tile__icon" aria-hidden="true">
                <Icon className="size-5" />
              </span>
              <span className="bl-tile__n">{tile.n}</span>
              <span className="bl-tile__label">{tile.label}</span>
            </button>
          );
        })}
      </div>

      {courses.length === 0 ? (
        <p className="bl-empty-filter">{c.filteredEmpty}</p>
      ) : (
        <div className="bl-courses">
          {courses.map((course) => (
            <BacklogCourseCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </>
  );
}

function BacklogCourseCard({ course }: { course: BacklogCourse }) {
  return (
    <section className="bl-course" aria-labelledby={`bl-${course.id}`}>
      <header className="bl-course__head">
        <span className="bl-course__art" aria-hidden="true">
          <CourseArt coverKey={course.coverKey} subjectNameAr={course.subjectNameAr} seed={course.slug} compact />
        </span>
        <SubjectMark subjectNameAr={course.subjectNameAr} className="size-10 shrink-0 sm:hidden" />
        <div className="min-w-0 flex-1">
          <h2 id={`bl-${course.id}`} className="bl-course__title">
            {course.title}
          </h2>
          <span className="bl-course__count">{arabicCount(course.items.length, c.course.count)}</span>
        </div>
        <Link href={`/library/${encodeURIComponent(course.slug)}`} className="bl-course__open">
          {c.course.open}
        </Link>
      </header>

      <ul className="bl-rows">
        {course.items.map((item) => {
          const Icon = KIND_ICON[item.kind];
          return (
            <li key={item.id} className="bl-row" data-kind={item.kind}>
              <span className="bl-row__icon" aria-hidden="true">
                <Icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="bl-row__title">{item.title}</p>
                <p className="bl-row__meta">
                  <span className="bl-row__kind">{c.kind[item.kind]}</span>
                  <span className="bl-row__status" data-status={item.status}>
                    {statusLabel(item)}
                  </span>
                </p>
              </div>
              <Link href={itemHref(item)} className="bl-row__cta">
                <span>{actionLabel(item)}</span>
                <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function BacklogClear({ awaiting }: { awaiting: number }) {
  return (
    <section className="bl-clear">
      <span className="bl-clear__badge" aria-hidden="true">
        <CheckCheck className="size-8" />
      </span>
      <h2 className="bl-clear__title">{c.hero.clearTitle}</h2>
      <p className="bl-clear__body">{c.hero.clearBody}</p>
      {awaiting > 0 ? (
        <p className="bl-clear__awaiting">{arabicCount(awaiting, c.hero.awaiting)}</p>
      ) : null}
      <Link href="/path" className="bl-clear__cta">
        <Route className="size-4" aria-hidden="true" />
        {c.hero.clearCta}
      </Link>
    </section>
  );
}
