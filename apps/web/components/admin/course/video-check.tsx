'use client';

import { useState } from 'react';
import type { CourseVideoCheck, CourseVideoCheckRow } from '@ayman/contracts/content';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { checkCourseVideosAction } from '@/app/(admin)/admin/courses/actions';

const c = copy.admin.course;

/** Every answer that is not "it plays", in the instructor's words. */
function reasonOf(row: CourseVideoCheckRow): string {
  if (row.externalId === null) return c.videoCheckNoVideo;
  if (row.embed === 'blocked') return c.videoCheckBlocked;
  if (row.embed === 'unavailable') return c.videoCheckUnavailable;
  return c.videoCheckUnknown;
}

/**
 * «افحص فيديوهات الكورس» — the whole course's videos, in one press.
 *
 * ## Why a button and not something the page does on load
 *
 * It costs one round trip to YouTube per video, deliberately in series (see
 * `CourseService.checkVideos`): forty simultaneous requests from one datacenter
 * IP is how the probe gets throttled into answering «مقدرناش نتأكد» for
 * everything. On load that would be a slow page for an answer nobody asked for;
 * as a button it is a few seconds when you want it.
 *
 * ## Why it exists at all
 *
 * The per-lecture check fires when a link is pasted, which is the right moment
 * for a lecture being written and no help whatsoever for a course that has been
 * live for a month. A video can go private long after it was saved, and the
 * first sign is a student saying it will not play — with no way to tell WHICH
 * lecture without opening all of them.
 *
 * ⚠️ An `unknown` is reported, not hidden. It reads «مقدرناش نتأكد منه», which
 * is what it is: the probe could not get an answer. Presenting that as an
 * all-clear is the failure mode this whole feature was added to end — and
 * presenting it as a fault is the one that shipped and had to be fixed.
 */
export function VideoCheckButton({ courseId }: { courseId: string }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<CourseVideoCheck | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    setResult(null);
    const outcome = await checkCourseVideosAction(courseId);
    setPending(false);
    if (outcome.ok) setResult(outcome.result);
    else setError(outcome.message);
  }

  return (
    <section>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={() => void run()} disabled={pending}>
          {pending ? c.videoCheckRunning : c.videoCheck}
        </Button>
        <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.videoCheckHint}</p>
      </div>

      {error === null ? null : (
        <p role="alert" className="mt-2 text-[length:var(--fs-text-sm)] text-err">
          {error}
        </p>
      )}

      {result === null ? null : result.problems.length === 0 ? (
        <p role="status" className="mt-2 text-[length:var(--fs-text-sm)] text-[color:var(--ok)]">
          {c.videoCheckAllGood} ({result.checked})
        </p>
      ) : (
        <div
          role="status"
          className="mt-2 max-w-[var(--w-prose)] rounded-md border border-line bg-surface-2 p-3"
        >
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.videoCheckProblems}</p>
          <ul className="mt-2 space-y-1">
            {result.problems.map((row) => (
              <li key={row.lessonId} className="text-[length:var(--fs-text-sm)]">
                <span className="text-fg">{row.title}</span>
                <span className="text-fg-muted"> · {row.sectionTitle}</span>
                {/* The published ones first in the reader's mind: a broken
                    draft is a job for later, a broken LIVE lecture is students
                    hitting it right now. */}
                {row.isPublished ? <span className="text-err"> · {c.statusPublished}</span> : null}
                <span className="block text-[length:var(--fs-text-xs)] text-err">
                  {reasonOf(row)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
