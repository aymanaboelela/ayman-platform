import Link from 'next/link';
import { z } from 'zod';
import { QUESTION_TYPES, copy, formatCopy } from '@ayman/contracts';
import { Badge, Card, CardBody } from '@ayman/ui';
import { apiGetAuthed } from '@/lib/api-server';
import { BulkImportDialog } from '@/components/admin/quiz/bulk-import-dialog';
import { NewCategoryForm } from '@/components/admin/quiz/new-category-form';

const CategorySchema = z.object({ id: z.string(), name: z.string() });

const BankEntrySchema = z.object({
  id: z.string(),
  category: z.object({ id: z.string(), name: z.string() }),
  versions: z.array(
    z.object({
      id: z.string(),
      version: z.number(),
      status: z.enum(['draft', 'ready']),
      type: z.enum(QUESTION_TYPES),
      stemHtml: z.string(),
      defaultMark: z.union([z.number(), z.string()]),
    }),
  ),
});

export const metadata = { title: copy.quizAdmin.bankTitle };

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

/** Not cached — an editor publishing a question must see it reflected immediately. */
export default async function QuestionBankPage() {
  const [entries, categories] = await Promise.all([
    apiGetAuthed('/api/admin/questions', z.array(BankEntrySchema)),
    apiGetAuthed('/api/admin/questions/categories', z.array(CategorySchema)),
  ]);

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-[length:var(--fs-title-2)] font-semibold">{copy.quizAdmin.bankTitle}</h1>
        <div className="flex items-center gap-3">
          <BulkImportDialog categories={categories} />
          <Link href="/admin/questions/new" className="rounded-sm bg-accent px-4 py-2 font-medium text-[#1A1206]">
            {copy.quizAdmin.newQuestion}
          </Link>
        </div>
      </div>

      <div className="mb-6">
        <NewCategoryForm categories={categories} />
      </div>

      {entries.length === 0 ? (
        <p className="text-fg-muted">{copy.quizAdmin.questionsEmpty}</p>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => {
            const latest = entry.versions[0];
            if (!latest) return null;
            return (
              <li key={entry.id}>
                <Card>
                  <CardBody className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <Link href={`/admin/questions/${entry.id}`} className="block truncate font-medium text-fg">
                        {stripHtml(latest.stemHtml) || copy.quizAdmin.newQuestion}
                      </Link>
                      <p className="mono mt-1 text-[length:var(--fs-mono-label)] text-fg-muted">
                        {entry.category.name} · {copy.quizAdmin.types[latest.type]}
                      </p>
                    </div>
                    <Badge tone={latest.status === 'ready' ? 'accent' : 'neutral'}>
                      {latest.status === 'ready'
                        ? formatCopy(copy.quizAdmin.versionBadge, { n: latest.version })
                        : copy.quizAdmin.draftBadge}
                    </Badge>
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
