import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Award, Lock } from 'lucide-react';
import { EnrollmentSchema, copy, formatCopy } from '@ayman/contracts';
import { LearningPathSchema, type PathCourse } from '@ayman/contracts/path';
import { apiGetAuthed } from '@/lib/api-server';
import { lalezar } from '@/lib/fonts';
import { shareBrand, shareCardsEnabled } from '@/lib/share-card/brand';
import { LtrRatio } from '@/components/ltr-ratio';
import { LessonProgressBar } from '@/components/player/lesson-progress-bar';
import { CertificateShare } from '@/components/share-card/certificate-share';
import { studentName } from '@/components/share-card/share-slots';

export const metadata: Metadata = { title: copy.shareCard.pageTitle };

const c = copy.shareCard;

/**
 * «شهاداتي» — every enrolled course as a certificate: earned ones open the
 * certificate dialog, the rest show how far is left.
 *
 * «Earned» is the course page's own rule, not a second one: 100% of the
 * lectures AND `contentComplete`. A course at 100% of what has been published
 * so far sits in «في الطريق» with its own line saying why, because a
 * certificate for half a syllabus would have to be taken back.
 *
 * Behind `shareCards` like the buttons: a stack without it 404s here, and the
 * rail never lists it there anyway (`aymanOnly` in `student-nav-items.ts`).
 */
export default async function CertificatesPage() {
  if (!(await shareCardsEnabled())) notFound();

  const [path, enrollments, name] = await Promise.all([
    apiGetAuthed('/api/me/path', LearningPathSchema),
    apiGetAuthed('/api/enrollments', EnrollmentSchema.array()).catch(() => []),
    studentName(),
  ]);

  const courses = path.courses.filter((course) => course.totalLessons > 0);
  const earned = courses.filter(isEarned);
  const pending = courses.filter((course) => !isEarned(course));
  const completedAt = (courseId: string) =>
    enrollments.find((e) => e.courseId === courseId)?.completedAt ?? new Date().toISOString();
  const brand = shareBrand();

  return (
    <main className={`${lalezar.variable} mx-auto w-full max-w-[var(--w-app)] px-4 py-6 md:px-6 md:py-8`}>
      <header className="certs-hero">
        <span className="certs-hero__icon" aria-hidden="true">
          <Award />
        </span>
        <div>
          <h1 className="certs-hero__title">{c.pageTitle}</h1>
          <p className="certs-hero__lead">{c.pageLead}</p>
        </div>
        <p className="certs-hero__count mono tabular" aria-hidden="true">
          <LtrRatio value={earned.length} of={courses.length} />
        </p>
      </header>

      {courses.length === 0 ? (
        <section className="panel grid justify-items-center gap-2 px-6 py-10 text-center">
          <Award className="mb-2 text-fg-muted" aria-hidden="true" />
          <h2 className="text-xl font-bold text-fg">{c.emptyTitle}</h2>
          <p className="text-fg-muted">{c.emptyBody}</p>
          <Link href="/library" className="chip chip--solid mt-2">
            {c.emptyCta}
          </Link>
        </section>
      ) : null}

      {earned.length > 0 ? (
        <section className="mb-10">
          <h2 className="certs-heading">{c.earnedHeading}</h2>
          <div className="certs-grid">
            {earned.map((course) => {
              const date = completedAt(course.id);
              return (
                <article key={course.id} className="cert-tile cert-tile--earned">
                  <div className="cert-tile__frame">
                    <span className="cert-tile__kicker">{c.certificateTitle}</span>
                    <h3 className="cert-tile__course">{course.title}</h3>
                    <p className="cert-tile__date">
                      {formatCopy(c.earnedOn, {
                        date: new Date(date).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' }),
                      })}
                    </p>
                  </div>
                  {name ? (
                    <CertificateShare
                      data={{ studentName: name, courseTitle: course.title, completedAt: date }}
                      brand={brand}
                    />
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {pending.length > 0 ? (
        <section>
          <h2 className="certs-heading">{c.lockedHeading}</h2>
          <div className="certs-grid">
            {pending.map((course) => (
              <article key={course.id} className="cert-tile cert-tile--locked">
                <div className="cert-tile__frame">
                  <span className="cert-tile__badge">
                    <Lock className="size-3.5" aria-hidden="true" />
                    {c.lockedBadge}
                  </span>
                  <h3 className="cert-tile__course">{course.title}</h3>
                  <p className="cert-tile__date">
                    {course.progressPercent === 100
                      ? c.waitingForContent
                      : formatCopy(c.certificateProgress, {
                          done: course.clearedLessons.toLocaleString('ar-EG'),
                          total: course.totalLessons.toLocaleString('ar-EG'),
                        })}
                  </p>
                  <LessonProgressBar percent={course.progressPercent} label={course.title} />
                </div>
                {course.progressPercent < 100 ? (
                  <Link href={`/library/${course.slug}`} className="chip chip--solid self-start">
                    {c.continueCourse}
                  </Link>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function isEarned(course: PathCourse): boolean {
  return course.progressPercent === 100 && course.contentComplete;
}
