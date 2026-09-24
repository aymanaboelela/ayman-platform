'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, ExternalLink, MoreHorizontal, Trash2 } from 'lucide-react';
import { useActionState, useState } from 'react';
import { toast } from 'sonner';
import type { AdminCourseMonth } from '@ayman/contracts/months';
import type { Taxonomy } from '@ayman/contracts/taxonomy';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Badge } from '@ayman/ui/components/badge';
import { Button } from '@ayman/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ayman/ui/components/dropdown-menu';
import type { PublishSkipReason } from '@ayman/contracts/content';
import {
  type ActionResult,
  deleteCourseAction,
  publishCourseAction,
  setCourseStatusAction,
  updateCourseAction,
} from '@/app/(admin)/admin/courses/actions';
import type { AdminCourseDetail } from '@/app/(admin)/admin/courses/[id]/page';
import { AutosaveProvider } from './autosave';
import { CourseExamGate } from './course-exam-gate';
import { VideoCheckButton } from './video-check';
import { CourseForm } from '../course-form';
import { CourseBookPanel } from '../books/course-book-panel';
import { SaveIndicator } from './save-indicator';
import { AddSectionForm } from './section-card';
import { SectionList } from './section-list';
import { CourseMonthsProvider, MonthPanel, StartByMonth } from './month-panel';
import { TermPriceFields, TermsBox } from './term-panel';
import { ActionError, IDLE } from './action-state';
import { useFeature } from '../entitlements-context';

const COURSE_STATUS_LABEL = {
  draft: copy.admin.course.statusDraft,
  published: copy.admin.course.statusPublished,
  archived: copy.admin.course.statusArchived,
} as const;

/** Archived is not neutral: it is a state someone has to undo, and reading it
 *  at the same weight as «مسودة» is how a retired course gets edited for an
 *  hour before anyone notices. */
const STATUS_TONE = {
  draft: 'neutral',
  published: 'ok',
  archived: 'warn',
} as const;

const SKIP_REASON_LABEL: Record<PublishSkipReason, string> = {
  noVideo: copy.admin.course.publishSkipNoVideo,
  noText: copy.admin.course.publishSkipNoText,
  noResources: copy.admin.course.publishSkipNoResources,
  quizNotPublished: copy.admin.course.publishSkipQuizNotPublished,
};

/**
 * The one press that changes what a student can see.
 *
 * Everything else on this page saves itself the moment it is typed, as a
 * DRAFT — «أي حاجة حطيتها حتى لو ما كملتش، اتخزنت بس ما اتنشرتش». So the whole
 * editor now has exactly one button whose meaning is "go live", and it reaches
 * all the way down: the course, its sections, and every lecture that a student
 * could actually do.
 *
 * ⚠️ The REPORT is owned by `CourseEditor`, not by this button, and that is
 * load-bearing. A successful publish flips `course.status`, which swaps this
 * whole component out for the unpublish form — so a report held in here
 * unmounted at the exact moment it was produced, and the instructor saw a toast
 * and nothing else. Caught in the browser, not by a test: the publish worked
 * perfectly and the list of what it skipped was never on screen.
 */
function PublishCourseButton({
  courseId,
  onSkipped,
}: {
  courseId: string;
  onSkipped: (skipped: SkippedLesson[]) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onPublish() {
    if (!window.confirm(copy.admin.course.publishAllConfirm)) return;
    setPending(true);
    const outcome = await publishCourseAction(courseId);
    setPending(false);

    if (!outcome.ok) {
      toast.error(outcome.message);
      return;
    }
    const { publishedLessons, skipped } = outcome.result;
    onSkipped(skipped);
    toast.success(
      `${copy.admin.course.publishAllDone} ${publishedLessons} ${copy.admin.course.publishAllLessons}`,
    );
    router.refresh();
  }

  // The hint that used to hang under this button moved to a `title` — the
  // bar is one row tall and a two-line caption on it pushed every other
  // control out of reach on a laptop.
  return (
    <Button
      type="button"
      size="sm"
      onClick={() => void onPublish()}
      disabled={pending}
      title={copy.admin.course.publishAllHint}
    >
      {copy.admin.course.publishAll}
    </Button>
  );
}

type SkippedLesson = { id: string; title: string; reason: PublishSkipReason };

type CourseStatus = AdminCourseDetail['status'];

/**
 * What the one-press publish left behind, and why.
 *
 * Stays on screen, unlike the toast that announced it: an instructor who
 * publishes a forty-lecture course and is told three stayed behind needs to be
 * able to READ which three, not catch them. And it renders here — outside the
 * button — because publishing swaps that button away, see above.
 */
function PublishReport({ skipped }: { skipped: SkippedLesson[] }) {
  if (skipped.length === 0) return null;

  return (
    <div className="max-w-[36rem] rounded-md border border-line bg-surface-2 p-3">
      <p className="text-[length:var(--fs-text-xs)] text-fg-muted">
        {copy.admin.course.publishAllSkipped}
      </p>
      <ul className="mt-1 space-y-0.5">
        {skipped.map((lesson) => (
          <li key={lesson.id} className="text-[length:var(--fs-text-xs)] text-fg">
            {lesson.title} — <span className="text-err">{SKIP_REASON_LABEL[lesson.reason]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Archive / restore / delete — behind one «⋯».
 *
 * These were three buttons sitting in the page's top-right column beside
 * «انشر الكورس كله», which put a destructive action at the same weight as the
 * one press this screen exists for, and put both a hairline away from each
 * other on a bar that is now sticky and therefore always under the cursor.
 *
 * Same confirm+toast shape as before — nothing about what these DO changed.
 * `onSelect` rather than `onClick`: a Radix menu item is not a button, and
 * `window.confirm` has to open after the menu has closed or the browser
 * dialog steals focus from a menu that is still trying to trap it.
 */
function CourseOverflowMenu({ courseId, status }: { courseId: string; status: CourseStatus }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function run(confirmText: string, act: () => Promise<ActionResult>, done: string) {
    if (!window.confirm(confirmText)) return;
    setPending(true);
    const result = await act();
    setPending(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(done);
    // A deleted course has no page left to refresh into.
    if (done === copy.admin.actions.delete) router.push('/admin/courses');
    else router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending}
          aria-label={copy.admin.course.moreActions}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {status === 'archived' ? (
          <DropdownMenuItem
            onSelect={() =>
              void run(
                copy.admin.course.restoreConfirm,
                () => setCourseStatusAction(courseId, 'draft'),
                copy.admin.actions.restore,
              )
            }
          >
            <ArchiveRestore className="size-4" aria-hidden="true" />
            {copy.admin.actions.restore}
          </DropdownMenuItem>
        ) : (
          /* I4 (audit): a distinct state from `draft` — retiring a finished
             course is a different intent from an instructor unpublishing a
             work-in-progress, and the catalog (which filters on
             `status: 'published'` exactly) excludes both. */
          <DropdownMenuItem
            onSelect={() =>
              void run(
                copy.admin.course.archiveConfirm,
                () => setCourseStatusAction(courseId, 'archived'),
                copy.admin.actions.archive,
              )
            }
          >
            <Archive className="size-4" aria-hidden="true" />
            {copy.admin.actions.archive}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator className="my-1 h-px bg-line" />
        {/* I4 (audit): a course with any student quiz attempt can never be
            hard-deleted — attempt_events is append-only at the DB level,
            forever, even after archiving. deleteCourseAction surfaces that
            refusal in Arabic and points at archiving instead of a raw stack
            trace. A course with no attempts still hard-deletes. */}
        <DropdownMenuItem
          className="text-[color:var(--err)] data-[highlighted]:bg-[color-mix(in_oklch,var(--err),transparent_92%)]"
          onSelect={() =>
            void run(
              copy.admin.course.deleteConfirm,
              () => deleteCourseAction(courseId),
              copy.admin.actions.delete,
            )
          }
        >
          <Trash2 className="size-4" aria-hidden="true" />
          {copy.admin.actions.delete}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The course builder's page shell.
 *
 * This file was 465 lines holding seven components — the shell, the section
 * editor, the lesson panel, three inline forms and the status buttons — and
 * every capability still to be wired would have grown it further. It now owns
 * the shell only; `section-card.tsx` and `lesson-panel.tsx` own the objects.
 */
export function CourseEditor({
  course,
  taxonomy,
  months,
}: {
  course: AdminCourseDetail;
  taxonomy: Taxonomy;
  /**
   * شهور المنهج, or `null` when the request for them failed — see
   * `monthsOrNull` in the page. `null` is not «مفيش شهور»: the panel would
   * then tell the instructor, in Arabic, that this course still sells the old
   * thirty-day month, which may be untrue and which he would act on. So the
   * panel is simply absent for that one render.
   */
  months: AdminCourseMonth[] | null;
}) {
  const booksOpen = useFeature('books');
  const nextStatus = course.status === 'published' ? 'draft' : 'published';
  const [publishState, publishAction, publishPending] = useActionState<ActionResult, FormData>(
    () => setCourseStatusAction(course.id, nextStatus),
    IDLE,
  );
  // Held HERE, not in the publish button: a successful publish swaps that
  // button out for the unpublish form, which would unmount the report at the
  // instant it was produced.
  const [skipped, setSkipped] = useState<SkippedLesson[]>([]);

  /* «السعر ده لشهر واحد» under the monthly price — on a course with months
     that one number buys ONE month, whichever the student picks. Any month,
     not an open one: closing them all takes the plan off sale, it does not
     put the thirty-day window back. */
  const sellsByMonth = (months?.length ?? 0) > 0;
  const sellsBySlice = sellsByMonth || course.terms.length > 0;
  const openMonths = months?.filter((month) => month.isOpen).length ?? 0;

  return (
    /*
      Everything under here saves itself, and reports into the ONE indicator
      beside the title. There is no «حفظ» button anywhere in the editor now
      except on the forms that CREATE something (a section, a lecture, a
      material), because creating a row is an act and setting a field is not.
    */
    <AutosaveProvider>
      {/* The months ride a context rather than a prop chain: the lecture's own
          «الشهر» control is five `'use client'` components below this one, and a
          control that renders EMPTY over an existing tag clears it on its next
          save. `month-panel.tsx` has the full note. */}
      <CourseMonthsProvider months={months}>
        <div className="space-y-8">
          {/*
            The editor's own bar, sticky under the admin header.

            It used to be a column floated to the end of the first row, so every
            control on it — including «انشر الكورس كله», the one press that
            changes what a student can see — scrolled away as soon as you began
            editing a course forty lectures long. Now the state (title, slug,
            حالة, the autosave read-out) and the acts (معاينة، نشر، ⋯) travel
            with the page.
          */}
          <div className="editor-bar">
            <div className="min-w-0">
              <h1 className="truncate text-[length:var(--fs-title-3)] font-semibold">
                {course.title}
              </h1>
              <div className="mt-1 flex min-w-0 items-center gap-2">
                <Badge tone={STATUS_TONE[course.status]}>{COURSE_STATUS_LABEL[course.status]}</Badge>
                <span className="mono truncate text-[length:var(--fs-mono-label)] text-fg-muted">
                  {course.slug}
                </span>
              </div>
            </div>

            <div className="editor-bar__actions">
              <SaveIndicator />
              {/* Only on a published course — the public page is a 404 while it
                  is still a draft, so the link would teach the instructor that
                  their own course is broken. */}
              {course.status === 'published' ? (
                <Link
                  href={`/courses/${course.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="chip chip--quiet"
                >
                  <ExternalLink className="size-4" aria-hidden="true" />
                  {copy.admin.course.preview}
                </Link>
              ) : null}
              {/*
                Publishing is one press now, and it reaches the whole tree — see
                `PublishCourseButton`. UNPUBLISHING stays the plain status flip:
                taking a course off the catalog is a single, reversible decision
                about the course itself, and cascading it down to every lesson
                would silently discard the per-lecture arrangement an instructor
                had built.

                An archived course gets neither — it goes back to draft from the
                «⋯» menu first, so that the "at least one published lesson" check
                `setStatus('published')` enforces is never skipped.
              */}
              {course.status === 'archived' ? null : course.status === 'published' ? (
                <form action={publishAction}>
                  {/* Asks first. A draft course is a 404 to every enrolled
                      student — paying ones included — and this sits on a
                      sticky bar that is always under the cursor; publish-all,
                      archive and delete all asked, this alone did not. */}
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    disabled={publishPending}
                    onClick={(event) => {
                      if (!window.confirm(copy.admin.course.unpublishConfirm)) event.preventDefault();
                    }}
                  >
                    {copy.admin.course.unpublish}
                  </Button>
                </form>
              ) : (
                <PublishCourseButton courseId={course.id} onSkipped={setSkipped} />
              )}
              <CourseOverflowMenu courseId={course.id} status={course.status} />
            </div>
          </div>

          {/* Under the bar, not inside it: both are reports that can run to
              several lines, and a sticky bar that grows a paragraph tall covers
              the fields the instructor is reading it about. */}
          <div className="space-y-2 empty:hidden">
            <ActionError state={publishState} />
            <PublishReport skipped={skipped} />
          </div>

          <CourseForm
            taxonomy={taxonomy}
            defaults={{
              slug: course.slug,
              title: course.title,
              subtitle: course.subtitle,
              description: course.description,
              systemId: course.systemId,
              year: course.year,
              trackId: course.trackId,
              subjectId: course.subjectId,
              coverKey: course.coverKey,
              whatsappGroupUrl: course.whatsappGroupUrl,
              requiresGrant: course.requiresGrant,
              emphasis: course.emphasis,
              emphasisNote: course.emphasisNote,
              comingSoonNote: course.comingSoonNote,
              scheduleNote: course.scheduleNote,
              contentComplete: course.contentComplete,
              monthlyPriceCents: course.monthlyPriceCents,
              /* No `quarterlyPriceCents` — the form has no field for it any
                 more. The payload still carries it; nothing on this screen
                 renders it. */
              yearlyPriceCents: course.yearlyPriceCents,
              bookTitle: course.bookTitle,
              bookPriceCents: course.bookPriceCents,
              forGeneral: course.forGeneral,
              forLanguages: course.forLanguages,
            }}
            action={updateCourseAction.bind(null, course.id)}
            mode="edit"
            sellsByMonth={sellsByMonth}
            sellsTerms={course.terms.some((term) => term.priceCents !== null)}
            /* Each term's price with the other prices, and — on a course still
               sold by the thirty-day month — the one press that turns it over
               to curriculum months. */
            pricingSlot={
              <>
                <TermPriceFields courseId={course.id} terms={course.terms} />
                {/* Only on a course that actually sells a monthly plan — on a
                    free, yearly-only or term-only course «الاشتراك الشهري العادي»
                    is not true, and turning it over to months means nothing. */}
                {months !== null && months.length === 0 && course.monthlyPriceCents !== null ? (
                  <StartByMonth courseId={course.id} />
                ) : null}
              </>
            }
            termsSlot={<TermsBox courseId={course.id} terms={course.terms} />}
            /* Absent both when the months could not be read (see the `months`
               prop) and on a course with none — that one gets a single line in
               the pricing block instead of a box saying there is nothing here. */
            monthsSlot={
              months !== null && months.length > 0 ? (
                <MonthPanel
                  courseId={course.id}
                  months={months}
                  sections={course.sections}
                  monthlyPriced={course.monthlyPriceCents !== null}
                />
              ) : undefined
            }
            monthsAside={
              months !== null && months.length > 0 ? (
                <Badge tone={openMonths > 0 ? 'ok' : 'neutral'}>
                  {formatCopy(copy.admin.month.openCount, { open: openMonths, total: months.length })}
                </Badge>
              ) : undefined
            }
            /*
              «أضيف كتاب من جوه الكورس» — the SAME dialog `/admin/books/catalog`
              opens, with this course preselected and locked. Passed as a slot
              rather than rendered inside `CourseForm` because the panel reads
              the course's book through a Server Action, and that form is a pure
              controlled form with no data access of its own.
            */
            /* ستاك مالوش كتب مالوش «كتاب الكورس». `undefined` مش كومبوننت
               فاضي: `CourseForm` عندها فرع الـslot الغايب خلاص. */
            bookSlot={
              !booksOpen ? undefined : (
              <CourseBookPanel
                courseId={course.id}
                courseTitle={course.title}
                courseYear={course.year}
                forGeneral={course.forGeneral}
                forLanguages={course.forLanguages}
              />
              )
            }
          />

          {/*
            What used to stand between the form and the outline — the exam band,
            the video check, the terms panel and the months panel, four boxes in
            a row — is gone from here: terms and months are blocks of the form,
            beside the prices they are sold at; the video check is a button on
            the outline's own heading; the final exam is the outline's last row.
            «الصفحة دي مليانة بوكس» was, first of all, this stretch.
          */}
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[length:var(--fs-title-4)] font-semibold">{copy.course.content}</h2>
              {/* On the outline's heading because it is a statement about the
                  outline — which of these lectures will not play. */}
              <VideoCheckButton courseId={course.id} />
            </div>
            {course.sections.length === 0 ? (
              <p className="text-fg-muted">{copy.admin.section.empty}</p>
            ) : (
              <SectionList
                // Remounts only when the section SET changes, never on a pure
                // reorder — SORTED, because the joined ids in server order
                // changed on every reorder too, and the remount that followed
                // the drag collapsed every section he had open.
                key={course.sections
                  .map((section) => section.id)
                  .sort()
                  .join(',')}
                courseId={course.id}
                sections={course.sections}
                terms={course.terms}
                examLessonId={course.examLessonId}
              />
            )}
            <AddSectionForm courseId={course.id} terms={course.terms} />

            {/* The course's last step, where it sits for the student too —
                after every section, not above them as a heading. */}
            <div className="mt-6">
              <CourseExamGate course={course} sellsBySlice={sellsBySlice} />
            </div>
          </section>
        </div>
      </CourseMonthsProvider>
    </AutosaveProvider>
  );
}
