'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock3, ImagePlus, NotebookPen, RotateCcw, X } from 'lucide-react';
// The `/copy` SUBPATH, never the root barrel: this is a client component on
// the busiest student route, and a barrel import registers the whole
// contracts module set as a client reference. `client-barrel.test.ts`
// fails the build for it.
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import type { MyHomeworkSubmission, StudentHomework } from '@ayman/contracts/homework';
import { Button } from '@ayman/ui/components/button';
import { cn } from '@ayman/ui/lib/cn';
import { uploadHomeworkImage } from '@/lib/upload-client';
import { submitHomeworkAction } from '@/app/(app)/courses/[slug]/lessons/[lessonId]/homework-actions';

const c = copy.homework;

/** One page the student has picked but not yet handed in. */
interface StagedPage {
  /** A `blob:` URL for the thumbnail. Revoked when the page is dropped. */
  preview: string;
  storageKey: string;
  sizeBytes: number;
}

/**
 * الواجب, on the lecture that set it.
 *
 * ## Why this sits under the player and not in the sidebar
 *
 * «لو في واجب قولي واجب، يبقى أظهره بشكل كويس وكبير.» The sidebar column is
 * the table of contents — things you navigate BY. Homework is a thing you DO,
 * on this lecture, and it is the second most important object on the page
 * after the video itself. It gets the main column's full width and a coloured
 * band, and it renders nothing at all when the lecture has no exercise, which
 * is most lectures.
 *
 * ## The upload is per PAGE, and it happens before «تسليم»
 *
 * Each photograph goes browser → API as it is picked, and what crosses into
 * the Server Action afterwards is three short strings per page. That is not a
 * refinement: a Server Action buffers its whole payload in the Next server's
 * memory and is capped at 1 MB, so a phone photo posted through one would
 * vanish with no error anywhere — see `lib/upload-client.ts` for the four
 * sizes that proved it. It also means a failed page can be retried on its own
 * instead of costing the other three, and that the student sees each thumbnail
 * land rather than staring at one long silence.
 *
 * ## Three states, one component
 *
 * Nothing handed in → the upload box. Handed in and waiting → the pages, with
 * «مستني مراجعة». Marked → the verdict, the mark, his note, and — for
 * «فكّر أكتر» — the upload box again, open, because the whole point of that
 * verdict is that the exercise is not finished.
 */
export function LessonHomework({
  lessonId,
  homework,
}: {
  lessonId: string;
  homework: StudentHomework;
}) {
  const router = useRouter();
  const [staged, setStaged] = useState<StagedPage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const submission = homework.submission;
  /*
   * The one state where the box is open on top of an existing submission.
   *
   * `accepted` is finished — the API refuses a resubmission on it — and
   * `submitted` is waiting on him, where a second upload would replace pages he
   * may already be looking at. `needs_work` is the invitation.
   */
  const reopened = submission?.status === 'needs_work';
  const canUpload = submission === null || reopened;
  const remaining = homework.maxImages - staged.length;

  async function pick(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);

    const chosen = [...files];
    if (chosen.length > remaining) {
      setError(formatCopy(c.tooMany, { max: homework.maxImages }));
      return;
    }

    setBusy(true);
    for (const file of chosen) {
      const result = await uploadHomeworkImage(lessonId, file);
      if (!result.ok) {
        // One message per thing that can actually go wrong, rather than a
        // generic failure: «الصورة كبيرة» and «ده مش ملف صورة» need different
        // actions from the student, and only one of them is worth retrying.
        setError(
          result.reason === 'tooLarge'
            ? c.tooLarge
            : result.reason === 'badType' || result.reason === 'unreadable'
              ? c.badType
              : c.uploadFailed,
        );
        break;
      }
      setStaged((current) => [
        ...current,
        {
          preview: URL.createObjectURL(file),
          storageKey: result.value.storageKey,
          sizeBytes: result.value.sizeBytes,
        },
      ]);
    }
    setBusy(false);
    // The input keeps its previous FileList otherwise, so picking the same
    // photograph twice in a row fires no `change` event at all.
    if (fileInput.current) fileInput.current.value = '';
  }

  function drop(index: number) {
    setStaged((current) => {
      const page = current[index];
      // The object stays in the bucket — it is unreferenced, and the 30-day
      // sweep is what eventually takes it. Revoking the blob is what this can
      // actually do, and not doing it leaks the decoded image for the life of
      // the page.
      if (page) URL.revokeObjectURL(page.preview);
      return current.filter((_, position) => position !== index);
    });
  }

  function submit() {
    if (staged.length === 0) {
      setError(c.empty);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitHomeworkAction(
        lessonId,
        staged.map((page) => ({ storageKey: page.storageKey, sizeBytes: page.sizeBytes })),
      );
      if (!result.ok) {
        setError(c.submitFailed);
        return;
      }
      for (const page of staged) URL.revokeObjectURL(page.preview);
      setStaged([]);
      // The card is rendered from the player payload, so the new status
      // arrives with the route's own data rather than from a second state
      // machine here that could disagree with it.
      router.refresh();
    });
  }

  return (
    <section
      aria-label={c.title}
      className="mt-6 overflow-hidden rounded-[var(--r-lg)] border border-line bg-surface-2"
    >
      {/*
        The coloured band. It is what makes «فيه واجب» readable from the top of
        the page without reading a word — the ask was «أظهره بشكل كويس وكبير»,
        and a bordered rectangle with a heading in it is not that.
      */}
      <header className="flex items-center gap-3 border-b border-line bg-[color:var(--e-tint)] px-4 py-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-[var(--r-md)] bg-[color:var(--e-ink)]/10 text-[color:var(--e-ink)]"
        >
          <NotebookPen className="size-5" />
        </span>
        <h2 className="text-[length:var(--fs-title-4)] font-semibold text-fg">{c.title}</h2>
        {submission ? <StatusChip status={submission.status} /> : null}
      </header>

      <div className="p-4 sm:p-5">
        <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.lead}</p>
        {/*
          `whitespace-pre-line`, not a rich-text renderer. The body is PLAIN
          text with newlines — «١- … ٢- … ٣- …» — and rendering it as markup
          would mean an HTML sink on the one screen a student also uploads
          files to. See `LessonHomework.body` in schema.prisma.
        */}
        <p className="mt-1 whitespace-pre-line text-[length:var(--fs-text-base)] leading-relaxed text-fg">
          {homework.body}
        </p>

        {submission ? <Verdict submission={submission} /> : null}

        {canUpload ? (
          <div className="mt-5">
            {reopened ? (
              <p className="mb-3 rounded-[var(--r-md)] bg-[color-mix(in_oklch,var(--warn),transparent_90%)] px-3 py-2 text-[length:var(--fs-text-sm)] text-fg">
                {c.reopened}
              </p>
            ) : null}

            <p className="text-[length:var(--fs-text-base)] font-semibold text-fg">
              {c.uploadTitle}
            </p>
            <p className="mt-0.5 text-[length:var(--fs-text-sm)] text-fg-muted">
              {formatCopy(c.uploadHint, { max: homework.maxImages })}
            </p>

            {staged.length > 0 ? (
              <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {staged.map((page, index) => (
                  <li
                    key={page.storageKey}
                    className="relative aspect-[3/4] overflow-hidden rounded-[var(--r-md)] border border-line bg-surface-3"
                  >
                    {/* A plain `<img>` on a `blob:` URL of a photo the browser
                        already holds — the optimizer cannot fetch one of those
                        and would only fail. */}
                    <img src={page.preview} alt="" className="size-full object-cover" />
                    <button
                      type="button"
                      onClick={() => drop(index)}
                      aria-label={c.remove}
                      className="absolute end-1 top-1 grid size-7 place-items-center rounded-full bg-[color:var(--n-1)]/80 text-fg backdrop-blur"
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                id={`homework-file-${lessonId}`}
                onChange={(event) => void pick(event.target.files)}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={busy || remaining <= 0}
                onClick={() => fileInput.current?.click()}
              >
                <ImagePlus className="size-4" aria-hidden="true" />
                {busy ? c.uploading : c.pick}
              </Button>
              <Button type="button" onClick={submit} disabled={pending || busy || staged.length === 0}>
                {pending ? c.submitting : reopened ? c.resubmit : c.submit}
              </Button>
              {staged.length > 0 ? (
                <span className="text-[length:var(--fs-text-sm)] text-fg-muted tabular-nums">
                  {staged.length} {c.imageUnit}
                </span>
              ) : null}
            </div>

            {error ? (
              <p
                role="alert"
                className="mt-2 text-[length:var(--fs-text-sm)] text-[color:var(--err)]"
              >
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** The verdict, the mark, his note, and what happened to the pages. */
function Verdict({ submission }: { submission: MyHomeworkSubmission }) {
  return (
    <div className="mt-4 rounded-[var(--r-md)] border border-line bg-surface-3 p-3.5">
      <p className="text-[length:var(--fs-text-sm)] text-fg-muted tabular-nums">
        {formatCopy(c.submittedCount, { n: submission.imageCount })}
        {submission.attempt > 1 ? ` · ${c.attempt} ${submission.attempt}` : ''}
      </p>

      {submission.imageIds.length > 0 ? (
        <ul className="mt-2.5 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {submission.imageIds.map((id) => (
            <li
              key={id}
              className="aspect-[3/4] overflow-hidden rounded-[var(--r-md)] border border-line bg-surface-2"
            >
              {/*
                A plain `<img>`, never `next/image`. The bytes come from an
                `/api/…` route that re-checks the session on every request; the
                optimizer fetches through its own path and caches the result
                publicly, which would hand a photograph of somebody's homework
                to `/_next/image` as a cacheable resource. Same reasoning as
                `MessageAttachmentView`.
              */}
              <img
                src={`/api/homework/images/${id}`}
                alt=""
                loading="lazy"
                className="size-full object-cover"
              />
            </li>
          ))}
        </ul>
      ) : submission.imagesPurged ? (
        // Says what happened AND that the submission is intact — a card that
        // simply showed nothing would read as the platform having lost the
        // work, which is the one thing it must not do.
        <p className="mt-2 text-[length:var(--fs-text-sm)] text-fg-muted">{c.imagesGone}</p>
      ) : null}

      {submission.reviewNote ? (
        <div className="mt-3.5 border-t border-line pt-3">
          <p className="text-[length:var(--fs-text-sm)] font-semibold text-fg">{c.note}</p>
          <p className="mt-1 whitespace-pre-line text-[length:var(--fs-text-base)] leading-relaxed text-fg">
            {submission.reviewNote}
          </p>
          {submission.grade !== null ? (
            <p className="mt-2 text-[length:var(--fs-text-base)] font-semibold text-[color:var(--ok)] tabular-nums">
              {formatCopy(c.grade, { grade: submission.grade })}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const STATUS_STYLE = {
  submitted: 'bg-[color:var(--n-1)] text-fg-muted border-line',
  accepted:
    'bg-[color-mix(in_oklch,var(--ok),transparent_88%)] text-[color:var(--ok)] border-[color:var(--ok)]',
  needs_work:
    'bg-[color-mix(in_oklch,var(--warn),transparent_88%)] text-[color:var(--warn)] border-[color:var(--warn)]',
} as const;

const STATUS_LABEL = {
  submitted: c.statusPending,
  accepted: c.statusAccepted,
  needs_work: c.statusNeedsWork,
} as const;

const STATUS_ICON = {
  submitted: Clock3,
  accepted: CheckCircle2,
  needs_work: RotateCcw,
} as const;

function StatusChip({ status }: { status: MyHomeworkSubmission['status'] }) {
  const Icon = STATUS_ICON[status];
  return (
    <span
      className={cn(
        'ms-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[length:var(--fs-text-xs)] font-semibold',
        STATUS_STYLE[status],
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}
