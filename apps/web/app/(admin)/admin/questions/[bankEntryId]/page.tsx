import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { z } from 'zod';
import { QuestionInputSchema } from '@ayman/contracts/quiz/question';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { apiGetAuthed, apiGetAuthedOrNotFound } from '@/lib/api-server';
import { PublishQuestionButton } from '@/components/admin/quiz/publish-question-button';
import { QuestionForm } from '@/components/admin/quiz/question-form';
import { QuestionPageActions } from '@/components/admin/quiz/question-page-actions';
import '@/components/admin/quiz/question-bank.css';

const c = copy.quizAdmin.bank;

const CategorySchema = z.object({ id: z.string(), name: z.string() });

const HydratedSchema = z.object({
  bankEntryId: z.string(),
  versionId: z.string(),
  version: z.number(),
  // See the identical comment in `admin/questions/page.tsx` — Prisma's
  // `QuestionStatus` also has `hidden` (a retired question), and omitting it
  // here throws a `ZodError` on `apiGetAuthed` for that entry.
  status: z.enum(['draft', 'ready', 'hidden']),
  archivedAt: z.string().nullable().default(null),
  usedInQuizzes: z.number().int().default(0),
  input: QuestionInputSchema,
});

export const metadata = { title: copy.quizAdmin.editQuestion };

/**
 * One question. The note above the form says what state it is in — a draft
 * nobody can see yet, a published version, or a question that left the bank —
 * because each of those changes what saving here does, and a toast that said
 * it once is gone by the time it matters.
 */
export default async function EditQuestionPage({
  params,
}: {
  params: Promise<{ bankEntryId: string }>;
}) {
  const { bankEntryId } = await params;
  const [hydrated, categories] = await Promise.all([
    apiGetAuthedOrNotFound(`/api/admin/questions/${bankEntryId}`, HydratedSchema),
    apiGetAuthed('/api/admin/questions/categories', z.array(CategorySchema)),
  ]);
  const archived = hydrated.archivedAt !== null;

  return (
    <>
      <Link href="/admin/questions" className="qpage-crumb">
        <ArrowRight className="size-4" aria-hidden="true" />
        {c.backToBank}
      </Link>

      <div className="qpage-head">
        <h1 className="text-[length:var(--fs-title-2)] font-semibold">{copy.quizAdmin.editQuestion}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {hydrated.status === 'ready' || archived ? null : <PublishQuestionButton versionId={hydrated.versionId} />}
          <QuestionPageActions bankEntryId={hydrated.bankEntryId} archived={archived} />
        </div>
      </div>

      {archived ? (
        <p className="qpage-note qpage-note--archived">{c.archivedNote}</p>
      ) : (
        <p className={hydrated.status === 'ready' ? 'qpage-note' : 'qpage-note qpage-note--draft'}>
          <span>
            {hydrated.status === 'ready'
              ? formatCopy(c.publishedNote, { n: hydrated.version })
              : // A draft ON TOP of a published version: students still get the
                // old one, which is a different sentence from «nobody sees it».
                hydrated.version > 1
                ? copy.quizAdmin.slotDraftPending
                : c.draftNote}
          </span>
          {hydrated.usedInQuizzes > 1 ? (
            <span className="font-medium">{formatCopy(c.sharedNote, { n: hydrated.usedInQuizzes })}</span>
          ) : null}
        </p>
      )}

      <QuestionForm
        categories={categories}
        bankEntryId={hydrated.bankEntryId}
        defaultValues={hydrated.input}
        publishOnSave={!archived}
      />
    </>
  );
}
