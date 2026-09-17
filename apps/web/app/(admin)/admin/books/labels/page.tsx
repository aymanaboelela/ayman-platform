import Link from 'next/link';
import './labels.css';
import { copy } from '@ayman/contracts/copy/admin';
import { copy as site } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { egyptianPhoneForLabel } from '@ayman/contracts/phone';
import {
  AdminBookOrderFilterSchema,
  AdminBookOrderStreamSchema,
  PackingListSchema,
} from '@ayman/contracts/admin/book-orders';
import { z } from 'zod';
import { adminGet } from '@/lib/admin-api';
import { cairo } from '@/lib/fonts';
import { PrintButton } from '../print/print-button';

const c = copy.admin.books;
const brand = site.site;

export const metadata = { title: c.labelsTitle };

const YearFilterSchema = z.coerce.number().int().min(1).max(3);

/**
 * `YYYY-MM-DD` → «08/09/2026», by hand — the same reason `print/page.tsx`
 * spells it out: `Intl` with an Arabic locale interleaves U+200F marks that
 * reorder the parts inside an LTR-isolated box, and the first print of the
 * packing sheet read «082026/09/» for the 8th of September.
 */
const shipDate = (iso: string): string => {
  const [year, month, day] = iso.split('-');
  return day && month && year ? `${day}/${month}/${year}` : iso;
};

/**
 * Address parts worth printing, joined.
 *
 * ⚠️ A plain `.filter(Boolean)` is not enough. The address form takes free
 * text, and a required field somebody did not want to answer comes back as a
 * placeholder — «.» is the common one, and production has orders carrying it
 * as the CITY. Joined naively that prints «الإسكندرية — .» on a card a courier
 * is meant to read, which looks like a truncation bug rather than a blank the
 * customer left. A part with no letter or digit in it says nothing, so it is
 * dropped and the line closes up.
 */
const addressLine = (parts: Array<string | null>, separator: string): string =>
  parts
    .filter((part): part is string => typeof part === 'string' && /[\p{L}\p{N}]/u.test(part))
    .map((part) => part.trim())
    .join(separator);

/**
 * `/admin/books/labels` — «كروت الشحن»: one card per parcel, four to an A4
 * sheet, cut along the dotted lines and taped to the box.
 *
 * ## Why this is not the packing sheet
 *
 * «هخده نص بس الكرت وتحطه على الشحنة». `/admin/books/print` is the DESK's
 * paper — a numbered table with a tick box per book, read once while the boxes
 * are filled. This is the BOX's paper: the same run, but every parcel is a
 * self-contained card carrying only what a courier needs to deliver it, big
 * enough to read at arm's length off a stack.
 *
 * The two are generated from the same `packing-list` response, so a parcel can
 * never appear on one and not the other — see `PackingListSchema.labels`.
 *
 * ## One card per ORDER, never per book
 *
 * An order with three titles is one box. The table upstairs prints three rows
 * for it on purpose (a desk sorts by title); three labels would be two labels
 * too many, on two boxes that do not exist. `label.items` is what makes the
 * difference visible — every title in the parcel, listed on the card that goes
 * on it.
 *
 * ## Why the count is a band and not a line
 *
 * «واكتب العدد يبقى تحت كده... عشان يبقى باين». It is the one number a courier
 * checks against what they are physically handed, and the one mismatch worth
 * catching before the van leaves. A filled band at the foot of the card is
 * readable without picking the box up.
 *
 * ## The reference
 *
 * `label.ref` («ك-A3F92C», see `bookOrderRef`) is the same string on the card,
 * in the API and on any reprint. It is what a courier quotes back on the phone
 * about a parcel, and the reason it is not the order's uuid is that nobody
 * reads thirty-six characters down a phone line.
 */
export default async function BookOrderLabelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string): string | undefined => {
    const value = Array.isArray(params[key]) ? params[key][0] : params[key];
    return typeof value === 'string' && value !== '' ? value : undefined;
  };

  /* Read THROUGH the schemas, exactly like the packing sheet: these go into a
     query string the API re-validates, and a junk value should print the
     default run rather than an error page. */
  const status = AdminBookOrderFilterSchema.catch('paid').parse(one('status'));
  const stream = AdminBookOrderStreamSchema.safeParse(one('stream')).data;
  const year = YearFilterSchema.safeParse(one('year')).data;
  const from = one('from');
  const to = one('to');
  const query = (one('q') ?? '').trim().slice(0, 120);

  const listQuery = new URLSearchParams({ status });
  if (from) listQuery.set('from', from);
  if (to) listQuery.set('to', to);
  if (stream) listQuery.set('stream', stream);
  if (year !== undefined) listQuery.set('year', String(year));
  if (query) listQuery.set('q', query);

  const list = await adminGet(
    `/api/admin/book-orders/packing-list?${listQuery}`,
    PackingListSchema,
  );

  const backQuery = new URLSearchParams(listQuery);
  backQuery.delete('from');
  backQuery.delete('to');

  return (
    <div className={`label-sheet ${cairo.variable}`} dir="rtl">
      {/* The toolbar is the only part the printer never sees. */}
      <div className="label-no-print mb-4 flex flex-wrap items-center gap-2">
        <PrintButton />
        <Link
          href={`/admin/books?${backQuery}`}
          className="rounded-full border border-[#999] px-4 py-1.5 text-[length:var(--fs-text-sm)] text-[#333]"
        >
          {c.printBack}
        </Link>
        <span className="text-[length:var(--fs-text-sm)] text-[#555]">
          {formatCopy(c.labelsCount, { n: String(list.labels.length) })}
        </span>
      </div>

      {list.labels.length === 0 ? <p className="label-empty">{c.printEmpty}</p> : null}

      <div className="label-grid">
        {list.labels.map((label) => (
          <article key={label.orderId} className="label-card">
            <header className="label-card__head">
              <span className="label-card__brand">{brand.name}</span>
              <span className="label-card__ref" dir="ltr">
                {label.ref}
              </span>
            </header>

            {/*
              Label / value rows down the FULL width of the card, never two
              columns. «ما تقسمهاليش لجزئين» — this block gets copied field by
              field into a courier's waybill, and a form is read top to bottom
              with the captions lined up; two columns is where the eye jumps
              the row it was on and a phone number lands in the wrong field.
            */}
            <dl className="label-card__rows">
              <div className="label-card__row">
                <dt>{c.labelsTo}</dt>
                <dd className="label-card__name">{label.fullName}</dd>
              </div>

              {/* Both numbers on one row now that there is room for them, but
                  each still carries its own caption and its own LTR isolate —
                  a bare pair in an RTL line is a pair bidi may transpose. */}
              <div className="label-card__row">
                <dt>{c.labelsPhone}</dt>
                <dd className="label-card__phones">
                  <b dir="ltr">{egyptianPhoneForLabel(label.phone)}</b>
                  {label.altPhone ? (
                    <span className="label-card__alt">
                      <span className="label-card__alt-field">{c.labelsAltPhone}</span>
                      <b dir="ltr">{egyptianPhoneForLabel(label.altPhone)}</b>
                    </span>
                  ) : null}
                </dd>
              </div>

              <div className="label-card__row label-card__row--where">
                <dt>{c.labelsAddress}</dt>
                <dd>
                  {/* Widest first — «المحافظة — المدينة» is what sorts the
                      parcel into a van, the street is what finds the door, and
                      the note is what gets it up the stairs. */}
                  <p className="label-card__address label-card__address--wide">
                    {addressLine([label.governorate, label.city], ' — ')}
                  </p>
                  {addressLine([label.street, label.building], '، ') ? (
                    <p className="label-card__address">
                      {addressLine([label.street, label.building], '، ')}
                    </p>
                  ) : null}
                  {addressLine([label.note], '') ? (
                    <p className="label-card__address label-card__address--note">{label.note}</p>
                  ) : null}
                </dd>
              </div>
            </dl>

            {/* «العدد تحت كده عشان يبقى باين» — the number the courier counts
                against what they were handed, beside the EDITION that goes in
                the box. The titles stay on the packing sheet, which has a
                column for them and a desk to read them at. */}
            <footer className="label-card__foot">
              <span className="label-card__count">
                <b>{label.copies}</b>
                <small>{c.labelsCopies}</small>
              </span>
              <span className="label-card__streams">
                {/* NEVER blank. A line typed over the phone carries no
                    catalogue book (`bookId: null`), so no edition can be
                    derived — and an empty slot reads identically to a broken
                    card. Say which it is. */}
                {label.streams.length === 0 ? (
                  <span className="label-card__stream label-card__stream--unknown">
                    {c.labelsStreamUnknown}
                  </span>
                ) : (
                  label.streams.map((stream) => (
                    <span key={stream} className="label-card__stream">
                      {formatCopy(c.labelsStream, { stream })}
                    </span>
                  ))
                )}
              </span>
              <span className="label-card__date">{shipDate(label.createdAt)}</span>
            </footer>
          </article>
        ))}
      </div>
    </div>
  );
}
