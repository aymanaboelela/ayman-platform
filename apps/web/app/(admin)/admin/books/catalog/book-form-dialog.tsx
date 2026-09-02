'use client';

import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import type { AdminBookRow } from '@ayman/contracts/admin/books';
import type { BookTerm } from '@ayman/contracts/books';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ayman/ui/components/dialog';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';
import { Switch } from '@ayman/ui/components/switch';
import { Textarea } from '@ayman/ui/components/textarea';
import { MediaKeyField } from '@/components/admin/media-key-field';
import { createBookAction, patchBookAction } from './actions';

const c = copy.admin.books;

const TERM_LABEL: Record<BookTerm, string> = {
  first: c.termFirst,
  second: c.termSecond,
  full: c.termFull,
};

export interface SubjectOption {
  id: string;
  nameAr: string;
}

export interface CourseOption {
  id: string;
  title: string;
}

/**
 * One book, created or edited.
 *
 * ## Why one dialog for both, and not a create form plus an edit form
 *
 * The field set is identical — a catalogue row has no create-only or edit-only
 * property — so two components would be one component and a copy of it that
 * drifts the first time a column is added. `book` being `null` is the only
 * difference, and it decides exactly two things: the title, and which action
 * runs.
 *
 * ## Prices are typed in POUNDS and stored in piastres
 *
 * Nobody types 25000 for a 250-pound book. The conversion happens at this
 * boundary, in one place, and `Math.round` is what keeps a typed `250.5` from
 * arriving as a float — every money column in this database is an integer
 * precisely so no amount is ever the result of a binary fraction.
 */
export function BookFormDialog({
  book,
  subjects,
  courses,
  trigger,
}: {
  /** `null` creates. */
  book: AdminBookRow | null;
  subjects: SubjectOption[];
  courses: CourseOption[];
  /** Rendered as the dialog trigger. The list supplies a row button; the page
   *  header supplies «كتاب جديد». */
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [slug, setSlug] = useState(book?.slug ?? '');
  const [titleAr, setTitleAr] = useState(book?.titleAr ?? '');
  const [subtitleAr, setSubtitleAr] = useState(book?.subtitleAr ?? '');
  const [subjectId, setSubjectId] = useState(book?.subjectId ?? '');
  const [year, setYear] = useState(book?.year !== null && book ? String(book.year) : '');
  const [term, setTerm] = useState<BookTerm>(book?.term ?? 'full');
  const [courseId, setCourseId] = useState(book?.courseId ?? '');
  const [price, setPrice] = useState(book ? String(book.priceCents / 100) : '');
  const [comparePrice, setComparePrice] = useState(
    book?.comparePriceCents != null ? String(book.comparePriceCents / 100) : '',
  );
  const [coverKey, setCoverKey] = useState<string | null>(book?.coverKey ?? null);
  const [descriptionAr, setDescriptionAr] = useState(book?.descriptionAr ?? '');
  const [pageCount, setPageCount] = useState(book?.pageCount != null ? String(book.pageCount) : '');
  const [stock, setStock] = useState(book?.stock != null ? String(book.stock) : '');
  const [sortOrder, setSortOrder] = useState(String(book?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(book?.isActive ?? true);

  /** Pounds → piastres. `''` is "not set", which is not the same as zero. */
  const cents = (value: string): number | null => {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
  };

  const int = (value: string): number | null => {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isInteger(parsed) ? parsed : null;
  };

  function submit() {
    const priceCents = cents(price);
    if (priceCents === null) {
      setError(c.catalogSaveFailed);
      return;
    }
    setError(null);

    const payload = {
      slug: slug.trim(),
      titleAr: titleAr.trim(),
      subtitleAr: subtitleAr.trim() === '' ? null : subtitleAr.trim(),
      subjectId: subjectId === '' ? null : subjectId,
      year: int(year),
      term,
      courseId: courseId === '' ? null : courseId,
      priceCents,
      comparePriceCents: cents(comparePrice),
      coverKey,
      descriptionAr: descriptionAr.trim() === '' ? null : descriptionAr.trim(),
      pageCount: int(pageCount),
      isActive,
      stock: int(stock),
      sortOrder: int(sortOrder) ?? 0,
    };

    startTransition(async () => {
      /*
       * The edit path sends the WHOLE payload, not a diff. Every field is on
       * screen and every one of them was just read out of the form, so "what
       * the admin sees" and "what is sent" are the same set — and
       * `AdminBookPatchSchema` is built with `partialWithoutDefaults`, so a
       * field that is genuinely absent stays absent rather than being reset to
       * a create-time default.
       */
      const result = book
        ? await patchBookAction(book.id, payload)
        : await createBookAction(payload);

      if (result.ok) {
        setOpen(false);
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" size="sm">
            <Plus size={16} aria-hidden="true" />
            {c.catalogNew}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent closeLabel={copy.admin.common.cancel}>
        <DialogHeader>
          <DialogTitle>{book ? c.catalogEditTitle : c.catalogNewTitle}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div>
            <Label htmlFor="book-title">{c.fieldTitle}</Label>
            <Input id="book-title" value={titleAr} onChange={(e) => setTitleAr(e.target.value)} />
          </div>

          <div>
            <Label htmlFor="book-slug">{c.fieldSlug}</Label>
            <Input
              id="book-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              aria-describedby="book-slug-hint"
            />
            <p id="book-slug-hint" className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">
              {c.fieldSlugHint}
            </p>
          </div>

          <div>
            <Label htmlFor="book-subtitle">{c.fieldSubtitle}</Label>
            <Input
              id="book-subtitle"
              value={subtitleAr}
              onChange={(e) => setSubtitleAr(e.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="book-subject">{c.fieldSubject}</Label>
              <Select
                id="book-subject"
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
              >
                <option value="">{c.fieldSubjectNone}</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.nameAr}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="book-year">{c.fieldYear}</Label>
              <Select id="book-year" value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="">{c.fieldYearNone}</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </Select>
            </div>

            <div>
              <Label htmlFor="book-term">{c.fieldTerm}</Label>
              <Select
                id="book-term"
                value={term}
                onChange={(e) => setTerm(e.target.value as BookTerm)}
              >
                {(['first', 'second', 'full'] as const).map((value) => (
                  <option key={value} value={value}>
                    {TERM_LABEL[value]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="book-price">{c.fieldPrice}</Label>
              <Input
                id="book-price"
                type="number"
                inputMode="decimal"
                min={0}
                dir="ltr"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="book-compare-price">{c.fieldComparePrice}</Label>
              <Input
                id="book-compare-price"
                type="number"
                inputMode="decimal"
                min={0}
                dir="ltr"
                value={comparePrice}
                onChange={(e) => setComparePrice(e.target.value)}
                aria-describedby="book-compare-hint"
              />
              <p
                id="book-compare-hint"
                className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted"
              >
                {c.fieldComparePriceHint}
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="book-course">{c.fieldCourse}</Label>
            <Select id="book-course" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">{c.fieldCourseNone}</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">
              {c.fieldCourseHint}
            </p>
          </div>

          {/* The SAME control a course cover uses, so a book jacket goes through
              the identical upload + sharp re-encode path rather than a second,
              unvalidated one — and stores a storage KEY, never a URL. */}
          <MediaKeyField
            name="coverKey"
            id="book-cover"
            label={c.fieldCover}
            defaultValue={book?.coverKey ?? null}
            onChange={setCoverKey}
          />

          <div>
            <Label htmlFor="book-description">{c.fieldDescription}</Label>
            <Textarea
              id="book-description"
              rows={3}
              value={descriptionAr}
              onChange={(e) => setDescriptionAr(e.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="book-pages">{c.fieldPageCount}</Label>
              <Input
                id="book-pages"
                type="number"
                inputMode="numeric"
                min={1}
                dir="ltr"
                value={pageCount}
                onChange={(e) => setPageCount(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="book-stock">{c.fieldStock}</Label>
              <Input
                id="book-stock"
                type="number"
                inputMode="numeric"
                min={0}
                dir="ltr"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                aria-describedby="book-stock-hint"
              />
            </div>

            <div>
              <Label htmlFor="book-sort">{c.fieldSortOrder}</Label>
              <Input
                id="book-sort"
                type="number"
                inputMode="numeric"
                min={0}
                dir="ltr"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </div>
          </div>
          <p id="book-stock-hint" className="text-[length:var(--fs-text-xs)] text-fg-muted">
            {c.fieldStockHint}
          </p>

          <label className="flex items-center justify-between gap-3">
            <span className="text-[length:var(--fs-text-sm)] text-fg">{c.fieldActive}</span>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </label>

          {error ? (
            <p role="alert" className="text-[length:var(--fs-text-sm)] text-err">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? c.catalogSaving : c.catalogSave}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
