import Link from 'next/link';
import { z } from 'zod';
import { QUESTION_TYPES, formatCopy } from '@ayman/contracts';
import { copy } from '@ayman/contracts/copy/admin';
import { Badge, Card, CardBody } from '@ayman/ui';
import { apiGetAuthed } from '@/lib/api-server';
import { ListControl, ListPager } from '@/components/admin/list-controls';
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
      // Prisma's `QuestionStatus` has a third value, `hidden` (a retired
      // question — see `schema.spec.ts`'s "still allows ready -> hidden"
      // test). Omitting it here isn't just a missing badge: it throws a
      // `ZodError` on `apiGetAuthed` and takes down the ENTIRE bank list the
      // moment any one entry's latest version is hidden. `hidden` renders
      // through the same non-`ready` branch as `draft` below.
      status: z.enum(['draft', 'ready', 'hidden']),
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

/** Fifty was the API's default and the page never sent anything else, so the
 *  bank showed its newest 50 and stopped. See `ListPager`. */
const PER_PAGE = 50;

/** Not cached — an editor publishing a question must see it reflected immediately. */
export default async function QuestionBankPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string): string => {
    const value = Array.isArray(params[key]) ? params[key][0] : params[key];
    return typeof value === 'string' ? value : '';
  };
  const search = one('q').trim().slice(0, 120);
  const categoryId = one('category');
  const type = one('type');
  const page = Math.max(1, Number(one('page')) || 1);

  const query = new URLSearchParams({
    take: String(PER_PAGE),
    skip: String((page - 1) * PER_PAGE),
  });
  if (search) query.set('search', search);
  if (categoryId) query.set('categoryId', categoryId);
  if (type) query.set('type', type);

  const [bank, categories] = await Promise.all([
    apiGetAuthed(
      `/api/admin/questions?${query}`,
      z.object({ rows: z.array(BankEntrySchema), rowCount: z.number().int() }),
    ),
    apiGetAuthed('/api/admin/questions/categories', z.array(CategorySchema)),
  ]);
  const entries = bank.rows;

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

      {/*
        Search, category and type — all three were supported by the API and
        none of them was reachable. The bank holds 704 questions and this page
        was showing the newest 50 with no pager and nothing saying there were
        more, so 93% of what he has written could not be opened from here.
      */}
      <form action="/admin/questions" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--fs-text-xs)] text-fg-muted">
            {copy.quizAdmin.bankSearchLabel}
          </span>
          <input
            name="q"
            type="search"
            defaultValue={search}
            placeholder={copy.quizAdmin.bankSearchPlaceholder}
            className="h-9 min-w-0 rounded-lg border border-line bg-surface-2 px-3 text-[length:var(--fs-text-sm)] text-fg placeholder:text-fg-faint sm:w-[22rem]"
          />
        </label>
        <button
          type="submit"
          className="h-9 shrink-0 rounded-lg bg-accent px-4 text-[length:var(--fs-text-sm)] font-medium text-[#1A1206]"
        >
          {copy.quizAdmin.bankSearchSubmit}
        </button>
        {/* The two dropdowns ride along so submitting a search does not
            silently clear them — a GET form replaces the whole query string. */}
        {categoryId ? <input type="hidden" name="category" value={categoryId} /> : null}
        {type ? <input type="hidden" name="type" value={type} /> : null}
      </form>

      <div className="mb-6 flex flex-wrap items-end gap-2">
        <ListControl
          name="category"
          label={copy.quizAdmin.bankCategoryLabel}
          value={categoryId}
          options={[
            { value: '', label: copy.quizAdmin.bankAllCategories },
            ...categories.map((category) => ({ value: category.id, label: category.name })),
          ]}
        />
        <ListControl
          name="type"
          label={copy.quizAdmin.bankTypeLabel}
          value={type}
          options={[
            { value: '', label: copy.quizAdmin.bankAllTypes },
            ...QUESTION_TYPES.map((value) => ({ value, label: copy.quizAdmin.types[value] })),
          ]}
        />
        <span className="ms-auto self-end text-[length:var(--fs-text-xs)] text-fg-muted">
          {formatCopy(copy.quizAdmin.bankCount, { n: bank.rowCount })}
        </span>
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

      <ListPager
        page={page}
        perPage={PER_PAGE}
        rowCount={bank.rowCount}
        labels={{
          previous: copy.admin.books.pagerPrevious,
          next: copy.admin.books.pagerNext,
          of: copy.admin.books.pagerOf,
        }}
      />
    </>
  );
}
