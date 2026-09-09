import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { z } from '@ayman/contracts/zod';
import { copy } from '@ayman/contracts/copy/admin';
import { adminGet } from '@/lib/admin-api';
import { ExamForm } from '@/components/admin/exams/exam-form';

const c = copy.admin.monthlyExams;

/** Only what the course select renders — see the list page's own note. */
const CoursePickSchema = z.array(z.object({ id: z.uuid(), title: z.string() }));

export const metadata = { title: c.create };

/**
 * «امتحان جديد».
 *
 * One submit writes the course's «امتحانات الشهر» shelf (on first use), the
 * exam's lesson, its quiz with the window and the timer, and its coverage rows
 * — one transaction, server-side. The form is the only thing on this page
 * because there is only one decision here.
 *
 * It lands as a DRAFT. An exam with no questions in it must not be able to
 * reach a student, so publishing is a separate, explicit act on the list with
 * its own preflight behind it.
 */
export default async function NewExamPage() {
  const courses = await adminGet('/api/admin/courses', CoursePickSchema);

  return (
    <>
      {/* `ArrowRight`, not `ArrowLeft`: "back" points at the inline-START edge,
          which in RTL is the right — the same choice every other admin detail
          page makes. The crumb exists because this page has no other exit and
          the browser's own back button loses a half-filled form on a mis-click. */}
      <Link
        href="/admin/exams"
        className="inline-flex items-center gap-1 text-[length:var(--fs-text-sm)] text-fg-muted hover:text-fg"
      >
        <ArrowRight className="size-4" aria-hidden="true" />
        {c.title}
      </Link>

      <h1 className="mt-2 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.create}</h1>
      <p className="mt-1 max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] text-fg-muted">
        {c.lead}
      </p>

      <ExamForm courses={courses} />
    </>
  );
}
