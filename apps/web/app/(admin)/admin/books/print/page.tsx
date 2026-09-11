import Link from 'next/link';
import './print.css';
import { copy } from '@ayman/contracts/copy/admin';
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

const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium' });
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

      <header>
        <h1>{c.printTitle}</h1>
        <p className="packing-meta">
          {[
            STATUS_LABEL[status] ?? status,
            dateRange,
            stream ? (stream === 'general' ? c.streamGeneral : c.streamLanguages) : null,
            year !== undefined ? formatCopy(c.printYear, { n: String(year) }) : null,
            query ? formatCopy(c.printSearch, { q: query }) : null,
            formatCopy(c.printGeneratedAt, { date: stampFormatter.format(new Date()) }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </header>

      {/*
        الملخص فوق، زي الإكسل بالظبط — «أولى سنة كام كتاب وكام نسخة».

        «الطلبات» is first and is the number that can be checked against the
        screen: the list counts orders, the rest of this block counts books,
        and one order holding two titles is what «واحد ناقص» looks like when
        the two are read as the same number.
      */}
      <section className="packing-summary">
        <p className="packing-totals">
          {[
            formatCopy(c.printOrders, { n: String(list.orders) }),
            formatCopy(c.printBooks, { n: String(list.books) }),
            formatCopy(c.printCopies, { n: String(list.copies) }),
          ].join(' · ')}
        </p>
        <ul>
          {list.groups.map((group) => (
            <li key={group.label || 'no-stream'}>
              <strong>
                {(group.label || c.printNoStream) +
                  ': ' +
                  [
                    formatCopy(c.printBooks, { n: String(group.books) }),
                    formatCopy(c.printCopies, { n: String(group.copies) }),
                  ].join(' · ')}
              </strong>
              <ul>
                {group.years.map((entry) => (
                  <li key={entry.year ?? 'no-year'} className="packing-year">
                    {(entry.year === null
                      ? c.printNoYear
                      : formatCopy(c.printYear, { n: String(entry.year) })) +
                      ': ' +
                      [
                        formatCopy(c.printBooks, { n: String(entry.books) }),
                        formatCopy(c.printCopies, { n: String(entry.copies) }),
                      ].join(' · ')}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      {list.groups.length === 0 ? <p className="packing-empty">{c.printEmpty}</p> : null}

      {/* One table per edition, «العربي فوق وتحته اللغات» — two physical stacks
          of paper, two passes for the packer, never interleaved. */}
      {list.groups.map((group) => (
        <section key={group.label || 'no-stream'} className="packing-group">
          <h2>
            {(group.label || c.printNoStream) +
              ' — ' +
              [
                formatCopy(c.printBooks, { n: String(group.books) }),
                formatCopy(c.printCopies, { n: String(group.copies) }),
              ].join(' · ')}
          </h2>
          <table className="packing-table">
            <colgroup>
              <col style={{ width: '5%' }} />
              <col style={{ width: '21%' }} />
              <col style={{ width: '5%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '31%' }} />
              <col style={{ width: '10%' }} />
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
              </tr>
            </thead>
            <tbody>
              {group.lines.map((line) => (
                <tr key={line.seq}>
                  <td className="packing-seq">{line.seq}</td>
                  <td>
                    {line.bookTitle}
                    {line.year !== null ? (
                      <span className="packing-note">
                        {formatCopy(c.printYear, { n: String(line.year) })}
                      </span>
                    ) : null}
                  </td>
                  <td className="packing-qty">{line.quantity}</td>
                  <td>{line.fullName}</td>
                  {/* Both numbers in one cell: the courier calls the first and
                      the second is what stops a parcel coming back. */}
                  <td>
                    {line.phone}
                    {line.altPhone ? <span className="packing-note">{line.altPhone}</span> : null}
                  </td>
                  <td className="packing-address">
                    {[line.governorate, line.city, line.street, line.building]
                      .filter(Boolean)
                      .join('، ')}
                    {line.note ? <span className="packing-note">{line.note}</span> : null}
                  </td>
                  <td>{dateFormatter.format(new Date(line.createdAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
