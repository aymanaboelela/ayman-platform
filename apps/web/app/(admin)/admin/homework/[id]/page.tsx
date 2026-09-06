import Link from 'next/link';
import { ArrowRight, BookOpen, MessageCircle, Phone, UserRound } from 'lucide-react';
// `/copy/admin`, never the root barrel: these screens only ever render
// inside the admin layout, and `copy.admin.*` lives in that module.
import { copy } from '@ayman/contracts/copy/admin';
import { AdminHomeworkDetailSchema } from '@ayman/contracts/homework';
import { waMeHref } from '@ayman/contracts/whatsapp';
import { adminGetOrNotFound } from '@/lib/admin-api';
import { HomeworkReviewForm } from './review-form';

const c = copy.admin.homework;

export const metadata = { title: c.queueTitle };

const submittedAtFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * One submission: the question, the photographs, and the decision.
 *
 * ## Everything he needs is on this page, and it is deliberately not a modal
 *
 * «أشوف الواجبات ومين اللي بعت، وأقدر أدخل على البروفايل بتاعه… وأبعتله مسج،
 *  أبعتله فويس.» That is four destinations from one screen — the student's
 * record, the lecture the exercise came from, their conversation thread, and
 * their phone — plus the decision itself. A dialog over the queue could carry
 * the first and none of the rest.
 *
 * ## The voice note is a LINK, not a recorder
 *
 * `/admin/inbox/[id]` already records and sends voice — it shipped in
 * September, complete with the `Permissions-Policy` fix that made the
 * microphone reachable at all. A second recorder here would be a second
 * implementation of the hardest thing on that screen, on a page whose actual
 * job is a verdict. So the written reply is sent from here (one tap, from the
 * pools) and «افتح المحادثة» hands him the thread where the rest of the
 * conversation already lives.
 *
 * `adminGetOrNotFound`: a submission id from a stale tab, or one whose student
 * deleted their account, is an ordinary missing row and must read as «مش
 * موجود» rather than as «حصل خطأ». See `lib/admin-api.ts`.
 */
export default async function AdminHomeworkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const submission = await adminGetOrNotFound(
    `/api/admin/homework/${id}`,
    AdminHomeworkDetailSchema,
  );

  const phoneHref = waMeHref(submission.studentPhone);

  return (
    <>
      <p className="mb-4">
        <Link
          href="/admin/homework"
          className="inline-flex items-center gap-1.5 text-[length:var(--fs-text-sm)] text-fg-muted hover:text-fg"
        >
          <ArrowRight className="size-4" aria-hidden="true" />
          {c.queueTitle}
        </Link>
      </p>

      <header className="rounded-xl border border-line bg-surface-2 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[length:var(--fs-title-3)] font-semibold text-fg">
              {submission.studentName}
            </h1>
            <p className="mt-0.5 text-[length:var(--fs-text-sm)] text-fg">
              {submission.lessonTitle}
            </p>
            <p className="text-[length:var(--fs-text-xs)] text-fg-muted">
              {submission.courseTitle}
            </p>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[length:var(--fs-text-xs)] text-fg-muted tabular-nums">
              <span>
                {c.submittedAt} {submittedAtFormatter.format(new Date(submission.submittedAt))}
              </span>
              {submission.attempt > 1 ? (
                <span>
                  {c.attempt} {submission.attempt}
                </span>
              ) : null}
              <span>
                {submission.imageCount} {c.imageUnit}
              </span>
            </p>
          </div>
        </div>

        {/*
          The four ways out, as buttons rather than as a menu: every one of them
          was asked for by name, and a queue where the next action is behind a
          «⋯» is a queue that gets worked at half speed.
        */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/admin/students/${submission.studentId}`} className="chip chip--quiet">
            <UserRound className="size-4" aria-hidden="true" />
            {c.openProfile}
          </Link>
          {/*
            The ADMIN course editor, not `/courses/:slug/lessons/:id`. That
            route is the student's player and it is gated on an ENROLMENT the
            instructor does not have — `LessonAccessService` compiles ownership
            into the query, so it would redirect him to `/library` for his own
            lecture. What he wants from here is the exercise he set, and that
            lives in the lesson panel.
          */}
          <Link href={`/admin/courses/${submission.courseId}`} className="chip chip--quiet">
            <BookOpen className="size-4" aria-hidden="true" />
            {c.openLesson}
          </Link>
          {/*
            The thread — where a voice note goes. `/admin/inbox` is a LIST
            filtered by status and this student's thread may not be on the
            current tab, so it links to the inbox rather than guessing a
            conversation id the API does not send: the reply this form is about
            to write creates or reuses that thread anyway, and it will be at the
            top of «الكل» the moment it does.
          */}
          <Link href="/admin/inbox?filter=all" className="chip chip--quiet">
            <MessageCircle className="size-4" aria-hidden="true" />
            {c.openThread}
          </Link>
          {phoneHref ? (
            <a
              href={phoneHref}
              target="_blank"
              rel="noopener noreferrer"
              className="chip chip--quiet"
            >
              <Phone className="size-4" aria-hidden="true" />
              {submission.studentPhone}
            </a>
          ) : null}
        </div>
        <p className="mt-2 text-[length:var(--fs-text-xs)] text-fg-faint">{c.openThreadHint}</p>
      </header>

      {/* The question, so the answer can be read against it without opening the
          course editor in a second tab. `whitespace-pre-line` because the body
          is plain text with newlines — «١- … ٢- … ٣- …». */}
      <section className="mt-4 rounded-xl border border-line bg-surface-2 p-4 sm:p-5">
        <h2 className="text-[length:var(--fs-text-sm)] font-semibold text-fg-muted">{c.prompt}</h2>
        <p className="mt-1.5 whitespace-pre-line text-[length:var(--fs-text-base)] leading-relaxed text-fg">
          {submission.prompt || c.noPrompt}
        </p>
      </section>

      <section className="mt-4">
        {submission.imageIds.length > 0 ? (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {submission.imageIds.map((imageId, index) => (
              <li
                key={imageId}
                className="overflow-hidden rounded-xl border border-line bg-surface-2"
              >
                {/*
                  A plain `<img>`, never `next/image`, and the same reasoning
                  every private image on this platform carries: the bytes come
                  from an `/api/…` route that re-checks the permission on every
                  request, while the optimizer fetches through its own path and
                  caches the result publicly — which would hand a photograph of
                  a student's exercise book to `/_next/image` as a cacheable
                  resource.

                  Full width and unclipped: this is the thing he came to read,
                  and a cropped thumbnail of handwriting is unreadable.
                */}
                <img
                  src={`/api/admin/homework/images/${imageId}`}
                  alt={`${c.imageUnit} ${index + 1}`}
                  loading={index === 0 ? 'eager' : 'lazy'}
                  className="w-full"
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-line bg-surface-2 px-5 py-8 text-center text-[length:var(--fs-text-sm)] text-fg-muted">
            {submission.status === 'accepted' ? c.imagesGone : c.imagesExpired}
          </p>
        )}
      </section>

      {submission.reviewNote ? (
        <section className="mt-4 rounded-xl border border-line bg-surface-3 p-4">
          <h2 className="text-[length:var(--fs-text-sm)] font-semibold text-fg-muted">
            {c.yourNote}
          </h2>
          <p className="mt-1 whitespace-pre-line text-[length:var(--fs-text-base)] text-fg">
            {submission.reviewNote}
          </p>
          {submission.grade !== null ? (
            <p className="mt-2 text-[length:var(--fs-text-base)] font-semibold text-[color:var(--ok)] tabular-nums">
              {submission.grade} / 100
            </p>
          ) : null}
        </section>
      ) : null}

      {/*
        The form stays on a submission he has already decided, deliberately.
        «رجع للطالب» then «مقبول» is the ordinary second half of this workflow —
        the student redoes it, hands it in again, and the row comes back as
        `submitted`. What is NOT offered is re-deciding an ACCEPTED one: the
        photographs are gone, so there is nothing left to judge, and the form
        says so instead of pretending.
      */}
      {submission.status === 'accepted' ? null : (
        <HomeworkReviewForm
          id={submission.id}
          suggestions={submission.suggestions}
        />
      )}
    </>
  );
}
