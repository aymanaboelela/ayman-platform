import { Clock3, Lock, ShieldCheck, ShieldAlert } from 'lucide-react';
import { guardianCopy as c } from '@ayman/contracts/copy/guardian';
import { formatCopy } from '@ayman/contracts/format';
import type { GuardianCourse } from '@ayman/contracts/guardian-view';
import { CourseArt } from '@/components/course-art';
import { ProgressRing } from '@/components/progress-ring';
import { accessLabel, courseBehind, whenLabel } from '@/lib/guardian-view';
import { GuardianEmptyArt } from './guardian-art';
import { SectionHead } from './section-head';

const ACCESS_ICON = { ok: ShieldCheck, warn: ShieldAlert, off: Lock } as const;

/**
 * One card per course: the subject's artwork, the subscription as it really
 * stands (from the grant — see `accessFor`), a ring for lectures watched out of
 * the months held, the two averages, what is left, and when it was last opened.
 */
export function GuardianCourses({ courses, now }: { courses: readonly GuardianCourse[]; now: Date }) {
  return (
    <section className="gd-section" data-tone="lectures" aria-labelledby="gd-courses">
      <SectionHead id="gd-courses" title={c.courses.title} />
      {courses.length === 0 ? (
        <div className="gd-empty">
          <GuardianEmptyArt />
          <p className="gd-empty__title">{c.courses.emptyTitle}</p>
          <p className="gd-empty__body">{c.courses.emptyBody}</p>
        </div>
      ) : (
        <ul className="gd-courses">
          {courses.map((course) => (
            <CourseCard key={course.id} course={course} now={now} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CourseCard({ course, now }: { course: GuardianCourse; now: Date }) {
  const access = accessLabel(course.access, course.published);
  const AccessIcon = ACCESS_ICON[access.tone];
  const behind = courseBehind(course);
  const last = whenLabel(course.lastActivityAt, now);
  const ended = course.published && course.access.state === 'ended';

  return (
    <li className="gd-course">
      <div className="gd-course__art">
        <CourseArt coverKey={course.coverKey} subjectNameAr={course.subjectNameAr} seed={course.id} compact sizes="6rem" />
      </div>

      <div className="gd-course__main">
        <h3 className="gd-course__title">{course.title}</h3>
        <p className="gd-access" data-tone={access.tone}>
          <AccessIcon className="size-4" aria-hidden="true" />
          <span>{access.text}</span>
          {access.sub ? <span className="gd-access__sub">{access.sub}</span> : null}
        </p>
      </div>

      <div className="gd-course__ring">
        <ProgressRing percent={course.lectures.percent} size={64} color="var(--gd-k)">
          <span className="gd-course__pct gd-num">{Math.round(course.lectures.percent)}%</span>
        </ProgressRing>
      </div>

      <dl className="gd-course__facts">
        <div>
          <dt>{c.courses.lecturesLabel}</dt>
          <dd className="gd-num">
            {course.lectures.total === 0 ? c.courses.noMark : `${course.lectures.completed}/${course.lectures.total}`}
          </dd>
        </div>
        <div>
          <dt>{c.courses.quizzes}</dt>
          <dd className="gd-num">{course.quizzes.average === null ? c.courses.noMark : `${course.quizzes.average}%`}</dd>
        </div>
        <div>
          <dt>{c.courses.exams}</dt>
          <dd className="gd-num">{course.exams.average === null ? c.courses.noMark : `${course.exams.average}%`}</dd>
        </div>
      </dl>

      <div className="gd-course__foot">
        {/* A course whose subscription ended has nothing «فاضل» that can be
            opened — «محتاج متابعة» says it once, as the subscription. */}
        {ended ? null : behind.length === 0 ? (
          <span className="gd-pill" data-tone="ok">
            {c.courses.upToDate}
          </span>
        ) : (
          <span className="gd-pill" data-tone="warn">
            {c.courses.behind}: {behind.join(' · ')}
          </span>
        )}
        <span className="gd-course__last">
          <Clock3 className="size-4" aria-hidden="true" />
          {last ? formatCopy(c.courses.lastActive, { when: last }) : c.courses.noActivity}
        </span>
      </div>
    </li>
  );
}
