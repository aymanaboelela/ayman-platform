import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, CalendarDays, ChevronLeft, Trophy, Users } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import {
  AdminHonorExamBoardSchema,
  AdminHonorExamListSchema,
} from '@ayman/contracts/admin/honor-board';
import { cn } from '@ayman/ui';
import { adminGet } from '@/lib/admin-api';
import { getEntitlements } from '@/lib/entitlements';
import { ExamTopTen } from './exam-top-ten';

const c = copy.admin.honorBoard;

export const metadata = { title: c.fromExam };

/**
 * `/admin/honor-board/exam` — «الأوائل من امتحان الشهر».
 *
 * Two states on one address: no `?lesson=` lists the month exams that have
 * papers; with it, that exam's best papers and the ranking form. A link and
 * not client state, so the back button walks back to the list.
 *
 * 404s with the feature off, like the board screen it hangs off.
 */
export default async function HonorExamPage({
  searchParams,
}: {
  searchParams: Promise<{ lesson?: string }>;
}) {
  if (!(await getEntitlements()).honorBoard) notFound();
  const { lesson } = await searchParams;

  if (lesson) {
    const board = await adminGet(
      `/api/admin/honor-board/exams/${encodeURIComponent(lesson)}`,
      AdminHonorExamBoardSchema,
    );
    return (
      <div className="space-y-5">
        <BackLink href="/admin/honor-board/exam" label={c.examsTitle} />
        <header>
          <h1 className="flex items-center gap-2 text-[length:var(--fs-title-2)] font-semibold text-fg">
            <Trophy className="size-6 text-accent" strokeWidth={1.5} aria-hidden="true" />
            {board.title}
          </h1>
          {board.courseLabel ? (
            <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{board.courseLabel}</p>
          ) : null}
        </header>
        {/* Keyed on the server's answer, so a publish that comes back with new
            ranks remounts the form on them instead of keeping stale state. */}
        <ExamTopTen
          key={board.candidates.map((row) => `${row.attemptId}:${row.pinnedRank ?? ''}`).join(',')}
          board={board}
        />
      </div>
    );
  }

  const { exams } = await adminGet('/api/admin/honor-board/exams', AdminHonorExamListSchema);

  return (
    <div className="space-y-5">
      <BackLink href="/admin/honor-board" label={c.back} />
      <header>
        <h1 className="flex items-center gap-2 text-[length:var(--fs-title-2)] font-semibold text-fg">
          <Trophy className="size-6 text-accent" strokeWidth={1.5} aria-hidden="true" />
          {c.fromExam}
        </h1>
        <p className="mt-1 max-w-2xl text-[length:var(--fs-text-sm)] text-fg-muted">{c.fromExamLead}</p>
      </header>

      {exams.length === 0 ? (
        <p className="rounded-[var(--r-lg)] border border-dashed border-line p-8 text-center text-[length:var(--fs-text-sm)] text-fg-muted">
          {c.examsEmpty}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {exams.map((exam) => (
            <li key={exam.lessonId}>
              <Link
                href={`/admin/honor-board/exam?lesson=${exam.lessonId}`}
                className={cn(
                  'flex h-full items-center gap-3 rounded-[var(--r-lg)] border border-line bg-surface-1 p-4',
                  'transition-colors hover:border-accent/60 hover:bg-accent/5',
                )}
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent/15 text-accent-text">
                  <Trophy className="size-6" strokeWidth={1.5} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[length:var(--fs-text-base)] font-semibold text-fg">
                    {exam.title}
                  </span>
                  <span className="block truncate text-[length:var(--fs-text-sm)] text-fg-muted">
                    {exam.courseLabel || exam.courseTitle}
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[length:var(--fs-text-xs)]">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--info)_14%,transparent)] px-2 py-0.5 text-fg">
                      <Users className="size-3.5" aria-hidden="true" />
                      {formatCopy(c.examSat, { n: exam.sat })}
                    </span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5',
                        exam.pinned > 0
                          ? 'bg-[color-mix(in_oklab,var(--ok)_16%,transparent)] text-fg'
                          : 'bg-[color-mix(in_oklab,var(--warn)_16%,transparent)] text-fg',
                      )}
                    >
                      {exam.pinned > 0 ? formatCopy(c.examPinned, { n: exam.pinned }) : c.examNotPinned}
                    </span>
                    {exam.opensAt ? (
                      <span className="inline-flex items-center gap-1 text-fg-subtle">
                        <CalendarDays className="size-3.5" aria-hidden="true" />
                        {dateFormatter.format(new Date(exam.opensAt))}
                      </span>
                    ) : null}
                  </span>
                </span>
                <ChevronLeft className="size-5 shrink-0 text-fg-subtle" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-[length:var(--fs-text-sm)] text-accent-text hover:underline"
    >
      <ArrowRight className="size-4" aria-hidden="true" />
      {label}
    </Link>
  );
}

const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  day: '2-digit',
  month: 'long',
  timeZone: 'Africa/Cairo',
});
