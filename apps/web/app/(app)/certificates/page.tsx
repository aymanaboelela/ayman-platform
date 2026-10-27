import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Award, Lock, Medal } from 'lucide-react';
import { copy, formatCopy } from '@ayman/contracts';
import { CertificatesPayloadSchema } from '@ayman/contracts/share-cards';
import { ApiRequestError } from '@/lib/api';
import { apiGetAuthed } from '@/lib/api-server';
import { lalezar } from '@/lib/fonts';
import { shareBrand } from '@/lib/share-card/brand';
import { LtrRatio } from '@/components/ltr-ratio';
import { LessonProgressBar } from '@/components/player/lesson-progress-bar';
import { ExamCertificateShare, UnitCertificateShare } from '@/components/share-card/certificate-share';

export const metadata: Metadata = { title: copy.shareCard.pageTitle };

const c = copy.shareCard;

const percent = (n: number) => `${n.toLocaleString('ar-EG', { maximumFractionDigits: 1 })}٪`;
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * «شهاداتي» — two kinds of certificate, drawn as two kinds of object:
 *
 * · «شهادات التفوّق» — an exam (monthly, or the course's final) at 85%+.
 *   Ivory tiles, like the certificate they open.
 * · «شهادات الوحدات» — a unit whose every quiz is marked and averages 85%+.
 *   Black-and-gold tiles, like theirs.
 *
 * Then every unit still on the way, with how far it is: quizzes taken, the
 * average so far, and the rule — so a student at 82% knows exactly what is
 * left. The API decides all of it (`/api/me/share-cards/certificates`); a
 * stack without `shareCards` answers 404 there, and so does this page.
 */
export default async function CertificatesPage() {
  const payload = await apiGetAuthed('/api/me/share-cards/certificates', CertificatesPayloadSchema).catch(
    (error: unknown) => {
      if (error instanceof ApiRequestError && error.status === 404) notFound();
      throw error;
    },
  );

  const name = payload.studentName;
  const min = percent(payload.minPercent);
  const earnedUnits = payload.units.filter((unit) => unit.earned);
  const pendingUnits = payload.units.filter((unit) => !unit.earned);
  const earnedCount = earnedUnits.length + payload.exams.length;
  const brand = await shareBrand();

  return (
    <main className={`${lalezar.variable} mx-auto w-full max-w-[var(--w-app)] px-4 py-6 md:px-6 md:py-8`}>
      <header className="certs-hero">
        <span className="certs-hero__icon" aria-hidden="true">
          <Award />
        </span>
        <div>
          <h1 className="certs-hero__title">{c.pageTitle}</h1>
          <p className="certs-hero__lead">{formatCopy(c.pageLead, { min })}</p>
        </div>
        <p className="certs-hero__count mono tabular" aria-hidden="true">
          <LtrRatio value={earnedCount} of={payload.units.length + payload.exams.length} />
        </p>
      </header>

      {payload.units.length === 0 && payload.exams.length === 0 ? (
        <section className="panel grid justify-items-center gap-2 px-6 py-10 text-center">
          <Award className="mb-2 text-fg-muted" aria-hidden="true" />
          <h2 className="text-xl font-bold text-fg">{c.emptyTitle}</h2>
          <p className="text-fg-muted">{c.emptyBody}</p>
          <Link href="/library" className="chip chip--solid mt-2">
            {c.emptyCta}
          </Link>
        </section>
      ) : null}

      {payload.exams.length > 0 ? (
        <section className="mb-10">
          <h2 className="certs-heading">{c.examsHeading}</h2>
          <div className="certs-grid">
            {payload.exams.map((exam) => (
              <article key={exam.id} className="cert-tile cert-tile--exam">
                <div className="cert-tile__frame">
                  <span className="cert-tile__kicker">
                    <Medal className="size-5" aria-hidden="true" /> {c.examTitle}
                  </span>
                  <h3 className="cert-tile__course">{exam.title}</h3>
                  <p className="cert-tile__score mono tabular">
                    <LtrRatio value={exam.score} of={exam.total} />
                  </p>
                  <p className="cert-tile__date">
                    {exam.courseTitle} · {day(exam.earnedAt)}
                  </p>
                </div>
                {name ? (
                  <ExamCertificateShare
                    data={{
                      studentName: name,
                      examTitle: exam.title,
                      courseTitle: exam.courseTitle,
                      score: exam.score,
                      total: exam.total,
                      earnedAt: exam.earnedAt,
                    }}
                    brand={brand}
                  />
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {earnedUnits.length > 0 ? (
        <section className="mb-10">
          <h2 className="certs-heading">{c.unitsHeading}</h2>
          <div className="certs-grid">
            {earnedUnits.map((unit) => (
              <article key={unit.id} className="cert-tile cert-tile--earned">
                <div className="cert-tile__frame">
                  <span className="cert-tile__kicker">{c.unitTitle}</span>
                  <h3 className="cert-tile__course">{unit.title}</h3>
                  <p className="cert-tile__date">
                    {formatCopy(c.unitAverage, { percent: percent(unit.averagePercent ?? 0) })}
                  </p>
                  <p className="cert-tile__date">
                    {unit.courseTitle}
                    {unit.earnedAt ? ` · ${day(unit.earnedAt)}` : ''}
                  </p>
                </div>
                {name ? (
                  <UnitCertificateShare
                    data={{
                      studentName: name,
                      unitTitle: unit.title,
                      courseTitle: unit.courseTitle,
                      averagePercent: unit.averagePercent ?? 0,
                      earnedAt: unit.earnedAt ?? new Date().toISOString(),
                    }}
                    brand={brand}
                  />
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {pendingUnits.length > 0 ? (
        <section>
          <h2 className="certs-heading">{c.lockedHeading}</h2>
          <p className="mb-3 text-[length:var(--fs-text-sm)] text-fg-muted">{formatCopy(c.unitNeeds, { min })}</p>
          <div className="certs-grid">
            {pendingUnits.map((unit) => (
              <article key={unit.id} className="cert-tile cert-tile--locked">
                <div className="cert-tile__frame">
                  <span className="cert-tile__badge">
                    <Lock className="size-3.5" aria-hidden="true" />
                    {c.lockedBadge}
                  </span>
                  <h3 className="cert-tile__course">{unit.title}</h3>
                  <p className="cert-tile__date">{unit.courseTitle}</p>
                  <p className="cert-tile__date">
                    {formatCopy(c.unitProgress, {
                      taken: unit.quizzesTaken.toLocaleString('ar-EG'),
                      total: unit.quizzesTotal.toLocaleString('ar-EG'),
                    })}
                    {unit.averagePercent !== null
                      ? ` · ${formatCopy(c.unitAverageSoFar, { percent: percent(unit.averagePercent) })}`
                      : ''}
                  </p>
                  <LessonProgressBar
                    percent={Math.round((unit.quizzesTaken / unit.quizzesTotal) * 100)}
                    label={unit.title}
                  />
                </div>
                <Link href={`/library/${unit.courseSlug}`} className="chip chip--solid self-start">
                  {c.continueCourse}
                </Link>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
