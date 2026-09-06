import type { StudentHistoryEntry } from '@ayman/contracts/admin/students';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts';
import { Card, CardBody, CardHeader, CardTitle } from '@ayman/ui/components/card';
import { cn } from '@ayman/ui/lib/cn';

const c = copy.admin.students;

/**
 * Everything that was DONE to this account, newest first — and by whom.
 *
 * ## Why it is not folded into the two panels above it
 *
 * `CourseAccessSection` answers "which closed courses does this student hold",
 * `SubscriptionSection` answers "what have they paid for". Both are STATE, and
 * both are blind in the same direction: a course opened by hand is
 * `source: 'admin'`, which the subscription panel filters out entirely (see
 * `StudentHistoryService`). The result was that a student holding a live,
 * never-expiring grant to a paid course read as «مالوش أي اشتراك مدفوع» on the
 * one screen an operator checks when money is in question.
 *
 * ## Why the rows are flat and dated rather than grouped
 *
 * The question this panel gets opened for is causal — «هو اشترى الكتاب فاتفتح
 * له الكورس؟» — and the answer is nearly always the gap between two entries.
 * Grouping by kind puts the grant and the order in different boxes and throws
 * that gap away. One column, one order, dates on every row.
 *
 * ## Why the actor is on every row that has one
 *
 * «أنا عملته ولا هو اشترك؟» is the whole ask. A row with no actor is the
 * student's own doing and says so explicitly (`historyByStudent`) rather than
 * leaving the space blank — blank reads as missing data, and this panel is
 * only useful if the absence of an admin is itself trustworthy.
 */

/** Kinds that mean somebody was given something they did not buy. Rendered
 *  with the warm accent, because these are the rows the panel is opened for. */
const HAND_ISSUED = new Set(['grant_created']);

function sourceLabel(source: string | null): string | null {
  if (source === 'admin') return c.historySourceAdmin;
  if (source === 'purchase') return c.historySourcePurchase;
  if (source === 'auto_free') return c.historySourceAutoFree;
  return null;
}

function dateTime(iso: string): string {
  return new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    numberingSystem: 'latn',
  }).format(new Date(iso));
}

function money(cents: number): string {
  return new Intl.NumberFormat('ar-EG', { numberingSystem: 'latn' }).format(cents / 100);
}

export function HistorySection({ entries }: { entries: StudentHistoryEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{c.historyTitle}</CardTitle>
        <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.historyLead}</p>
      </CardHeader>
      <CardBody>
        {entries.length === 0 ? (
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.historyEmpty}</p>
        ) : (
          <ol className="flex flex-col gap-0">
            {entries.map((entry) => {
              const source = sourceLabel(entry.source);
              /* An admin-issued grant is the one row an operator is scanning
                 for; everything else is context around it. */
              const flagged = HAND_ISSUED.has(entry.kind) && entry.source === 'admin';
              return (
                <li
                  key={entry.key}
                  className={cn(
                    'flex flex-col gap-1 border-b border-line-subtle py-3 last:border-b-0',
                    flagged && 'border-e-2 border-e-warn pe-3',
                  )}
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="font-medium text-fg">{c.historyKinds[entry.kind]}</span>
                    {entry.courseTitle ? (
                      <span className="text-[length:var(--fs-text-sm)] text-fg-muted">— {entry.courseTitle}</span>
                    ) : null}
                    <span className="ms-auto text-[length:var(--fs-text-xs)] tabular-nums text-fg-muted">
                      {dateTime(entry.at)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-text-sm)] text-fg-muted">
                    <span>
                      {entry.actorName
                        ? formatCopy(c.historyBy, { name: entry.actorName })
                        : c.historyByStudent}
                    </span>
                    {source ? <span>{source}</span> : null}
                    {entry.amountCents !== null ? (
                      <span className="tabular-nums">
                        {entry.isFree ? c.historyFree : `${money(entry.amountCents)} ج`}
                      </span>
                    ) : null}
                    {/* Spelled out on every grant row — see `historyNoExpiry`. */}
                    {entry.kind === 'grant_created' ? (
                      <span>
                        {entry.validUntil
                          ? formatCopy(c.historyUntil, { date: dateTime(entry.validUntil) })
                          : c.historyNoExpiry}
                      </span>
                    ) : null}
                  </div>

                  {entry.detail ? (
                    <p className="text-[length:var(--fs-text-sm)] text-fg-muted">«{entry.detail}»</p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
