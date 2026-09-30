import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
// `/copy/admin`, never the root barrel: these screens only ever render inside
// the admin layout, and `copy.admin.*` lives in that module.
import { copy } from '@ayman/contracts/copy/admin';
import { AdminGradingAttemptSchema } from '@ayman/contracts/admin/exams';
import { adminGetOrNotFound } from '@/lib/admin-api';
import { GradingPaper } from '@/components/admin/grading/grading-paper';
import { gradingListHref, normalizeGradingQuery } from '../nav';

const c = copy.admin.grading;

export const metadata = { title: c.title };

/**
 * Western digits and a fixed order, the same rule every date here follows. The
 * year IS spelled out, unlike the queue's formatter: an essay can be marked
 * months after it was written — `recomputeScoreTx` rescales against the paper
 * as it was SAT, not as the quiz looks now — and «١٢/٠٣» with no year on a
 * screen about a grade is a question waiting to be asked.
 */
const submittedAtFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * One paper, marked.
 *
 * ## A page, not a dialog over the queue
 *
 * The same call `/admin/homework` made and for the same reason: what has to be
 * decided is a question stem and a written answer read at a size, per question,
 * with a mark and a note typed against each one. A modal over a list gives that
 * a scrollbar inside a scrollbar.
 *
 * ## `adminGetOrNotFound`
 *
 * An attempt id from a tab left open since yesterday, or one whose student
 * deleted their account, is a MISSING ROW — an ordinary outcome. `adminGet`
 * throws on every non-2xx and an unhandled throw in a Server Component is a 500
 * under `error.tsx`, so it would read «حصل خطأ» and be indistinguishable from a
 * broken endpoint. Only 404 is translated; a 401 or a 500 still throws, because
 * dressing a fault up as a missing row is how a dead route becomes an invisible
 * empty page. See the note in `lib/admin-api.ts`.
 *
 * The payload carries the student's written answer and the question stem, so it
 * is `attempt:grade` on the API side — admin-only, re-authorised there. This
 * page forwards the session cookie and decides nothing.
 */
export default async function AdminGradingPaperPage({
  params,
  searchParams,
}: {
  params: Promise<{ attemptId: string }>;
  /** Only present when the paper was opened from `/admin/grading` with a
   *  non-default tab/sort/exam/day — see `../nav`. */
  searchParams: Promise<{ tab?: string; sort?: string; exam?: string; day?: string }>;
}) {
  const { attemptId } = await params;
  const query = await searchParams;
  const attempt = await adminGetOrNotFound(
    `/api/admin/attempts/${attemptId}/grading`,
    AdminGradingAttemptSchema,
  );
  /*
   * ⚠️ كان `href="/admin/grading"` بالحرف — يعني «رجوع» من تبويب «اتصحّح
   * خلاص» أو «الأوائل»، أو من فلتر امتحان/يوم، كان بيرمي الأدمن على تبويب
   * «الطابور» الافتراضي: مش سوبر سِت لباقي التبويبات، فكان بيوهم إن الورق
   * اختفى. `ResultRow` بيبعت نفس الفلتر على لينك الورقة (`nav.ts`)، وهنا
   * بترجع نفس الحاجة بالظبط لو موجودة، أو `/admin/grading` عادي لو مفيش.
   */
  const backHref = gradingListHref(normalizeGradingQuery(query));

  return (
    <>
      {/* `ArrowRight` and not `ArrowLeft`: "back" points at the inline-start
          edge, and in an RTL layout that is the right-hand side. Same glyph
          `/admin/homework/[id]` uses for the same journey. */}
      <p className="mb-4">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-[length:var(--fs-text-sm)] text-fg-muted hover:text-fg"
        >
          <ArrowRight className="size-4" aria-hidden="true" />
          {c.title}
        </Link>
      </p>

      <GradingPaper
        attempt={attempt}
        submittedAtLabel={
          attempt.submittedAt ? submittedAtFormatter.format(new Date(attempt.submittedAt)) : null
        }
      />
    </>
  );
}
