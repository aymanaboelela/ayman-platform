'use client';

import { useState, useTransition } from 'react';
import { BookOpen, Check, Eye, GraduationCap, ImageIcon, Plus, Tag } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AdminBookRow } from '@ayman/contracts/admin/books';
import type { BookTerm } from '@ayman/contracts/books';
import { streamChoiceOf, streamFlagsOf, type StreamChoice } from '@ayman/contracts/content';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { Checkbox } from '@ayman/ui/components/checkbox';
import {
  Dialog,
  DialogClose,
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
import { cn } from '@ayman/ui/lib/cn';
import { MediaKeyField } from '@/components/admin/media-key-field';
import { StreamChoiceField } from '@/components/admin/stream-choice';
import { createBookAction, patchBookAction } from '@/app/(admin)/admin/books/catalog/actions';
import {
  bookFormPayload,
  courseChoices,
  slugFromTitle,
  type BookFormValues,
  type CourseOption,
} from './book-payload';
import { BOOK_TERMS, BOOK_TERM_LABEL, BOOK_TERM_SELECTED, BOOK_TERM_TONE } from './book-term';

const c = copy.admin.books;

export type { CourseOption };

export interface SubjectOption {
  id: string;
  nameAr: string;
}

/** The draft a dialog opens on — the saved row, or a blank book. */
function initialValues(
  book: AdminBookRow | null,
  lockedCourse: { id: string } | undefined,
): BookFormValues {
  return {
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
  };
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
 * no create-only or edit-only property — so `book === null` decides exactly
 * three things: the dialog title, which action runs, and whether the slug
 * follows the title (see `slugFromTitle`).
 *
 * ## Five sections, in the order the question is asked
 *
 * «أختار الكتاب، تبع أنهي كورس، وأحط الصورة وكل الداتا بتاعته». The form had
 * every one of those fields and presented them as twenty inputs in one column
 * of a 420px dialog — the term, which decides the heading a student reads the
 * book under, was the third `<select>` in a row of three. It is now five
 * labelled blocks (the book, where it belongs, its cover, what it costs, where
 * it shows) in a dialog wide enough for two columns on a laptop and one on a
 * phone, and the term is three coloured buttons rather than a dropdown.
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
  courseTakenBy = {},
  trigger,
  lockedCourse,
  onSaved,
}: {
  /** `null` creates. */
  book: AdminBookRow | null;
  subjects: SubjectOption[];
  /** Ignored when `lockedCourse` is set — there is nothing to pick. */
  courses: CourseOption[];
  /**
   * courseId → the title of the book that already holds it. Those courses are
   * shown DISABLED with that title beside them — `books.course_id` is UNIQUE,
   * and a picker that offered them anyway could only answer with a 409.
   */
  courseTakenBy?: Readonly<Record<string, string>>;
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
  const [values, setValues] = useState<BookFormValues>(() => initialValues(book, lockedCourse));
  /* On a NEW book the slug follows the title until somebody types into it —
     after that it is theirs. An existing book's slug never moves on its own:
     `/books#book-{slug}` links are already out on WhatsApp. */
  const [slugTouched, setSlugTouched] = useState(book !== null);

  function set(patch: Partial<BookFormValues>) {
    setValues((current) => ({ ...current, ...patch }));
  }

  /*
   * An EDIT re-reads the saved row every time it opens.
   *
   * The draft used to be seeded once, when the row first rendered, and kept
   * for the life of the page. So «اخفيه» on the row (a separate PATCH),
   * followed by «تعديل» and a save, sent the stale `isActive: true` back and
   * quietly put the book on sale again — the whole payload is sent, not a
   * diff. The row the page just re-rendered is the truth; the draft starts
   * from it.
   *
   * A NEW book keeps its draft across an accidental close instead: losing a
   * half-typed title and price to a stray tap on the overlay is worse than
   * finding it still there.
   */
  function onOpenChange(next: boolean) {
    if (next && book !== null) {
      setValues(initialValues(book, lockedCourse));
      setError(null);
    }
    setOpen(next);
  }

  /* The course link is what makes «في صفحة الكورس» mean anything. Disabled and
     explained, never hidden: a checkbox that vanishes reads as a bug where one
     that greys out reads as a dependency — the same call the course form's
     `emphasisNote` makes. */
  const hasCourse = values.courseId !== '';
  const idBase = `book-${book?.id ?? 'new'}`;
  const choices = courseChoices(courses, book?.courseId ?? null, courseTakenBy);

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
        if (book === null) {
          // The next «كتاب جديد» starts blank, not on the book just added.
          setValues(initialValues(null, lockedCourse));
          setSlugTouched(false);
        }
        onSaved?.();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" size="sm">
            <Plus size={16} aria-hidden="true" />
            {c.catalogNew}
          </Button>
        )}
      </DialogTrigger>

      {/* 46rem: two columns of inputs on a laptop, one on a phone — the
          primitive's 420px default is sized for a confirm, not for a product
          record with a cover. The primitive caps the HEIGHT and scrolls. */}
      <DialogContent closeLabel={copy.admin.common.cancel} className="max-w-[46rem] pb-0">
        <DialogHeader>
          <DialogTitle>{book ? c.catalogEditTitle : c.catalogNewTitle}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <FormSection icon={BookOpen} title={c.sectionBasics}>
            <div>
              <Label htmlFor={`${idBase}-title`}>{c.fieldTitle}</Label>
              <Input
                id={`${idBase}-title`}
                value={values.titleAr}
                onChange={(e) => {
                  const titleAr = e.target.value;
                  set(slugTouched ? { titleAr } : { titleAr, slug: slugFromTitle(titleAr) });
                }}
              />
            </div>

            <div>
              <Label htmlFor={`${idBase}-subtitle`}>{c.fieldSubtitle}</Label>
              <Input
                id={`${idBase}-subtitle`}
                value={values.subtitleAr}
                onChange={(e) => set({ subtitleAr: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor={`${idBase}-description`}>{c.fieldDescription}</Label>
              <Textarea
                id={`${idBase}-description`}
                rows={3}
                value={values.descriptionAr}
                onChange={(e) => set({ descriptionAr: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor={`${idBase}-slug`}>{c.fieldSlug}</Label>
              <Input
                id={`${idBase}-slug`}
                value={values.slug}
                dir="auto"
                onChange={(e) => {
                  setSlugTouched(true);
                  set({ slug: e.target.value });
                }}
                aria-describedby={`${idBase}-slug-hint`}
              />
              <p
                id={`${idBase}-slug-hint`}
                className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted"
              >
                {slugTouched ? c.fieldSlugHint : c.fieldSlugAutoHint}
              </p>
            </div>
          </FormSection>

          <FormSection icon={GraduationCap} title={c.sectionCourse}>
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
                  onChange={(e) => {
                    const courseId = e.target.value;
                    /* The year is a fact about the COURSE when there is one, so
                       an empty «الصف» is filled from it. Only an empty one: a
                       year somebody already chose is theirs. The stream is not
                       filled the same way — it is a property of the printed
                       book (see `Book.forGeneral`), not of the course. */
                    const course = courses.find((option) => option.id === courseId);
                    set(
                      course && values.year === ''
                        ? { courseId, year: String(course.year) }
                        : { courseId },
                    );
                  }}
                  aria-describedby={`${idBase}-course-hint`}
                >
                  <option value="">{c.fieldCourseNone}</option>
                  {choices.map((choice) => (
                    <option key={choice.id} value={choice.id} disabled={choice.disabled}>
                      {choice.label}
                    </option>
                  ))}
                </Select>
              )}
              <p
                id={`${idBase}-course-hint`}
                className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted"
              >
                {c.fieldCourseHint}
              </p>
            </div>

            <TermPicker
              name={`${idBase}-term`}
              value={values.term}
              onChange={(term) => set({ term })}
            />

            <div className="grid gap-3 sm:grid-cols-2">
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
                  <option value="1">{copy.years.year1}</option>
                  <option value="2">{copy.years.year2}</option>
                  <option value="3">{copy.years.year3}</option>
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
              <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">
                {c.fieldStreamHint}
              </p>
            </div>
          </FormSection>

          <FormSection icon={ImageIcon} title={c.sectionCover}>
            {/* The SAME control a course cover uses, so a book jacket goes
                through the identical upload + sharp re-encode path rather than
                a second, unvalidated one — and stores a storage KEY, never a
                URL. `shape="book"` is the one difference: it crops at the 3/4
                every book card is drawn at, where the course default is 16/9. */}
            <MediaKeyField
              name="coverKey"
              id={`${idBase}-cover`}
              label={c.fieldCover}
              hint={c.fieldCoverHint}
              shape="book"
              defaultValue={values.coverKey}
              onChange={(coverKey) => set({ coverKey })}
            />
          </FormSection>

          <FormSection icon={Tag} title={c.sectionPricing}>
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
                that is nobody's business but the owner's. It is what «مكسب الكتب»
                on `/admin/finance` is computed from, and leaving it empty is the
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

            <div className="grid gap-3 sm:grid-cols-3">
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
            <p id={`${idBase}-stock-hint`} className="text-[length:var(--fs-text-xs)] text-fg-muted">
              {c.fieldStockHint}
            </p>
          </FormSection>

          <FormSection icon={Eye} title={c.sectionVisibility}>
            <label className="flex items-center justify-between gap-3 rounded-[var(--r-sm)] border border-line bg-surface-2 px-3 py-2.5">
              <span className="text-[length:var(--fs-text-sm)] font-medium text-fg">
                {c.fieldActive}
              </span>
              <Switch
                checked={values.isActive}
                onCheckedChange={(isActive) => set({ isActive })}
              />
            </label>

            {/*
              «أضيفه في الـlanding page ولا هنا ولا الاتنين» — placement, and it
              is NOT permission: «معروض في قسم الكتب» above is the switch that
              takes the book off sale. Both boxes unticked is a real answer,
              which is why the hint has to say what it is not.
            */}
            <fieldset className="rounded-[var(--r-sm)] border border-line bg-surface-2 p-3">
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
                  className={cn(
                    'flex items-center gap-2 text-[length:var(--fs-text-sm)]',
                    hasCourse ? 'text-fg' : 'text-fg-faint',
                  )}
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
          </FormSection>

          {error ? (
            <p role="alert" className="text-[length:var(--fs-text-sm)] text-err">
              {error}
            </p>
          ) : null}
        </div>

        {/*
          Sticky, because the save sits at the bottom of a form a phone scrolls
          through five sections of. `-mx-5` bleeds it to the dialog's own edges
          (`DialogContent` pads `p-5`; this dialog drops the bottom padding so
          the bar can sit flush), and the surface colour stops the fields
          sliding visibly underneath it.
        */}
        <DialogFooter className="sticky bottom-0 z-10 -mx-5 border-t border-line bg-surface-2 px-5 pt-3 pb-5">
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              {copy.admin.common.cancel}
            </Button>
          </DialogClose>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? c.catalogSaving : c.catalogSave}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One block of the form — an icon well, a heading, and its fields.
 *
 * A container per question rather than a divider line: a page of bordered
 * inputs with nothing grouping them reads to the owner as a document, not a
 * product (the `ayman-ui-taste` note), and «where does this book belong» is a
 * different question from «what does it cost».
 */
function FormSection({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--r-md)] border border-line bg-surface-1 p-3.5 sm:p-4">
      <h3 className="mb-3 flex items-center gap-2 text-[length:var(--fs-text-base)] font-semibold text-fg">
        <span
          className="grid size-7 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklch,var(--a-9),transparent_82%)] text-accent-text"
          aria-hidden="true"
        >
          <Icon size={15} />
        </span>
        {title}
      </h3>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

/**
 * «الترم الأول / الترم التاني / السنة كاملة» as three buttons, not a
 * `<select>`.
 *
 * This is the field that decides the HEADING a student reads the book under on
 * `/books`, and «غيّر السنة كاملة للترم الأول» is how this screen came to be
 * rebuilt: the answer was a dropdown, third in a row of three, showing one word
 * at a time. Three visible options in the term's own colour — the same colour
 * the list's chip uses — make the current band obvious before anyone opens
 * anything.
 *
 * Real radios under the paint (`sr-only`, one `name`), so arrow keys, the
 * screen-reader group and form semantics all come from the platform.
 */
function TermPicker({
  name,
  value,
  onChange,
}: {
  name: string;
  value: BookTerm;
  onChange: (term: BookTerm) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-[length:var(--fs-text-sm)] font-medium text-fg">
        {c.fieldTerm}
      </legend>
      <div className="grid grid-cols-3 gap-2">
        {BOOK_TERMS.map((term) => {
          const selected = value === term;
          return (
            <label
              key={term}
              className={cn(
                'flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--r-sm)] border px-2 py-2 text-center',
                'text-[length:var(--fs-text-sm)] font-medium transition-colors duration-[160ms] ease-out',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2',
                selected ? BOOK_TERM_SELECTED[term] : BOOK_TERM_TONE[term],
              )}
            >
              <input
                type="radio"
                className="sr-only"
                name={name}
                value={term}
                checked={selected}
                onChange={() => onChange(term)}
              />
              {selected ? <Check size={16} aria-hidden="true" className="shrink-0" /> : null}
              <span>{BOOK_TERM_LABEL[term]}</span>
            </label>
          );
        })}
      </div>
      <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">{c.fieldTermHint}</p>
    </fieldset>
  );
}
