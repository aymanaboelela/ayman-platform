'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CircleAlert, Send } from 'lucide-react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import {
  PublishDraftsResultSchema,
  type PublishDraftsFailure,
  type PublishDraftsRequest,
} from '@ayman/contracts/quiz/publish-drafts';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ayman/ui/components/dialog';
import { apiPost } from '@/lib/api';
import './question-bank.css';

const c = copy.quizAdmin.bank;

/** What the dialog is about to publish — `null` is closed. */
export interface PublishDraftsTarget {
  scope: PublishDraftsRequest;
  /** How many drafts the screen believes are in scope — the number on the button. */
  count: number;
  /** Set for a whole category, so the title names it. */
  categoryName?: string;
}

/**
 * «انشر المسودات» — the confirm, then the report.
 *
 * Publishing cannot be taken back (a ready question never goes back to draft;
 * an edit opens a new version), so even the ticked ones get a confirm that
 * says so. The server decides each question again — the count here is what
 * the list showed, not a promise.
 *
 * The questions that would not validate stay drafts and are listed here with
 * the form's own reason and a link to fix each one, instead of a toast that is
 * gone before the third one is read.
 */
export function PublishDraftsDialog({
  target,
  onClose,
  onDone,
}: {
  target: PublishDraftsTarget | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  // Keyed on the target it answers, so reopening on another selection never
  // shows the previous run's failures.
  const [report, setReport] = useState<{ target: PublishDraftsTarget; failed: PublishDraftsFailure[] } | null>(null);
  const failed = report && report.target === target ? report.failed : null;

  async function confirm() {
    if (!target) return;
    setPending(true);
    try {
      const result = await apiPost('/api/admin/questions/publish-drafts', PublishDraftsResultSchema, target.scope);
      if (result.published > 0) toast.success(formatCopy(c.publishDone, { n: result.published }));
      else if (result.failed.length === 0) toast.info(c.publishNothing);
      // Same reason as every write on this surface: the router cache would
      // otherwise replay the list with the badges it had before.
      router.refresh();
      if (result.failed.length > 0) setReport({ target, failed: result.failed });
      else onDone();
    } catch {
      toast.error(c.publishRequestFailed);
    } finally {
      setPending(false);
    }
  }

  const title = target?.categoryName
    ? formatCopy(c.publishTitleCategory, { name: target.categoryName })
    : formatCopy(c.publishTitle, { n: target?.count ?? 0 });

  return (
    <Dialog open={target !== null} onOpenChange={(next) => (next ? null : failed ? onDone() : onClose())}>
      <DialogContent closeLabel={copy.admin.common.close} className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{failed ? formatCopy(c.publishFailedTitle, { n: failed.length }) : title}</DialogTitle>
          <DialogDescription>{failed ? c.publishFailedHint : c.publishBody}</DialogDescription>
        </DialogHeader>

        {failed ? (
          <ul className="qpub__failed">
            {failed.map((item) => (
              <li key={item.versionId} className="qpub__fail">
                <CircleAlert className="size-4 flex-none" aria-hidden="true" />
                <span className="qpub__reason">{item.message}</span>
                <Link href={`/admin/questions/${item.bankEntryId}`} className="chip chip--accent">
                  {c.publishFix}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        <DialogFooter>
          {failed ? (
            <Button type="button" variant="ghost" onClick={onDone}>
              {copy.admin.common.close}
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
                {copy.admin.common.cancel}
              </Button>
              <Button type="button" onClick={() => void confirm()} disabled={!target || pending}>
                <Send className="size-4" aria-hidden="true" />
                {pending ? c.publishing : formatCopy(c.publishConfirm, { n: target?.count ?? 0 })}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * «انشر كل مسودات التصنيف ده (N)» — the band above a filtered category's list,
 * there only while that category has drafts. «راجعهم الأول» narrows the list
 * to them, variants side by side, which is how the owner reads before pressing.
 */
export function CategoryDraftsBand({
  categoryId,
  categoryName,
  draftCount,
  reviewHref,
  reviewing,
}: {
  categoryId: string;
  categoryName: string;
  draftCount: number;
  reviewHref: string;
  reviewing: boolean;
}) {
  const [target, setTarget] = useState<PublishDraftsTarget | null>(null);
  return (
    <div className="qbank-drafts" role="region" aria-label={formatCopy(c.publishCategory, { n: draftCount })}>
      <p className="qbank-drafts__lead">{formatCopy(c.publishCategoryLead, { n: draftCount })}</p>
      <div className="qbank-drafts__actions">
        {reviewing ? null : (
          <Link href={reviewHref} className="chip chip--accent">
            {c.publishCategoryReview}
          </Link>
        )}
        <button
          type="button"
          className="qbank-drafts__go"
          onClick={() => setTarget({ scope: { categoryId }, count: draftCount, categoryName })}
        >
          <Send className="size-4" aria-hidden="true" />
          {formatCopy(c.publishCategory, { n: draftCount })}
        </button>
      </div>
      <PublishDraftsDialog target={target} onClose={() => setTarget(null)} onDone={() => setTarget(null)} />
    </div>
  );
}
