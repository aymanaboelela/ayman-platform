'use client';

import { useId, useState, type ReactNode } from 'react';
import { Table2 } from 'lucide-react';
import { cn } from '@ayman/ui/lib/cn';
import { copy } from '@ayman/contracts/copy/admin';
import { num, pct } from './format';

const c = copy.analytics;

export interface TableRow {
  label: string;
  value: string;
  /** 0..1. Rendered as a third column when present — the share is what the
   *  chart encodes, so a table that only lists counts is not the same view. */
  share?: number | null;
  /** The mark's colour, shown as a swatch. Identity must survive the switch
   *  from chart to table, or the two views disagree about which row is which. */
  color?: string;
}

/**
 * The frame every chart on this surface sits in: a heading, an optional
 * explanation, the chart, and a TABLE VIEW behind a toggle.
 *
 * The table is not a nicety. Three things depend on it:
 *
 *   - the accessibility contract — a chart is a picture, and the numbers have
 *     to be reachable as text by a screen reader and by copy-paste;
 *   - the colour contract — the categorical palette's four-slice case sits in
 *     the band that is legal only WITH a second, non-colour channel;
 *   - the data-science workflow this whole screen exists for, where the answer
 *     is usually a number someone needs to write down.
 *
 * So `rows` is REQUIRED. A chart that cannot describe itself as a table is a
 * chart whose author has not decided what it says.
 */
export function ChartCard({
  title,
  hint,
  children,
  rows,
  className,
  action,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  rows: readonly TableRow[];
  className?: string;
  action?: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();
  const empty = rows.length === 0 || rows.every((row) => row.value === c.unknown);

  return (
    <section
      className={cn(
        'flex flex-col rounded-lg border border-line bg-surface-2 p-4 sm:p-5',
        className,
      )}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[length:var(--fs-title-4)] font-semibold text-fg">{title}</h3>
          {hint ? (
            <p className="mt-1 max-w-[var(--w-prose)] text-[length:var(--fs-text-xs)] leading-relaxed text-fg-muted">
              {hint}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {action}
          <button
            type="button"
            onClick={() => setShowTable((open) => !open)}
            aria-expanded={showTable}
            aria-controls={tableId}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1',
              'text-[length:var(--fs-text-xs)] text-fg-muted',
              'transition-colors duration-[160ms] ease-out hover:border-line-strong hover:text-fg',
            )}
          >
            <Table2 className="size-3.5" aria-hidden="true" />
            {showTable ? c.hideTable : c.showTable}
          </button>
        </div>
      </header>

      {empty ? (
        <p className="flex min-h-24 items-center justify-center rounded-md border border-dashed border-line text-[length:var(--fs-text-sm)] text-fg-muted">
          {c.noData}
        </p>
      ) : (
        <div className="min-w-0 grow">{children}</div>
      )}

      {showTable ? (
        <div id={tableId} className="mt-4 overflow-x-auto border-t border-line-subtle pt-3">
          <table className="w-full text-[length:var(--fs-text-sm)]" aria-label={c.tableFallbackLabel}>
            <thead>
              <tr className="text-fg-muted">
                <th scope="col" className="py-1 text-start font-medium">
                  {c.columnCategory}
                </th>
                <th scope="col" className="py-1 text-end font-medium">
                  {c.columnValue}
                </th>
                {rows.some((row) => row.share !== undefined) ? (
                  <th scope="col" className="py-1 text-end font-medium">
                    {c.columnShare}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-t border-line-subtle">
                  <th scope="row" className="py-1.5 text-start font-normal text-fg">
                    <span className="flex items-center gap-2">
                      {row.color ? (
                        <span
                          aria-hidden="true"
                          className="size-2.5 shrink-0 rounded-xs"
                          style={{ background: row.color }}
                        />
                      ) : null}
                      {row.label}
                    </span>
                  </th>
                  <td className="tabular py-1.5 text-end text-fg">{row.value}</td>
                  {rows.some((r) => r.share !== undefined) ? (
                    <td className="tabular py-1.5 text-end text-fg-muted">
                      {row.share === undefined ? '' : pct(row.share, 1)}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

/**
 * The legend. Present whenever there are two or more series — never optional,
 * because colour-matching alone is not an identity channel. A single-series
 * chart gets none: the title already names what is plotted, and a box with one
 * swatch in it restates the title and costs space.
 */
export function Legend({
  items,
}: {
  items: readonly { label: string; color: string; value?: number }[];
}) {
  if (items.length < 2) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-[length:var(--fs-text-xs)]">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-xs"
            style={{ background: item.color }}
          />
          <span className="text-fg-muted">{item.label}</span>
          {item.value === undefined ? null : (
            <span className="tabular font-medium text-fg">{num(item.value)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
