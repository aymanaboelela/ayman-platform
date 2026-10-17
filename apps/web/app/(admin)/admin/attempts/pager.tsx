import Link from 'next/link';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';

const b = copy.quizAdmin.board;

/**
 * «٢١–٤٠ من ٣١٢» and the two links either side — server-rendered, so a page is
 * a URL that can be sent to someone.
 *
 * The list used to have NO total: it asked for one row more than it showed to
 * guess whether there was a next page, and could never say how many there
 * were. A page past the last one (a stale link after a regrade emptied a tab)
 * offers the way back to the first rather than an empty screen with nowhere to
 * go.
 */
export function Pager({
  page,
  perPage,
  rowCount,
  shown,
  hrefFor,
}: {
  page: number;
  perPage: number;
  rowCount: number;
  /** Rows actually on this page — zero past the end. */
  shown: number;
  hrefFor: (page: number) => string;
}) {
  if (shown === 0 && page > 1 && rowCount > 0) {
    return (
      <p className="mt-4 text-center">
        <Link href={hrefFor(1)} className="chip chip--quiet">
          {b.firstPage}
        </Link>
      </p>
    );
  }
  if (rowCount <= perPage) return null;

  const from = (page - 1) * perPage + 1;
  const to = Math.min(rowCount, page * perPage);
  return (
    <nav className="mt-4 flex items-center justify-between gap-3 text-[length:var(--fs-text-sm)]">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className="chip chip--quiet">
          {b.pagePrev}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-fg-muted tabular-nums">{formatCopy(b.pageOf, { from, to, total: rowCount })}</span>
      {to < rowCount ? (
        <Link href={hrefFor(page + 1)} className="chip chip--quiet">
          {b.pageNext}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
