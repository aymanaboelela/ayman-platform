import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Award, CalendarClock, Camera, Clock, GraduationCap, Play, Route, School, Zap } from 'lucide-react';
import { copy, formatCopy, type ContinueWatching } from '@ayman/contracts';
import type { EnrolledCourse } from '@ayman/contracts/progress';
import type { AchievementTier } from '@/lib/achievements';
import { getBrandAsset } from '@/lib/brand-assets';
import { formatRemaining } from '@/lib/format';
import { UserAvatar } from '@/components/app/user-avatar';
import { CourseArt } from '@/components/course-art';
import { ProgressRing } from '@/components/progress-ring';
import { LessonProgressBar } from '@/components/player/lesson-progress-bar';
import { scheduleLines } from './dashboard-hero';
import { statFigures, type StatFigure } from './stats-row';

const c = copy.dashboard;

const ICONS: Record<StatFigure['id'], ReactNode> = {
  xp: <Zap className="size-[1.125rem]" />,
  time: <Clock className="size-[1.125rem]" />,
  badges: <Award className="size-[1.125rem]" />,
};

/**
 * «Cinema» — the home band on his stack (`page.tsx` renders it under
 * `IS_AYMAN`; every other stack keeps `<DashboardHero>` untouched).
 *
 * From the approved Home2 board: his dragon poster on the inline END (left in
 * RTL) with his face in frame, the student on the inline start — portrait,
 * greeting, year/track, three figures and the ring — and «نكمّل من مكانك»
 * INSIDE the band as a white card carrying the page's one orange button.
 *
 * The owner rejected an earlier band whose poster was cropped through his face
 * and washed dark all over. So the scrim lives only behind the words (a side
 * gradient that is clear before it reaches him) and the crop is pinned to the
 * top of the frame, where his face is — see `.home-hero__poster` in
 * `home-cinema.css`. `getBrandAsset` is `aymanOnly()`-gated: without it the band
 * is the plain night-blue ground, never someone else's picture (CLAUDE.md §2).
 *
 * ## Class names kept from `<DashboardHero>`
 *
 * `.dash-hero` on the root, and `__eyebrow`, `__fact`, `__aside-label`, `__schedule*`
 * inside: `study-surface-a11y.e2e.ts` gates on the eyebrow and measures the
 * eyebrow, the ring caption and a chip for contrast, and the loading skeleton
 * wears `.dash-hero`. `home-cinema.css` re-lays the root; the inner classes keep
 * their `study.css` type and colours, which are white alphas made for a dark band.
 *
 * Every figure is the same data `<DashboardHero>` prints — `statFigures` builds
 * them for both — minus the small second line under each tile («٤ دروس
 * خلصتها»…): «مش بحب الزحمة». The figures still link where those lines did.
 */
export function HomeHero({
  name,
  image,
  greetingName,
  yearLabel,
  trackLabel,
  schoolName,
  overallPercent,
  courseCount,
  completedLessons,
  averageScore,
  xp,
  learningSeconds,
  badgesEarned,
  badgeTier,
  courses,
  resume,
}: {
  name: string;
  image: string | null;
  greetingName: string | null;
  yearLabel: string | null;
  trackLabel: string | null;
  schoolName: string | null;
  overallPercent: number;
  courseCount: number;
  completedLessons: number;
  averageScore: number | null;
  xp: number;
  learningSeconds: number;
  badgesEarned: number;
  badgeTier: AchievementTier | null;
  courses: readonly EnrolledCourse[];
  /** `dashboard.continueWatching` — `null` leaves the band without the card,
   *  and the page puts the first-run card under it instead. */
  resume: ContinueWatching | null;
}) {
  const poster = getBrandAsset('practiceGuide');
  const schedule = scheduleLines(courses);
  const figures = statFigures({
    xp,
    learningSeconds,
    badgesEarned,
    completedLessons,
    courseCount,
    averageScore,
    badgeTier,
  });
  const resumeCourse = resume ? courses.find((course) => course.id === resume.courseId) : undefined;

  return (
    <header className="dash-hero home-hero" data-poster={poster ? '' : undefined}>
      {poster ? (
        <span className="home-hero__art" aria-hidden="true">
          <Image
            src={poster.src}
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 1100px, 100vw"
            className="home-hero__poster"
          />
        </span>
      ) : null}
      <span className="home-hero__scrim" aria-hidden="true" />

      <div className="home-hero__copy">
        <div className="home-hero__id">
          <span className="home-hero__portrait">
            <UserAvatar name={name} image={image} size={64} className="home-hero__avatar" />
            {image ? null : (
              <Link
                href="/profile"
                className="dash-hero__photo-cta"
                aria-label={copy.profile.photoChange}
                title={copy.profile.photoChange}
              >
                <Camera className="size-3.5" aria-hidden="true" />
              </Link>
            )}
          </span>

          <div className="min-w-0">
            <p className="dash-hero__eyebrow">{c.eyebrow}</p>
            <h1 className="home-hero__title">
              {greetingName ? formatCopy(c.greeting, { name: greetingName }) : c.greetingFallback}
            </h1>
            {yearLabel || trackLabel || schoolName ? (
              <div className="dash-hero__facts home-hero__facts">
                {yearLabel ? (
                  <span className="dash-hero__fact">
                    <GraduationCap size={14} aria-hidden="true" />
                    <span>{yearLabel}</span>
                  </span>
                ) : null}
                {trackLabel ? (
                  <span className="dash-hero__fact">
                    <Route size={14} aria-hidden="true" />
                    <span>{trackLabel}</span>
                  </span>
                ) : null}
                {schoolName ? (
                  <span className="dash-hero__fact">
                    <School size={14} aria-hidden="true" />
                    <span>{schoolName}</span>
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="home-hero__stats">
          {figures.map((figure) => (
            <Link key={figure.id} href={figure.href} className="home-stat">
              <span className="home-stat__value">
                <span className="home-stat__icon" aria-hidden="true">
                  {ICONS[figure.id]}
                </span>
                {figure.value}
                {figure.suffix ? <span className="home-stat__suffix">{figure.suffix}</span> : null}
              </span>
              <span className="home-stat__label">{figure.label}</span>
            </Link>
          ))}
          <div className="home-stat home-stat--ring">
            <ProgressRing percent={overallPercent} size={56} tone="ink">
              <span className="home-stat__dial">{Math.round(overallPercent)}%</span>
            </ProgressRing>
            <span className="dash-hero__aside-label">{c.statOverall}</span>
          </div>
        </div>

        {/* «مواعيد المحاضرات» — kept on the band, at the size the owner asked
            for («تبقى كبيرة وباينة»); `study.css` styles the strip. Absent
            unless an instructor wrote a note. */}
        {schedule.length > 0 ? (
          <section className="dash-hero__schedule home-hero__schedule" aria-labelledby="home-hero-schedule">
            <p className="dash-hero__schedule-title" id="home-hero-schedule">
              <CalendarClock size={18} aria-hidden="true" />
              <span>{c.scheduleTitle}</span>
            </p>
            <ul className="dash-hero__schedule-list">
              {schedule.map((line) => (
                <li key={line.courseId} className="dash-hero__schedule-row">
                  <span className="dash-hero__schedule-course">{line.courseTitle}</span>
                  <span className="dash-hero__schedule-time">{line.note}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {resume ? (
        <HomeResume
          item={resume}
          coverKey={resumeCourse?.coverKey ?? null}
          subjectNameAr={resumeCourse?.subjectNameAr ?? null}
        />
      ) : null}
    </header>
  );
}

/**
 * «نكمّل من مكانك» inside the band — the one orange button on the screen.
 *
 * Same destination and the same stretched-link shape as `ContinueWatchingCard`
 * (one anchor, the card is its hit area). The thumbnail is the course's own
 * artwork, so it is the picture the student will see again on «كورساتي»; when
 * the course lookup misses (an enrolment revoked since) it is a play disc.
 */
function HomeResume({
  item,
  coverKey,
  subjectNameAr,
}: {
  item: ContinueWatching;
  coverKey: string | null;
  subjectNameAr: string | null;
}) {
  return (
    <article className="home-resume">
      <span className="home-resume__thumb" aria-hidden="true">
        {subjectNameAr ? (
          <CourseArt coverKey={coverKey} subjectNameAr={subjectNameAr} seed={item.courseSlug} compact />
        ) : null}
        <span className="home-resume__play">
          <Play className="size-4 fill-current" />
        </span>
      </span>

      <div className="home-resume__text">
        <p className="home-resume__eyebrow">{formatCopy(c.resumeEyebrow, { course: item.courseTitle })}</p>
        <p className="home-resume__title">{item.lessonTitle}</p>
        <div className="home-resume__meter">
          <LessonProgressBar
            percent={item.progressPercent}
            label={copy.player.courseProgress}
            className="home-resume__bar"
          />
          {item.remainingSeconds > 0 ? (
            <span className="home-resume__left">
              {c.remaining} <span className="home-resume__time">{formatRemaining(item.remainingSeconds)}</span>
            </span>
          ) : null}
        </div>
      </div>

      <Link href={`/courses/${item.courseSlug}/lessons/${item.lessonId}`} className="home-resume__cta">
        <Play className="size-4 fill-current" aria-hidden="true" />
        {c.continueCta}
      </Link>
    </article>
  );
}
