'use client';

import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import type { AdminBookRow } from '@ayman/contracts/admin/books';
import type { BookTerm } from '@ayman/contracts/books';
import { streamChoiceOf, streamFlagsOf, type StreamChoice } from '@ayman/contracts/content';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { Checkbox } from '@ayman/ui/components/checkbox';
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
import { StreamChoiceField } from '@/components/admin/stream-choice';
import { createBookAction, patchBookAction } from '@/app/(admin)/admin/books/catalog/actions';
import { bookFormPayload, courseOptionLabel, type BookFormValues } from './book-payload';

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

/**
 * A course this book may be linked to.
 *
 * `year` and the stream pair ride along because the label needs them — see
 * `courseOptionLabel` for why a picker without them is a picker whose wrong
 * answer cannot be corrected.
 */
export interface CourseOption {
  id: string;
  title: string;
  year: number;
  forGeneral: boolean;
  forLanguages: boolean;
}

/**
 * One book, created or edited — from the catalogue OR from inside a course.
 *
 * ## Why this is one dialog and not two forms
 *
 * «توحدلي المكان اللي أضيف فيه الكتاب». Until this moved out of
 * `app/(admin)/admin/books/catalog/`, adding a book from a course meant filling
 * in `courses.book_title` and `courses.book_price_cents` — a SECOND, unsynced
 * representation of the same object, with its own price. That is why the
 * catalogue could say 180 while the course page said 150 and the order charged
 * whichever one the visitor happened to read. There is now one row, `books`,
 * and one form that writes it; `lockedCourse` is the whole difference between
 * the two places it is mounted.
 *
 * The field set is likewise identical for create and edit — a catalogue row has
 * no create-only or edit-only property — so `book === null` decides exactly two
 * things: the dialog title, and which action runs.
 *
 * ## Prices are typed in POUNDS and stored in piastres
 *
 * The conversion happens once, in `bookFormPayload`, which is also where the
 * two rules worth testing live (the stream expansion, and `showOnCourse`
 * without a course).
 */
export function BookFormDialog({
  book,
  subjects,
  courses,
  trigger,
  lockedCourse,
  onSaved,
}: {
  /** `null` creates. */
  book: AdminBookRow | null;
  subjects: SubjectOption[];
  /** Ignored when `lockedCourse` is set — there is nothing to pick. */
  courses: CourseOption[];
  /** Rendered as the dialog trigger. The list supplies a row button; the page
   *  header supplies «كتاب جديد». */
  trigger?: React.ReactNode;
  /**
   * Mounted from inside a course: the link is a FACT about where the admin is
   * standing, not a choice, so the picker renders it and refuses to change it.
   * Sending them to `/admin/books/catalog` to pick the course they are already
   * editing is the round trip this prop exists to delete.
   */
  lockedCourse?: { id: string; label: string };
  /** The course panel re-reads its own book after a save — it loads through a
   *  Server Action rather than the page, so `revalidatePath` cannot reach it. */
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [values, setValues] = useState<BookFormValues>(() => ({
    slug: book?.slug ?? '',
    titleAr: book?.titleAr ?? '',
    subtitleAr: book?.subtitleAr ?? '',
    subjectId: book?.subjectId ?? '',
    year: book?.year != null ? String(book.year) : '',
    term: book?.term ?? 'full',
    courseId: lockedCourse?.id ?? book?.courseId ?? '',
    stream: streamChoiceOf(book ?? { forGeneral: true, forLanguages: true }),
    showOnLanding: book?.showOnLanding ?? true,
    showOnCourse: book?.showOnCourse ?? true,
    price: book ? String(book.priceCents / 100) : '',
    comparePrice: book?.comparePriceCents != null ? String(book.comparePriceCents / 100) : '',
    unitCost: book?.unitCostCents != null ? String(book.unitCostCents / 100) : '',
    coverKey: book?.coverKey ?? null,
    descriptionAr: book?.descriptionAr ?? '',
    pageCount: book?.pageCount != null ? String(book.pageCount) : '',
    stock: book?.stock != null ? String(book.stock) : '',
    sortOrder: String(book?.sortOrder ?? 0),
    isActive: book?.isActive ?? true,
  }));

  function set(patch: Partial<BookFormValues>) {
    setValues((current) => ({ ...current, ...patch }));
  }

  /* The course link is what makes «في صفحة الكورس» mean anything. Disabled and
     explained, never hidden: a checkbox that vanishes reads as a bug where one
     that greys out reads as a dependency — the same call the course form's
     `emphasisNote` makes. */
  const hasCourse = values.courseId !== '';
  const idBase = `book-${book?.id ?? 'new'}`;

  function submit() {
    const payload = bookFormPayload(values);
    if (payload === null) {
      setError(c.catalogSaveFailed);
      return;
    }
    setError(null);

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
        onSaved?.();
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
            <Label htmlFor={`${idBase}-title`}>{c.fieldTitle}</Label>
            <Input
              id={`${idBase}-title`}
              value={values.titleAr}
              onChange={(e) => set({ titleAr: e.target.value })}
            />
          </div>

          <div>
            <Label htmlFor={`${idBase}-slug`}>{c.fieldSlug}</Label>
            <Input
              id={`${idBase}-slug`}
              value={values.slug}
              onChange={(e) => set({ slug: e.target.value })}
              aria-describedby={`${idBase}-slug-hint`}
            />
            <p
              id={`${idBase}-slug-hint`}
              className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted"
            >
              {c.fieldSlugHint}
            </p>
          </div>

          <div>
            <Label htmlFor={`${idBase}-subtitle`}>{c.fieldSubtitle}</Label>
            <Input
              id={`${idBase}-subtitle`}
              value={values.subtitleAr}
              onChange={(e) => set({ subtitleAr: e.target.value })}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor={`${idBase}-subject`}>{c.fieldSubject}</Label>
              <Select
                id={`${idBase}-subject`}
                value={values.subjectId}
                onChange={(e) => set({ subjectId: e.target.value })}
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
              <Label htmlFor={`${idBase}-year`}>{c.fieldYear}</Label>
              <Select
                id={`${idBase}-year`}
                value={values.year}
                onChange={(e) => set({ year: e.target.value })}
              >
                <option value="">{c.fieldYearNone}</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </Select>
            </div>

            <div>
              <Label htmlFor={`${idBase}-term`}>{c.fieldTerm}</Label>
              <Select
                id={`${idBase}-term`}
                value={values.term}
                onChange={(e) => set({ term: e.target.value as BookTerm })}
              >
                {(['first', 'second', 'full'] as const).map((value) => (
                  <option key={value} value={value}>
                    {TERM_LABEL[value]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {/*
            «المدارس» — the same three radios the course form and every lesson
            row use, never two hand-rolled checkboxes: the pair the column
            stores has a CHECK that forbids "neither", and three exclusive
            options make that state unreachable rather than merely invalid.

            `defaults` is fed from the CURRENT choice rather than from `book`,
            because Radix unmounts a closed dialog: re-opening it would
            otherwise remount the radios on the saved value while the state
            beside them still held the edited one.
          */}
          <div>
            <StreamChoiceField
              idPrefix={`${idBase}-stream`}
              name={`${idBase}-stream`}
              defaults={streamFlagsOf(values.stream)}
              onChange={(stream: StreamChoice) => set({ stream })}
            />
            <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">{c.fieldStreamHint}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${idBase}-price`}>{c.fieldPrice}</Label>
              <Input
                id={`${idBase}-price`}
                type="number"
                inputMode="decimal"
                min={0}
                dir="ltr"
                value={values.price}
                onChange={(e) => set({ price: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor={`${idBase}-compare-price`}>{c.fieldComparePrice}</Label>
              <Input
                id={`${idBase}-compare-price`}
                type="number"
                inputMode="decimal"
                min={0}
                dir="ltr"
                value={values.comparePrice}
                onChange={(e) => set({ comparePrice: e.target.value })}
                aria-describedby={`${idBase}-compare-hint`}
              />
              <p
                id={`${idBase}-compare-hint`}
                className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted"
              >
                {c.fieldComparePriceHint}
              </p>
            </div>
          </div>

          {/* Cost, under the two prices and never beside them: everything above
              is what the CUSTOMER sees, and this is the only number on the form
              that is nobody's business but Ayman's. It is what «مكسب الكتب» on
              `/admin/finance` is computed from, and leaving it empty is the
              honest «مش معروف» — the overview counts those lines and says so
              rather than reporting the whole cover price as profit. */}
          <div>
            <Label htmlFor={`${idBase}-unit-cost`}>{c.fieldUnitCost}</Label>
            <Input
              id={`${idBase}-unit-cost`}
              type="number"
              inputMode="decimal"
              min={0}
              dir="ltr"
              value={values.unitCost}
              onChange={(e) => set({ unitCost: e.target.value })}
              aria-describedby={`${idBase}-unit-cost-hint`}
            />
            <p
              id={`${idBase}-unit-cost-hint`}
              className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted"
            >
              {c.fieldUnitCostHint}
            </p>
          </div>

          <div>
            <Label htmlFor={`${idBase}-course`}>{c.fieldCourse}</Label>
            {lockedCourse ? (
              /* Not a `<Select disabled>` with one option: a disabled control
                 that looks like a picker invites the click it will not answer.
                 This states the link and lets the course page own it. */
              <p className="rounded-[var(--r-sm)] border border-line bg-surface-3 px-3 py-2 text-[length:var(--fs-text-sm)] text-fg">
                {lockedCourse.label}
              </p>
            ) : (
              <Select
                id={`${idBase}-course`}
                value={values.courseId}
                onChange={(e) => set({ courseId: e.target.value })}
              >
                <option value="">{c.fieldCourseNone}</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {courseOptionLabel(course)}
                  </option>
                ))}
              </Select>
            )}
            <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">
              {c.fieldCourseHint}
            </p>
          </div>

          {/*
            «أضيفه في الـlanding page ولا هنا ولا الاتنين» — placement, and it
            is NOT permission: «معروض في قسم الكتب» below is the switch that
            takes the book off sale. Both boxes unticked is a real answer, which
            is why the hint has to say what it is not.
          */}
          <fieldset className="rounded-[var(--r-sm)] border border-line bg-surface-3 p-3">
            <legend className="px-1 text-[length:var(--fs-text-sm)] font-medium text-fg">
              {c.fieldPlacementLabel}
            </legend>
            <div className="flex flex-col gap-2.5">
              <label className="flex items-center gap-2 text-[length:var(--fs-text-sm)] text-fg">
                <Checkbox
                  checked={values.showOnLanding}
                  onCheckedChange={(checked) => set({ showOnLanding: checked === true })}
                />
                <span>{c.fieldShowOnLanding}</span>
              </label>
              <label
                className={`flex items-center gap-2 text-[length:var(--fs-text-sm)] ${
                  hasCourse ? 'text-fg' : 'text-fg-faint'
                }`}
              >
                <Checkbox
                  checked={hasCourse && values.showOnCourse}
                  disabled={!hasCourse}
                  onCheckedChange={(checked) => set({ showOnCourse: checked === true })}
                />
                <span>{c.fieldShowOnCourse}</span>
              </label>
            </div>
            <p className="mt-2 text-[length:var(--fs-text-xs)] text-fg-muted">
              {hasCourse ? c.fieldPlacementHint : c.fieldShowOnCourseNeedsCourse}
            </p>
          </fieldset>

          {/* The SAME control a course cover uses, so a book jacket goes through
              the identical upload + sharp re-encode path rather than a second,
              unvalidated one — and stores a storage KEY, never a URL. */}
          <MediaKeyField
            name="coverKey"
            id={`${idBase}-cover`}
            label={c.fieldCover}
            defaultValue={book?.coverKey ?? null}
            onChange={(coverKey) => set({ coverKey })}
          />

          <div>
            <Label htmlFor={`${idBase}-description`}>{c.fieldDescription}</Label>
            <Textarea
              id={`${idBase}-description`}
              rows={3}
              value={values.descriptionAr}
              onChange={(e) => set({ descriptionAr: e.target.value })}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor={`${idBase}-pages`}>{c.fieldPageCount}</Label>
              <Input
                id={`${idBase}-pages`}
                type="number"
                inputMode="numeric"
                min={1}
                dir="ltr"
                value={values.pageCount}
                onChange={(e) => set({ pageCount: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor={`${idBase}-stock`}>{c.fieldStock}</Label>
              <Input
                id={`${idBase}-stock`}
                type="number"
                inputMode="numeric"
                min={0}
                dir="ltr"
                value={values.stock}
                onChange={(e) => set({ stock: e.target.value })}
                aria-describedby={`${idBase}-stock-hint`}
              />
            </div>

            <div>
              <Label htmlFor={`${idBase}-sort`}>{c.fieldSortOrder}</Label>
              <Input
                id={`${idBase}-sort`}
                type="number"
                inputMode="numeric"
                min={0}
                dir="ltr"
                value={values.sortOrder}
                onChange={(e) => set({ sortOrder: e.target.value })}
              />
            </div>
          </div>
          <p
            id={`${idBase}-stock-hint`}
            className="text-[length:var(--fs-text-xs)] text-fg-muted"
          >
            {c.fieldStockHint}
          </p>

          <label className="flex items-center justify-between gap-3">
            <span className="text-[length:var(--fs-text-sm)] text-fg">{c.fieldActive}</span>
            <Switch
              checked={values.isActive}
              onCheckedChange={(isActive) => set({ isActive })}
            />
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
