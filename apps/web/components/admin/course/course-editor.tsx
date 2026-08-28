'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useState } from 'react';
import { toast } from 'sonner';
import type { Taxonomy } from '@ayman/contracts/taxonomy';
import { copy } from '@ayman/contracts/copy/admin';
import { Badge } from '@ayman/ui/components/badge';
import { Button } from '@ayman/ui/components/button';
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
import { SaveIndicator } from './save-indicator';
import { AddSectionForm } from './section-card';
import { SectionList } from './section-list';
import { TermPanel } from './term-panel';
import { ActionError, IDLE } from './action-state';

const COURSE_STATUS_LABEL = {
  draft: copy.admin.course.statusDraft,
  published: copy.admin.course.statusPublished,
  archived: copy.admin.course.statusArchived,
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

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" onClick={() => void onPublish()} disabled={pending}>
        {copy.admin.course.publishAll}
      </Button>
      <p className="max-w-[22rem] text-end text-[length:var(--fs-text-xs)] text-fg-muted">
        {copy.admin.course.publishAllHint}
      </p>
    </div>
  );
}

type SkippedLesson = { id: string; title: string; reason: PublishSkipReason };

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
    <div className="mt-1 max-w-[22rem] rounded-md border border-line bg-surface-2 p-2 text-end">
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
 * Retiring a finished course — distinct from `unpublish` (which goes to
 * `draft`, i.e. "still being worked on"). Same confirm+toast shape as
 * `DeleteSubjectButton` (taxonomy/subjects/subjects-editor.tsx), not the
 * `useActionState`+`ActionError` shape the publish toggle above uses: this
 * is a standalone destructive-ish action, not a form field.
 */
function ArchiveCourseButton({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onArchive() {
    if (!window.confirm(copy.admin.course.archiveConfirm)) return;
    setPending(true);
    const result = await setCourseStatusAction(courseId, 'archived');
    setPending(false);
    if (result.ok) {
      toast.success(copy.admin.actions.archive);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => void onArchive()}
      disabled={pending}
    >
      {copy.admin.actions.archive}
    </Button>
  );
}

function RestoreCourseButton({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onRestore() {
    if (!window.confirm(copy.admin.course.restoreConfirm)) return;
    setPending(true);
    const result = await setCourseStatusAction(courseId, 'draft');
    setPending(false);
    if (result.ok) {
      toast.success(copy.admin.actions.restore);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => void onRestore()}
      disabled={pending}
    >
      {copy.admin.actions.restore}
    </Button>
  );
}

/**
 * I4 (audit): the API 409s when the course has student quiz attempts —
 * `deleteCourseAction` already turns that into `copy.admin.course.deleteBlockedAttempts`.
 * A course with no attempts hard-deletes and this navigates back to the list,
 * since the detail page it was just rendered from no longer exists.
 */
function DeleteCourseButton({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onDelete() {
    if (!window.confirm(copy.admin.course.deleteConfirm)) return;
    setPending(true);
    const result = await deleteCourseAction(courseId);
    setPending(false);
    if (result.ok) {
      toast.success(copy.admin.actions.delete);
      router.push('/admin/courses');
    } else {
      toast.error(result.message);
    }
  }

  return (
    <Button
      type="button"
      variant="danger"
      size="sm"
      onClick={() => void onDelete()}
      disabled={pending}
    >
      {copy.admin.actions.delete}
    </Button>
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
}: {
  course: AdminCourseDetail;
  taxonomy: Taxonomy;
}) {
  const nextStatus = course.status === 'published' ? 'draft' : 'published';
  const [publishState, publishAction, publishPending] = useActionState<ActionResult, FormData>(
    () => setCourseStatusAction(course.id, nextStatus),
    IDLE,
  );
  // Held HERE, not in the publish button: a successful publish swaps that
  // button out for the unpublish form, which would unmount the report at the
  // instant it was produced.
  const [skipped, setSkipped] = useState<SkippedLesson[]>([]);

  return (
    /*
      Everything under here saves itself, and reports into the ONE indicator
      beside the title. There is no «حفظ» button anywhere in the editor now
      except on the forms that CREATE something (a section, a lecture, a
      material), because creating a row is an act and setting a field is not.
    */
    <AutosaveProvider>
      <div className="space-y-10">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-[length:var(--fs-title-2)] font-semibold">
              {course.title}
            </h1>
            <p className="mono mt-1 text-[length:var(--fs-mono-label)] text-fg-muted">
              {course.slug}
            </p>
            <SaveIndicator className="mt-2" />
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Badge tone={course.status === 'published' ? 'accent' : 'neutral'}>
              {COURSE_STATUS_LABEL[course.status]}
            </Badge>
            <div className="flex items-center gap-2">
              {course.status === 'archived' ? (
                // Archived only ever goes back to draft: restoring straight to
                // published would skip the "at least one published lesson"
                // check that setStatus('published') enforces fresh every time.
                <RestoreCourseButton courseId={course.id} />
              ) : (
                <>
                  {/*
                  Publishing is one press now, and it reaches the whole tree —
                  see `PublishCourseButton`. UNPUBLISHING stays the plain
                  status flip: taking a course off the catalog is a single,
                  reversible decision about the course itself, and cascading it
                  down to every lesson would silently discard the per-lecture
                  arrangement an instructor had built.
                */}
                  {course.status === 'published' ? (
                    <form action={publishAction}>
                      <Button type="submit" variant="secondary" disabled={publishPending}>
                        {copy.admin.course.unpublish}
                      </Button>
                    </form>
                  ) : (
                    <PublishCourseButton courseId={course.id} onSkipped={setSkipped} />
                  )}
                  {/* I4 (audit): a distinct state from `draft` — retiring a
                    finished course is a different intent from an instructor
                    unpublishing a work-in-progress, and the catalog (which
                    filters on `status: 'published'` exactly) excludes both. */}
                  <ArchiveCourseButton courseId={course.id} />
                </>
              )}
            </div>
            <ActionError state={publishState} />
            <PublishReport skipped={skipped} />
            {/* I4 (audit): a course with any student quiz attempt can never be
              hard-deleted — attempt_events is append-only at the DB level,
              forever, even after archiving. deleteCourseAction surfaces that
              refusal in Arabic and points at archiving instead of a raw
              stack trace. A course with no attempts still hard-deletes. */}
            <DeleteCourseButton courseId={course.id} />
          </div>
        </div>

        <section>
          <h2 className="mb-3 text-[length:var(--fs-title-4)] font-semibold">
            {copy.admin.course.edit}
          </h2>
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
              requiresGrant: course.requiresGrant,
              emphasis: course.emphasis,
              emphasisNote: course.emphasisNote,
              comingSoonNote: course.comingSoonNote,
              monthlyPriceCents: course.monthlyPriceCents,
              quarterlyPriceCents: course.quarterlyPriceCents,
              yearlyPriceCents: course.yearlyPriceCents,
              bookTitle: course.bookTitle,
              bookPriceCents: course.bookPriceCents,
              forGeneral: course.forGeneral,
              forLanguages: course.forLanguages,
            }}
            action={updateCourseAction.bind(null, course.id)}
            mode="edit"
          />
        </section>

        {/*
        Above the outline, not below it. The exam is the course's SHAPE — the
        thing every other lesson is gated against — and it sat at the bottom of
        the page as a footnote, reachable only after scrolling past forty
        lessons. Its band also states the gate rule with a live number, which
        is worth reading before you start publishing, not after.
      */}
        <CourseExamGate course={course} />

        {/*
          Beside the exam gate, above the outline: both are statements about
          whether this course is FIT to be seen, which is what you want to read
          before publishing rather than after a student writes in.
        */}
        <VideoCheckButton courseId={course.id} />

        <TermPanel courseId={course.id} terms={course.terms} />

        <section>
          <h2 className="mb-3 text-[length:var(--fs-title-4)] font-semibold">
            {copy.course.content}
          </h2>
          {course.sections.length === 0 ? (
            <p className="text-fg-muted">{copy.admin.section.empty}</p>
          ) : (
            <SectionList
              // Remounts only when the section SET changes, never on a pure
              // reorder — same reasoning as the lesson list's key.
              key={course.sections.map((section) => section.id).join(',')}
              courseId={course.id}
              sections={course.sections}
              terms={course.terms}
              examLessonId={course.examLessonId}
              courseStream={{
                forGeneral: course.forGeneral,
                forLanguages: course.forLanguages,
              }}
            />
          )}
          <AddSectionForm courseId={course.id} />
        </section>
      </div>
    </AutosaveProvider>
  );
}
