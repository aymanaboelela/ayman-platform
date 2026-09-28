import { notFound } from 'next/navigation';
import { GraduationCap, Megaphone, Package, Pencil, ShoppingBag } from 'lucide-react';
import { getEntitlements } from '@/lib/entitlements';
import { z } from 'zod';
import { AdminBookRowSchema, type AdminBookRow } from '@ayman/contracts/admin/books';
import { SiteSettingsSchema } from '@ayman/contracts/admin/settings';
import { DEFAULT_BOOK_SHIPPING_RATES } from '@ayman/contracts/books';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Badge } from '@ayman/ui/components/badge';
import { Button } from '@ayman/ui/components/button';
import { cn } from '@ayman/ui/lib/cn';
import { adminGet } from '@/lib/admin-api';
import { formatEGP } from '@/lib/price';
import { CourseArt } from '@/components/course-art';
import { StreamBadge } from '@/components/stream-badge';
import {
  BookFormDialog,
  type CourseOption,
  type SubjectOption,
} from '@/components/admin/books/book-form-dialog';
import { bookPlacementLabels } from '@/components/admin/books/book-payload';
import {
  BOOK_TERMS,
  BOOK_TERM_EDGE,
  BOOK_TERM_LABEL,
  BOOK_TERM_TONE,
} from '@/components/admin/books/book-term';
import { AdminEmpty } from '@/components/admin/admin-empty';
import { BooksTabs } from '../books-tabs';
import { BookRowActions } from './book-row-actions';
import { ShippingFeeForm } from './shipping-fee-form';

const c = copy.admin.books;

export const metadata = { title: c.catalogTitle };

/**
 * `/admin/books/catalog` — «الكتب», the shelf.
 *
 * Uncached `adminGet`, like every other admin read: whoever just changed a
 * price must see their own write, never a stale row that makes a save look like
 * it failed.
 *
 * ## Grouped by term, the way `/books` groups them
 *
 * «غيّر السنة كاملة للترم الأول» was reported from the SHOP, where a book sits
 * under the heading of its `term`. This list used to be one flat column with
 * the term as a grey outline chip among five others, so a book in the wrong
 * band looked exactly like a book in the right one. The bands are now the
 * list's own headings, in the shop's order and the term's colour, and moving a
 * book is visibly moving it.
 *
 * ## One row is one object
 *
 * The cover as the shop draws it (3/4, `CourseArt`'s generated jacket when
 * there is none), the title, the course it belongs to, the price, the stock and
 * whether it is on sale — and a button on every row. The owner asked for
 * exactly that list («صفحة أختار فيها الكتاب، تبع أنهي كورس، وأحط الصورة»),
 * and reads a screen of bordered text as unfinished.
 *
 * ## Not paginated, deliberately
 *
 * A shop with more titles than fit on one screen is a different product, and
 * pagination here would put a page control under a list of twelve. Within a
 * band the order is `sortOrder` then title — the same order `/books` renders —
 * so what an admin sees here is the shelf they are editing.
 */
export default async function AdminBooksCatalogPage() {
  /*
   * نفس جيت `/admin/books` — والـURL ده بيتوصله من غيره. الحكاية كاملة فوق
   * دالة الصفحة الأب؛ اللي يهم هنا إن صفحة جوّه قسم مقفول لازم تقول نفس
   * اللي القسم بيقوله، وإلا اللي كتب الـURL بإيده بيلاقي شاشة خطأ من
   * `adminGet` على راوت بيرد ٤٠٤ بدل ما يلاقي إن مفيش صفحة.
   */
  if (!(await getEntitlements()).books) notFound();

  const [books, settings, subjects, courses] = await Promise.all([
    adminGet('/api/admin/books', z.array(AdminBookRowSchema)),
    adminGet('/api/admin/settings', SiteSettingsSchema),
    /* `/admin/taxonomy/subjects`, not the public `/api/taxonomy`: the public
       payload nests subjects inside offerings per system/year/track, so the
       same subject appears many times and its bare id is not on it. This route
       answers with the subject table itself, already sorted by `nameAr`. */
    adminGet(
      '/api/admin/taxonomy/subjects',
      z.array(z.object({ id: z.string(), nameAr: z.string() })),
    ),
    /* `year` and the stream pair are read for the PICKER's label, not for the
       list: `books.course_id` is UNIQUE, so «الرياضيات — أولى بكالوريا»
       appearing twice with nothing to separate the عربي row from the لغات one
       is a choice whose mistake cannot be undone by adding a second book. See
       `courseOptionLabel`. `status` goes through too — `courseChoices` offers
       published courses only, plus whichever one a book is already linked
       to. */
    adminGet(
      '/api/admin/courses',
      z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          status: z.string(),
          year: z.number().int(),
          forGeneral: z.boolean(),
          forLanguages: z.boolean(),
        }),
      ),
    ),
  ]);

  const courseOptions: CourseOption[] = courses.map((course) => ({
    id: course.id,
    title: course.title,
    year: course.year,
    forGeneral: course.forGeneral,
    forLanguages: course.forLanguages,
    status: course.status,
  }));

  /* Which course is already some book's — so the picker greys it out and says
     whose, instead of letting the save come back with a 409. */
  const courseTakenBy: Record<string, string> = {};
  for (const book of books) {
    if (book.courseId !== null) courseTakenBy[book.courseId] = book.titleAr;
  }

  const activeCount = books.filter((book) => book.isActive).length;

  return (
    <>
      <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">
        {c.eyebrow}
      </p>
      <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">
        {c.catalogTitle}
      </h1>
      <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.catalogSubtitle}</p>

      <BooksTabs active="/admin/books/catalog" />

      {/* «كتاب جديد» at the top of the list it adds to — it used to sit under
          the delivery-fee form, a full-width block that pushed the books
          themselves below the fold on a laptop. */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
          {books.length === 0
            ? null
            : formatCopy(c.catalogSummary, { n: books.length, active: activeCount })}
        </p>
        <BookFormDialog
          book={null}
          subjects={subjects}
          courses={courseOptions}
          courseTakenBy={courseTakenBy}
        />
      </div>

      {books.length === 0 ? (
        <AdminEmpty spot="orders" title={c.catalogEmpty} hint={c.catalogEmptyHint} />
      ) : (
        <>

          {BOOK_TERMS.map((term) => {
            const inTerm = books.filter((book) => book.term === term);
            /* A band with nothing in it renders nothing — the same rule the shop
               applies, so an empty «الترم التاني» heading never suggests a
               missing book. */
            if (inTerm.length === 0) return null;
            return (
              <section key={term} className="mt-5" aria-labelledby={`book-term-${term}`}>
                <h2
                  id={`book-term-${term}`}
                  className="mb-2.5 flex items-center gap-2 text-[length:var(--fs-text-base)] font-semibold text-fg"
                >
                  <span
                    className={cn(
                      'rounded-full border px-3 py-1 text-[length:var(--fs-text-sm)]',
                      BOOK_TERM_TONE[term],
                    )}
                  >
                    {BOOK_TERM_LABEL[term]}
                  </span>
                  <span className="text-[length:var(--fs-text-sm)] font-normal text-fg-muted">
                    {formatCopy(copy.books.shelfCount, { n: inTerm.length })}
                  </span>
                </h2>

                <ul className="flex flex-col gap-2.5">
                  {inTerm.map((book) => (
                    <BookRow
                      key={book.id}
                      book={book}
                      subjects={subjects}
                      courses={courseOptions}
                      courseTakenBy={courseTakenBy}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}

      {/* The delivery fee lives on this screen and not under a fifth settings
          tab, because it is a price and this is the prices screen — but UNDER
          the shelf: it changes a few times a year, the books change weekly. */}
      <div className="mt-8">
        <ShippingFeeForm rates={settings.store?.shippingRates ?? DEFAULT_BOOK_SHIPPING_RATES} />
      </div>
    </>
  );
}

function BookRow({
  book,
  subjects,
  courses,
  courseTakenBy,
}: {
  book: AdminBookRow;
  subjects: SubjectOption[];
  courses: CourseOption[];
  courseTakenBy: Record<string, string>;
}) {
  return (
    <li
      className={cn(
        'flex gap-3 rounded-xl border border-s-4 border-line bg-surface-2 p-3 sm:gap-4 sm:p-4',
        BOOK_TERM_EDGE[book.term],
        /* Hidden books stay in the list — «اعرضه» is on the row — but step back
           so the shelf a visitor sees is what stands out. */
        !book.isActive && 'bg-surface-1',
      )}
    >
      {/* 3/4, the shop's own card shape, and `CourseArt` so a book with no
          upload shows the SAME generated jacket the shop does — the admin
          judges the shelf as the student will see it. */}
      <span
        className={cn(
          /* `self-start`: the row is a flex line that STRETCHES its items, and a
             stretched height wins over `aspect-ratio` — on a phone, where the
             details wrap to twice the height, the jacket became a tall strip. */
          'relative block aspect-[3/4] w-16 shrink-0 self-start overflow-hidden rounded-[var(--r-sm)] border border-line bg-surface-3 sm:w-20',
          !book.isActive && 'opacity-60',
        )}
      >
        <CourseArt
          coverKey={book.coverKey}
          subjectNameAr={book.subjectNameAr ?? book.titleAr}
          seed={book.slug}
          compact
          sizes="5rem"
        />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            <h3 className="text-[length:var(--fs-text-base)] font-semibold text-fg">
              {book.titleAr}
            </h3>
            {book.subtitleAr ? (
              <p className="mt-0.5 text-[length:var(--fs-text-sm)] text-fg-muted">
                {book.subtitleAr}
              </p>
            ) : null}
          </div>

          {/* The price is the number people ask about, so it is the one set
              large and in the action colour. */}
          <p className="flex items-baseline gap-2">
            <span className="mono text-[length:var(--fs-title-4)] font-semibold text-accent-text">
              {formatCopy(c.catalogPrice, { price: formatEGP(book.priceCents) })}
            </span>
            {book.comparePriceCents !== null ? (
              <span className="mono text-[length:var(--fs-text-sm)] text-fg-faint line-through">
                {formatCopy(c.catalogPrice, { price: formatEGP(book.comparePriceCents) })}
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/*
            «معروض» / «مخفي» as a BADGE and not a colour on the row: colour
            alone is not an accessible signal (WCAG 1.4.1), and this is the most
            consequential fact in the list — the difference between a book the
            shop sells and one it does not.
          */}
          <Badge tone={book.isActive ? 'ok' : 'neutral'}>
            {book.isActive ? c.catalogActive : c.catalogHidden}
          </Badge>
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[length:var(--fs-text-xs)] font-medium',
              BOOK_TERM_TONE[book.term],
            )}
          >
            {BOOK_TERM_LABEL[book.term]}
          </span>
          {/* «المدارس», rendered by the one component that draws this
              distinction anywhere — the shop card, the packing list and this
              row cannot describe the same book differently. */}
          <StreamBadge forGeneral={book.forGeneral} forLanguages={book.forLanguages} />
          {book.year !== null ? (
            <span className="rounded-full border border-line bg-surface-3 px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
              {formatCopy(copy.books.yearChip, { n: book.year })}
            </span>
          ) : null}
          {book.subjectNameAr ? (
            <span className="rounded-full border border-line bg-surface-3 px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
              {book.subjectNameAr}
            </span>
          ) : null}
        </div>

        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[length:var(--fs-text-xs)] text-fg-muted">
          {/* The course first: «تبع أنهي كورس» is half of what was asked. */}
          <li className="flex items-center gap-1.5">
            <GraduationCap size={14} aria-hidden="true" className="shrink-0 text-accent-text" />
            <span className="sr-only">{c.catalogCourseLabel}: </span>
            {book.courseTitle ? (
              <span className="font-medium text-fg">{book.courseTitle}</span>
            ) : (
              <span className="text-fg-faint">{c.catalogNoCourse}</span>
            )}
          </li>
          <li className="flex items-center gap-1.5">
            <Package size={14} aria-hidden="true" className="shrink-0" />
            <span>{c.catalogColumnStock}:</span>
            {book.stock === null ? (
              <span>{c.catalogStockUncounted}</span>
            ) : book.stock === 0 ? (
              <Badge tone="err">{c.catalogStockOut}</Badge>
            ) : (
              <Badge tone="ok">{formatCopy(c.catalogStockLeft, { n: book.stock })}</Badge>
            )}
          </li>
          <li className="flex items-center gap-1.5">
            <ShoppingBag size={14} aria-hidden="true" className="shrink-0" />
            <span>
              {c.catalogColumnOrdered}: {formatCopy(c.catalogOrderedCount, { n: book.orderedCount })}
            </span>
          </li>
          {/* «يظهر فين» — placement, never permission. «معروض/مخفي» above is
              the badge that says whether it is on sale at all; this says where
              it is ADVERTISED, and «قسم الكتب بس» is a real answer rather than
              an empty cell that reads as a row which failed to load. */}
          <li className="flex items-center gap-1.5">
            <Megaphone size={14} aria-hidden="true" className="shrink-0" />
            <span>
              {c.catalogColumnPlacement}: {bookPlacementLabels(book).join(' · ')}
            </span>
          </li>
        </ul>

        {/* A button on every row, «تعديل» first and in the action colour —
            it is the one this screen exists for. «اخفيه» next, «امسح» behind
            a confirm; see `BookRowActions` for why hiding leads. */}
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <BookFormDialog
            book={book}
            subjects={subjects}
            courses={courses}
            courseTakenBy={courseTakenBy}
            trigger={
              <Button type="button" size="sm">
                <Pencil size={15} aria-hidden="true" />
                {c.editButton}
              </Button>
            }
          />
          <BookRowActions book={book} />
          {/* The shareable anchor — a desktop nicety; on a phone it wraps to two
              lines of monospace under the buttons and says nothing new. */}
          <span
            className="mono ms-auto hidden text-[length:var(--fs-text-xs)] text-fg-faint sm:inline"
            dir="ltr"
          >
            /books#book-{book.slug}
          </span>
        </div>
      </div>
    </li>
  );
}
