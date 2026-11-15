import type { ReactNode } from 'react';
import Link from 'next/link';
import { Award, BookOpen, ChevronLeft, ClipboardCheck, Users } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { arabicCount } from '@ayman/contracts/arabic-count';
import type { BookShippingRates } from '@ayman/contracts/books';
import { formatCopy } from '@ayman/contracts/format';
import type { StudentExam } from '@ayman/contracts/quiz/scheduled';
import { CertificatesPayloadSchema } from '@ayman/contracts/share-cards';
import { apiGetAuthed } from '@/lib/api-server';
import { formatEGP } from '@/lib/price';
import { quizHref } from '@/lib/quiz-links';
import { BookOrderButton } from '@/components/site/book-order-button';

const c = copy.library.side;

/**
 * `Africa/Cairo`, pinned — the same reason `exam-countdown-band.tsx` gives:
 * the server's zone is UTC in production, and an exam set for 8pm would read
 * as 6pm. Formatted here, on the server, so the browser never re-formats it.
 */
const stamp = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  timeZone: 'Africa/Cairo',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: 'numeric',
  minute: '2-digit',
});

/**
 * «امتحان الشهر» for THIS course — a night card in the side column on a wide
 * screen and a strip right under the hero on a phone (`course-page.css`).
 *
 * The page hands over `bandExam()` of this course's exams only, so it is the
 * same exam the home page counts down to when the student has one course, and
 * nothing at all on a stack without monthly exams (`getStudentExamsOrEmpty`).
 *
 * One orange button, and only while the paper can actually be sat: an
 * `upcoming` exam says when it opens and offers nothing to press (the server
 * answers `quiz_not_open_yet` until then), and a paper already sat offers its
 * result in the quiet weight.
 */
export function CourseExamCard({ exam }: { exam: StudentExam }) {
  const open = exam.phase === 'open';
  const when = open
    ? exam.openUntil
      ? formatCopy(c.examUntil, { date: stamp.format(new Date(exam.openUntil)) })
      : null
    : exam.openFrom
      ? formatCopy(c.examOpensAt, { date: stamp.format(new Date(exam.openFrom)) })
      : null;
  const minutes = exam.durationSeconds ? Math.max(1, Math.round(exam.durationSeconds / 60)) : null;
  const meta = [when, minutes ? arabicCount(minutes, c.examMinutes) : null].filter(Boolean).join(' · ');

  return (
    <section className="cp-exam" aria-labelledby="cp-exam-title">
      <span className="cp-exam__icon" aria-hidden="true">
        <ClipboardCheck className="size-5" />
      </span>
      <div className="cp-exam__text">
        <span className="cp-exam__tag">
          {c.examTag} · {open ? c.examOpen : c.examUpcoming}
        </span>
        <h2 id="cp-exam-title" className="cp-exam__title">
          {exam.title}
        </h2>
        {meta ? <p className="cp-exam__meta">{meta}</p> : null}
      </div>
      {open ? (
        exam.hasSat ? (
          <Link href={quizHref(exam.lessonId)} className="cp-exam__go cp-exam__go--quiet">
            {c.examResult}
          </Link>
        ) : (
          <Link href={quizHref(exam.lessonId)} className="cp-exam__go">
            <span className="cp-exam__go-long">{c.examStart}</span>
            <span className="cp-exam__go-short">{c.examStartShort}</span>
          </Link>
        )
      ) : null}
    </section>
  );
}

export interface CourseBookLink {
  courseId: string;
  bookTitle: string;
  bookPriceCents: number;
  shippingRates: BookShippingRates;
  instapay: string | null;
  vodafoneCash: string | null;
}

/**
 * «جروب الدفعة» · «اطلب الكتاب» · «شهاداتي» — one small card of rows in the
 * side column, a strip of tiles on a phone. Same DOM; `course-page.css`
 * re-lays it.
 *
 * They were three full cards stacked beside the units («مش بحب الزحمة
 * للطالب»), each with its own solid button. Here each row's button is the
 * quiet weight — the one orange press in this column is the exam's — except
 * the group's, which wears the platform green so it is the row the eye lands
 * on: the owner asked for the cohort group to be impossible to miss.
 *
 * Each row disappears on its own when it has nothing behind it, and the card
 * with them (`.cp-links:not(:has(.cp-link))`), because the certificates row
 * resolves later inside its own `<Suspense>` and cannot be counted up front.
 */
export function CourseLinks({
  groupUrl,
  book,
  certificates,
}: {
  /** `/api/me/path`'s per-course invite — never the catalog's (see page.tsx). */
  groupUrl: string | null;
  book: CourseBookLink | null;
  /** The certificates row, already wrapped in `<Suspense>` by the page. */
  certificates: ReactNode;
}) {
  return (
    <section className="cp-links" aria-label={c.linksLabel}>
      {groupUrl ? (
        // `target="_blank"` like every cohort link: the course page must stay
        // where it is behind the chat.
        <a href={groupUrl} target="_blank" rel="noopener noreferrer" className="cp-link cp-link--group">
          <span className="cp-link__disc" aria-hidden="true">
            <Users className="size-5" />
          </span>
          <span className="cp-link__text">
            <span className="cp-link__title">{copy.player.group.title}</span>
            <span className="cp-link__sub">{copy.player.group.short}</span>
          </span>
          <span className="cp-link__go" aria-hidden="true">
            {c.groupGo}
          </span>
        </a>
      ) : null}

      {book ? (
        // The row is not the button: the dialog's trigger is
        // `BookOrderButton`'s own (compact) one, so the order flow, its
        // shipping zones and its payment numbers stay the one implementation
        // the lesson rail and the public page already share.
        <div className="cp-link cp-link--book">
          <span className="cp-link__disc" aria-hidden="true">
            <BookOpen className="size-5" />
          </span>
          <span className="cp-link__text">
            <span className="cp-link__title">{book.bookTitle}</span>
            <span className="cp-link__sub">
              {formatCopy(c.bookSub, { price: formatEGP(book.bookPriceCents) })}
            </span>
          </span>
          <BookOrderButton {...book} compact />
        </div>
      ) : null}

      {certificates}
    </section>
  );
}

/**
 * «شهاداتي» with how many this student holds in THIS course — a row that
 * opens `/certificates`, where every one of them can be opened and shared.
 *
 * Same read and the same filter as `CourseCertificatesSlot`, and the same
 * silence: a stack without `shareCards` answers 404, a student with none in
 * this course gets no row — nothing renders until there is one.
 */
export async function CourseCertificatesLink({ courseId }: { courseId: string }) {
  const payload = await apiGetAuthed('/api/me/share-cards/certificates', CertificatesPayloadSchema).catch(
    () => null,
  );
  if (!payload?.studentName) return null;
  const count =
    payload.units.filter((unit) => unit.courseId === courseId && unit.earned).length +
    payload.exams.filter((exam) => exam.courseId === courseId).length;
  if (count === 0) return null;

  return (
    <Link href="/certificates" className="cp-link cp-link--certs">
      <span className="cp-link__disc" aria-hidden="true">
        <Award className="size-5" />
      </span>
      <span className="cp-link__text">
        <span className="cp-link__title">{c.certificates}</span>
      </span>
      <span className="cp-link__count tabular">{count}</span>
      <ChevronLeft className="cp-link__chevron size-4" aria-hidden="true" />
    </Link>
  );
}
