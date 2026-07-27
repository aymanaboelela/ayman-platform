'use client';

import { Fragment, useState } from 'react';
import { copy, formatCopy } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { RichText } from '@/components/content/rich-text';

export interface ItemAnalysisDistractor {
  optionId: string;
  bodyHtml: string;
  fraction: number;
  picks: number;
}

export interface ItemAnalysisRow {
  questionVersionId: string;
  stemHtml: string;
  n: number;
  facility: number | null;
  discrimination: number | null;
  distractors: ItemAnalysisDistractor[];
}

/** Below this many attempts, a discrimination index is noise, not signal —
 *  matches the `item.n < MIN_ATTEMPTS_FOR_DISCRIMINATION` gate below. */
const MIN_ATTEMPTS_FOR_DISCRIMINATION = 10;

/** Sorted worst-discrimination-first by the API — the whole point of this
 *  screen is surfacing the item that needs a look. No TanStack Table here:
 *  the sort/expand behaviour is small enough that the dependency buys
 *  nothing a plain table + local `expanded` state doesn't already give. */
export function ItemAnalysisTable({ items }: { items: ItemAnalysisRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-line-subtle bg-surface-2 p-8 text-center font-mono text-fg-muted">
        {copy.common.empty}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-line-subtle text-start">
            <th className="p-3 text-start text-[length:var(--fs-mono-label)] font-normal text-fg-muted">
              {copy.quizAdmin.columnQuestion}
            </th>
            <th className="mono p-3 text-center text-[length:var(--fs-mono-label)] font-normal text-fg-muted">
              {copy.quizAdmin.columnN}
            </th>
            <th className="mono p-3 text-center text-[length:var(--fs-mono-label)] font-normal text-fg-muted">
              {copy.quizAdmin.facilityIndex}
            </th>
            <th className="mono p-3 text-center text-[length:var(--fs-mono-label)] font-normal text-fg-muted">
              {copy.quizAdmin.discriminationIndex}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const isExpanded = expanded === item.questionVersionId;
            const panelId = `item-analysis-panel-${item.questionVersionId}`;
            return (
              <Fragment key={item.questionVersionId}>
                <tr className="border-b border-line-subtle">
                  <td className="max-w-[24rem] p-0">
                    {/* I10: a real, focusable disclosure button — not an
                        onClick handler on a `<tr>`, which has no implicit tab
                        stop and no expanded/collapsed state. `role="button"`
                        on the row itself would also destroy table row
                        semantics, so the interactive element lives in the
                        cell instead. */}
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 p-3 text-start hover:bg-surface-3"
                      aria-expanded={isExpanded}
                      aria-controls={panelId}
                      onClick={() =>
                        setExpanded((current) => (current === item.questionVersionId ? null : item.questionVersionId))
                      }
                    >
                      <RichText html={item.stemHtml} className="truncate text-fg" />
                    </button>
                  </td>
                  <td className="mono p-3 text-center tabular-nums text-fg-muted">{item.n}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-2">
                      <span className="mono tabular-nums text-fg">
                        {item.facility === null ? '—' : `${Math.round(item.facility * 100)}%`}
                      </span>
                      {item.facility !== null ? (
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-4">
                          <span className="block h-full bg-accent" style={{ width: `${item.facility * 100}%` }} />
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="mono p-3 text-center tabular-nums text-fg">
                    {item.n < MIN_ATTEMPTS_FOR_DISCRIMINATION
                      ? formatCopy(copy.quizAdmin.tooFewAttempts, { n: MIN_ATTEMPTS_FOR_DISCRIMINATION })
                      : item.discrimination === null
                        ? '—'
                        : item.discrimination.toFixed(2)}
                  </td>
                </tr>
                {isExpanded ? (
                  <tr id={panelId} className="border-b border-line-subtle bg-surface-2">
                    <td colSpan={4} className="p-3">
                      <p className="mb-2 text-[length:var(--fs-text-xs)] text-fg-muted">
                        {copy.quizAdmin.distractorAnalysis}
                      </p>
                      <ul className="space-y-1">
                        {item.distractors.map((distractor) => (
                          <li
                            key={distractor.optionId}
                            className={cn(
                              'flex items-center justify-between gap-3 rounded-sm px-2 py-1',
                              distractor.fraction > 0 ? 'bg-surface-3' : undefined,
                            )}
                          >
                            <RichText html={distractor.bodyHtml} className="text-fg" />
                            <span className="mono tabular-nums text-fg-muted">
                              {formatCopy(copy.quizAdmin.distractorPicks, { n: distractor.picks })}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
