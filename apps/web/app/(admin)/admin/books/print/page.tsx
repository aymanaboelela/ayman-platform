import { Fragment } from 'react';
import Link from 'next/link';
import './print.css';
import { copy } from '@ayman/contracts/copy/admin';
import { copy as site } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import {
  AdminBookOrderFilterSchema,
  AdminBookOrderStreamSchema,
  PackingListSchema,
} from '@ayman/contracts/admin/book-orders';
import { z } from 'zod';
import { adminGet } from '@/lib/admin-api';
import { PrintButton } from './print-button';

const c = copy.admin.books;
const brand = site.site;

export const metadata = { title: c.printTitle };

const YearFilterSchema = z.coerce.number().int().min(1).max(3);

/** Same labels the tab bar uses, so the printed page names the list the same
 *  way the screen it came from does. */
const STATUS_LABEL: Record<string, string> = {
  paid: c.filterPaid,
  shipped: c.filterShipped,
  delivered: c.filterDelivered,
  address_only: c.filterAddressOnly,
  rejected: c.filterRejected,
  deleted: c.filterDeleted,
};

/**
 * `YYYY-MM-DD` → «08/09/2026», by hand.
 *
 * NOT `Intl.DateTimeFormat`: the Arabic locale interleaves RTL marks (U+200F)
 * between the parts, and inside the LTR-isolated cell this column needs those
 * marks reorder it — the first print of this sheet read «082026/09/» for the
 * 8th of September. The API already hands back a plain ISO date, so there is
 * nothing to parse and no time zone to get wrong.
 */
const shipDate = (iso: string): string => {
  const [year, month, day] = iso.split('-');
  return day && month && year ? `${day}/${month}/${year}` : iso;
};
const stampFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * `/admin/books/print` — لستة الشحن على A4، جاهزة للطباعة أو الحفظ PDF.
 *
 * ## Why this page exists at all
 *
 * «وانا بعمل تحميل يتعمل PDF أحسن بشكل كويس كده». The spreadsheet is the right
 * file for a print shop that wants to sort and filter; it is the wrong one for
 * the copy that goes in the box with the parcels. This is the same list, laid
 * out on paper.
 *
 * ## Why the BROWSER makes the PDF
 *
 * An Arabic PDF needs bidi and letter joining. Node's PDF libraries do neither
 * properly — they would hand the courier reversed, disconnected letters, which
 * is worse than handing them nothing. The browser shapes Arabic perfectly and
 * already has «حفظ كـ PDF» in its print dialog, so the page IS the renderer.
 *
 * ## Why it reads the SAME endpoint as the `.xlsx`
 *
 * `GET /api/admin/book-orders/packing-list` is the spreadsheet's own list —
 * one query, one grouping, one set of counts. A second implementation here is
 * how the two files would end up disagreeing about the same day's orders,
 * which is the exact complaint that started all of this.
 */
export default async function BookOrdersPrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string): string | undefined => {
    const value = Array.isArray(params[key]) ? params[key][0] : params[key];
    return typeof value === 'string' && value !== '' ? value : undefined;
  };

  /* Read THROUGH the schemas, exactly like the list screen: these go straight
     into a query string the API re-validates, and a junk value should print
     the default list rather than an error page. `status` has no default there
     — «مدفوعة» is the daily queue and the tab this is almost always opened
     from. */
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

  /* The link back carries the same filters, so «رجوع» returns to the screen
     this was printed from and not to a default tab. */
  const backQuery = new URLSearchParams(listQuery);
  backQuery.delete('from');
  backQuery.delete('to');

  const dateRange =
    from && to
      ? formatCopy(c.printRange, { from, to })
      : from
        ? formatCopy(c.printFrom, { from })
        : to
          ? formatCopy(c.printTo, { to })
          : null;

  const columns = c.printColumns;

  return (
    <div className="packing-sheet" dir="rtl">
      {/* The toolbar is the only part that is not the list — and the only part
          the printer never sees. */}
      <div className="packing-no-print mb-4 flex flex-wrap items-center gap-2">
        <PrintButton />
        <Link
          href={`/admin/books?${backQuery}`}
          className="rounded-full border border-[#999] px-4 py-1.5 text-[length:var(--fs-text-sm)] text-[#333]"
        >
          {c.printBack}
        </Link>
      </div>

      <header className="packing-head">
        <div>
          {/* The lockup a print shop recognises the paper by. */}
          <p className="packing-brand">{brand.name}</p>
          <h1>{c.printTitle}</h1>
          <p className="packing-filters">
            {[
              STATUS_LABEL[status] ?? status,
              dateRange,
              stream ? (stream === 'general' ? c.streamGeneral : c.streamLanguages) : null,
              year !== undefined ? formatCopy(c.printYear, { n: String(year) }) : null,
              query ? formatCopy(c.printSearch, { q: query }) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <p className="packing-stamp">
          {formatCopy(c.printGeneratedAt, { date: stampFormatter.format(new Date()) })}
        </p>
      </header>

      {/*
        الأرقام فوق، زي الإكسل بالظبط.

        «الطلبات» is FIRST and is the number that can be checked against the
        screen: the list counts orders, the other two count books, and one
        order holding two titles is what «واحد ناقص» looks like when the three
        are read as one number.
      */}
      <section className="packing-summary">
        <div className="packing-totals">
          <div className="packing-card">
            <b>{list.orders}</b>
            <span>{c.printOrdersLabel}</span>
          </div>
          <div className="packing-card">
            <b>{list.books}</b>
            <span>{c.printBooksLabel}</span>
          </div>
          <div className="packing-card">
            <b>{list.copies}</b>
            <span>{c.printCopiesLabel}</span>
          </div>
        </div>

        <ul className="packing-breakdown">
          {list.groups.map((group) => (
            <Fragment key={group.label || 'no-stream'}>
              <li className="packing-edition">
                {`${group.label || c.printNoStream}: ${group.books} / ${group.copies}`}
              </li>
              {group.years.map((entry) => (
                <li key={`${group.label}-${entry.year ?? 'no-year'}`}>
                  {`${
                    entry.year === null
                      ? c.printNoYear
                      : formatCopy(c.printYear, { n: String(entry.year) })
                  }: ${entry.books} / ${entry.copies}`}
                </li>
              ))}
            </Fragment>
          ))}
        </ul>
      </section>

      {list.groups.length === 0 ? <p className="packing-empty">{c.printEmpty}</p> : null}

      {/* One table per edition, «العربي فوق وتحته اللغات» — two physical stacks
          of paper, two passes for the packer, never interleaved. */}
      {list.groups.map((group) => (
        <section key={group.label || 'no-stream'} className="packing-group">
          <h2>
            <span>{group.label || c.printNoStream}</span>
            <small>
              {[
                formatCopy(c.printBooks, { n: String(group.books) }),
                formatCopy(c.printCopies, { n: String(group.copies) }),
              ].join(' · ')}
            </small>
          </h2>
          <table className="packing-table">
            <colgroup>
              <col style={{ width: '4%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '4.5%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '26.5%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '6%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>{columns.seq}</th>
                <th>{columns.bookTitle}</th>
                <th>{columns.quantity}</th>
                <th>{columns.fullName}</th>
                <th>{columns.phone}</th>
                <th>{columns.address}</th>
                <th>{columns.createdAt}</th>
                <th>{columns.tick}</th>
              </tr>
            </thead>
            <tbody>
              {group.lines.map((line) => (
                <tr key={line.seq}>
                  <td className="packing-seq">{line.seq}</td>
                  <td>
                    <span className="packing-title">{line.bookTitle}</span>
                    {line.year !== null ? (
                      <span className="packing-note">
                        {formatCopy(c.printYear, { n: String(line.year) })}
                      </span>
                    ) : null}
                  </td>
                  <td className="packing-qty">{line.quantity}</td>
                  <td>{line.fullName}</td>
                  {/* Both numbers in one cell: the courier calls the first, and
                      the second is what stops a parcel coming back. */}
                  <td className="packing-phone">
                    {line.phone}
                    {line.altPhone ? <span className="packing-note">{line.altPhone}</span> : null}
                  </td>
                  <td className="packing-address">
                    {[line.governorate, line.city, line.street, line.building]
                      .filter(Boolean)
                      .join('، ')}
                    {line.note ? <span className="packing-note">{line.note}</span> : null}
                  </td>
                  <td className="packing-date">{shipDate(line.createdAt)}</td>
                  {/* Ticked with a pen as each parcel goes in the box. */}
                  <td className="packing-tick">
                    <span />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
