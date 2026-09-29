import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { z } from 'zod';
import { Archive, FileQuestion, FolderTree, Plus, Search } from 'lucide-react';
import { QUESTION_TYPES } from '@ayman/contracts/quiz/question';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { apiGetAuthed } from '@/lib/api-server';
import { sanitizeRichText } from '@/lib/sanitize-html';
import { AdminEmpty } from '@/components/admin/admin-empty';
import { ListControl, ListPager } from '@/components/admin/list-controls';
import { StatTile } from '@/components/dashboard/stat-tile';
import { BulkImportDialog } from '@/components/admin/quiz/bulk-import-dialog';
import { NewCategoryForm } from '@/components/admin/quiz/new-category-form';
import { QuestionBankList } from '@/components/admin/quiz/question-bank-list';
import {
  BankCategorySchema,
  BankListSchema,
  categoryHue,
  type BankRow,
} from '@/components/admin/quiz/bank-rows';
import '@/components/admin/quiz/question-bank.css';

const c = copy.quizAdmin.bank;

export const metadata = { title: copy.quizAdmin.bankTitle };

/** Fifty was the API's default and the page never sent anything else, so the
 *  bank showed its newest 50 and stopped. See `ListPager`. */
const PER_PAGE = 50;

/**
 * The second pass of the shared allowlist, on the server, before any of it
 * reaches `SafeHtml` — the same arrangement the student's review page uses.
 * Stems AND option bodies: the preview renders both.
 */
function sanitizeRow(row: BankRow): BankRow {
  return {
    ...row,
    versions: row.versions.map((version) => ({
      ...version,
      stemHtml: sanitizeRichText(version.stemHtml),
      options: version.options.map((option) => ({ ...option, bodyHtml: sanitizeRichText(option.bodyHtml) })),
    })),
  };
}

/**
 * «ركن الأسئلة» — `/admin/questions`.
 *
 * «عاوز مكان أحط فيه الأسئلة واضبطها». Built the way the rest of the admin
 * reads: a band that says what the screen is for and holds the two ways in
 * (one question, or a whole paste), the bank's size in three tiles, the
 * categories with a count each, and a list where every question shows its
 * options — the right one marked — and ends in its own buttons.
 *
 * Not cached — a question just written, pasted or deleted must be on the next
 * render (every write here also calls `router.refresh()`).
 */
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
  const archived = one('view') === 'archived';
  const page = Math.max(1, Number(one('page')) || 1);

  const query = new URLSearchParams({
    take: String(PER_PAGE),
    skip: String((page - 1) * PER_PAGE),
  });
  if (search) query.set('search', search);
  if (categoryId) query.set('categoryId', categoryId);
  if (type) query.set('type', type);
  if (archived) query.set('archived', '1');

  const [bank, categories, archivedBank] = await Promise.all([
    apiGetAuthed(`/api/admin/questions?${query}`, BankListSchema),
    apiGetAuthed('/api/admin/questions/categories', z.array(BankCategorySchema)),
    // Only its count — the tab and the tile say how many are waiting there.
    apiGetAuthed('/api/admin/questions?archived=1&take=1', BankListSchema),
  ]);
  const rows = bank.rows.map(sanitizeRow);

  const totalInBank = categories.reduce((sum, category) => sum + category.questionCount, 0);
  const filled = categories
    .filter((category) => category.questionCount > 0)
    .sort((a, b) => b.questionCount - a.questionCount || a.name.localeCompare(b.name, 'ar'));
  const empty = categories.filter((category) => category.questionCount === 0);
  const current = categories.find((category) => category.id === categoryId);

  /** Keeps the other filters when one changes — a link replaces the whole query. */
  const href = (next: Record<string, string | null>): string => {
    const merged: Record<string, string | null> = {
      q: search || null,
      category: categoryId || null,
      type: type || null,
      view: archived ? 'archived' : null,
      ...next,
    };
    const out = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) if (value) out.set(key, value);
    return out.size === 0 ? '/admin/questions' : `/admin/questions?${out}`;
  };

  // «إضافة سؤال» opens on the category being looked at (`?category=` puts it
  // first in the form's select), and so does the paste.
  const newHref = categoryId ? `/admin/questions/new?category=${encodeURIComponent(categoryId)}` : '/admin/questions/new';
  const pasteCategories = current ? [current, ...categories.filter((category) => category.id !== current.id)] : categories;
  const filtered = Boolean(search || categoryId || type);

  return (
    <>
      <section className="stage">
        <div className="stage__body">
          <p className="stage__eyebrow">{c.eyebrow}</p>
          <h1 className="stage__title">{copy.quizAdmin.bankTitle}</h1>
          <p className="stage__sub">{c.lead}</p>
          <div className="qbank-hero__actions">
            <Link href={newHref} className="qbank-hero__primary">
              <Plus className="size-5" aria-hidden="true" />
              {c.add}
            </Link>
            <BulkImportDialog
              categories={pasteCategories}
              defaultCategoryId={current?.id}
              triggerClassName="qbank-hero__secondary"
            />
          </div>
        </div>
      </section>

      <div className="qbank-stats">
        <StatTile icon={<FileQuestion className="size-5" />} value={totalInBank} label={c.statQuestions} hue={255} />
        <StatTile icon={<FolderTree className="size-5" />} value={filled.length} label={c.statCategories} hue={195} />
        <StatTile
          icon={<Archive className="size-5" />}
          value={archivedBank.rowCount}
          label={c.statArchived}
          hue={320}
          href="/admin/questions?view=archived"
        />
      </div>

      <div className="qbank-layout">
        <div className="qbank-main">
          <nav className="qbank-tabs" aria-label={copy.quizAdmin.bankTitle}>
            <Link href={href({ view: null })} className="qbank-tab" aria-current={archived ? undefined : 'page'}>
              {c.tabBank}
              <span className="qbank-cat__count">{totalInBank}</span>
            </Link>
            <Link href={href({ view: 'archived' })} className="qbank-tab" aria-current={archived ? 'page' : undefined}>
              {c.tabArchived}
              <span className="qbank-cat__count">{archivedBank.rowCount}</span>
            </Link>
          </nav>

          {/*
            Search, category and type — all three were supported by the API and
            none of them was reachable once. The category select carries each
            category's count too, for the phone, where the panel beside the list
            is folded under it.
          */}
          <div className="qbank-filters">
            <form action="/admin/questions" className="qbank-filters__form">
              <label className="qbank-filters__search">
                <span className="text-[length:var(--fs-text-xs)] text-fg-muted">{copy.quizAdmin.bankSearchLabel}</span>
                <input
                  name="q"
                  type="search"
                  defaultValue={search}
                  placeholder={copy.quizAdmin.bankSearchPlaceholder}
                  className="h-10 min-w-0 rounded-lg border border-line bg-surface-2 px-3 text-[length:var(--fs-text-sm)] text-fg placeholder:text-fg-faint"
                />
              </label>
              <button type="submit" className="chip chip--solid h-10">
                <Search className="size-4" aria-hidden="true" />
                {copy.quizAdmin.bankSearchSubmit}
              </button>
              {/* The other filters ride along so a search does not silently clear them. */}
              {categoryId ? <input type="hidden" name="category" value={categoryId} /> : null}
              {type ? <input type="hidden" name="type" value={type} /> : null}
              {archived ? <input type="hidden" name="view" value="archived" /> : null}
            </form>
            <ListControl
              name="category"
              label={copy.quizAdmin.bankCategoryLabel}
              value={categoryId}
              options={[
                { value: '', label: copy.quizAdmin.bankAllCategories },
                ...categories.map((category) => ({
                  value: category.id,
                  label: category.name,
                  count: category.questionCount,
                })),
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
          </div>

          <div className="qbank-filters__meta">
            <span>{formatCopy(copy.quizAdmin.bankCount, { n: bank.rowCount })}</span>
            {filtered ? (
              <Link href={href({ q: null, category: null, type: null })} className="chip chip--quiet">
                {c.clearFilters}
              </Link>
            ) : null}
          </div>

          {rows.length === 0 ? (
            <BankEmpty
              archived={archived}
              filtered={filtered}
              categoryOnly={Boolean(current) && !search && !type}
              newHref={newHref}
              paste={
                <BulkImportDialog
                  categories={pasteCategories}
                  defaultCategoryId={current?.id}
                  triggerClassName="chip chip--quiet"
                />
              }
            />
          ) : (
            <QuestionBankList rows={rows} archived={archived} />
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
        </div>

        {/*
          The categories, with how many questions each holds — «الحلقات · ٤٥»
          is how the teacher sees where the bank is thin before a paper needs
          it. Every row is a filter link. Empty categories are folded away: a
          bank grows a category per game lesson, and a list of forty zeros
          buries the eight that matter.
        */}
        <aside className="qbank-cats">
          <p className="qbank-cats__summary">
            {c.categoriesTitle}
            <span className="qbank-cat__count">{filled.length}</span>
          </p>
          <nav className="qbank-cats__list" aria-label={c.categoriesTitle}>
            <Link href={href({ category: null })} className="qbank-cat" aria-current={categoryId ? undefined : 'page'}>
              <span className="qbank-cat__dot qbank-cat__dot--all" aria-hidden="true" />
              <span className="qbank-cat__name">{c.allQuestions}</span>
              <span className="qbank-cat__count">{totalInBank}</span>
            </Link>
            {filled.map((category) => (
              <CategoryLink key={category.id} id={category.id} name={category.name} count={category.questionCount} current={category.id === categoryId} href={href({ category: category.id })} />
            ))}
            {empty.length > 0 ? (
              <details open={Boolean(current && current.questionCount === 0)}>
                <summary className="qbank-cats__empty cursor-pointer">
                  {formatCopy(c.emptyCategories, { n: empty.length })}
                </summary>
                {empty.map((category) => (
                  <CategoryLink key={category.id} id={category.id} name={category.name} count={0} current={category.id === categoryId} href={href({ category: category.id })} />
                ))}
              </details>
            ) : null}
          </nav>
          <div className="qbank-cats__foot">
            <NewCategoryForm categories={categories} />
          </div>
        </aside>
      </div>
    </>
  );
}

function CategoryLink({
  id,
  name,
  count,
  current,
  href,
}: {
  id: string;
  name: string;
  count: number;
  current: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="qbank-cat"
      aria-current={current ? 'page' : undefined}
      style={{ '--cat-h': categoryHue(id) } as CSSProperties}
    >
      <span className="qbank-cat__dot" aria-hidden="true" />
      <span className="qbank-cat__name">{name}</span>
      <span className="qbank-cat__count">{count}</span>
    </Link>
  );
}

/**
 * Four different empties, because «مفيش أسئلة» means four different things:
 * a bank with nothing in it yet, a search that matched nothing, a category
 * nobody has filled, and an archive with nothing in it. Each says which, and
 * the two that can be fixed from here say what to press.
 */
function BankEmpty({
  archived,
  filtered,
  categoryOnly,
  newHref,
  paste,
}: {
  archived: boolean;
  filtered: boolean;
  categoryOnly: boolean;
  newHref: string;
  paste: ReactNode;
}) {
  if (archived) return <AdminEmpty spot="topics" title={c.emptyArchivedTitle} hint={c.emptyArchivedHint} />;

  const actions = (
    <div className="flex flex-wrap justify-center gap-2">
      <Link href={newHref} className="chip chip--solid">
        <Plus className="size-4" aria-hidden="true" />
        {c.add}
      </Link>
      {paste}
    </div>
  );

  if (categoryOnly) {
    return <AdminEmpty spot="exams" title={c.emptyCategoryTitle} hint={c.emptyCategoryHint} action={actions} />;
  }
  if (filtered) return <AdminEmpty spot="topics" title={c.emptyFilteredTitle} hint={c.emptyFilteredHint} />;
  return <AdminEmpty spot="exams" title={c.emptyTitle} hint={c.emptyHint} action={actions} />;
}
