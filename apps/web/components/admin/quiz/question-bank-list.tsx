'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type CSSProperties } from 'react';
import { Check, Copy, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Checkbox } from '@ayman/ui/components/checkbox';
import { cn } from '@ayman/ui/lib/cn';
import { SafeHtml } from '@/components/content/safe-html';
import { apiPost } from '@/lib/api';
import { optionLetter } from '@/components/quiz/option-letter';
import { TYPE_HUE, categoryHue, isRightOption, stripHtml, type BankRow } from './bank-rows';
import { DeleteQuestionsDialog } from './delete-questions-dialog';
import './question-bank.css';

const c = copy.quizAdmin.bank;

const DuplicatedSchema = z.object({ bankEntryId: z.string() });
const OkSchema = z.object({ ok: z.boolean() });

/**
 * The bank's rows, and everything you can do to them.
 *
 * A client component for exactly one reason — the ticks. Everything a row
 * shows was fetched, parsed and sanitized by the page; this only holds which
 * rows are ticked and which dialog is open.
 *
 * Every row ends in its own buttons (تعديل · نسخة · امسح), because a list
 * whose only action is "open it" makes deleting forty questions forty round
 * trips through the edit page — and because that is how the rest of the admin
 * reads.
 */
export function QuestionBankList({ rows, archived }: { rows: BankRow[]; archived: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [deleting, setDeleting] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // A tick on a row the page no longer shows (after a delete, a filter, a
  // pager click) is not a tick the admin can see — so it does not count.
  const visibleIds = rows.map((row) => row.id);
  const ticked = visibleIds.filter((id) => selected.has(id));
  const allTicked = ticked.length > 0 && ticked.length === visibleIds.length;

  function toggle(id: string, on: boolean) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(on: boolean) {
    setSelected(on ? new Set(visibleIds) : new Set());
  }

  async function duplicate(id: string) {
    setBusy(id);
    try {
      const result = await apiPost(`/api/admin/questions/${id}/duplicate`, DuplicatedSchema, {});
      toast.success(c.duplicated);
      router.push(`/admin/questions/${result.bankEntryId}`);
    } catch {
      toast.error(copy.admin.common.saveFailed);
      setBusy(null);
    }
  }

  async function restore(id: string) {
    setBusy(id);
    try {
      await apiPost(`/api/admin/questions/${id}/restore`, OkSchema, {});
      toast.success(c.restored);
      // Same reason as every write on this surface: the router cache would
      // otherwise replay the list with the question still under «اللي اتشالت».
      router.refresh();
    } catch {
      toast.error(copy.admin.common.saveFailed);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {archived ? null : (
        <div className={cn('qbank-bulk', ticked.length > 0 && 'qbank-bulk--active')}>
          <label className="qbank-bulk__all">
            <Checkbox
              checked={allTicked ? true : ticked.length > 0 ? 'indeterminate' : false}
              onCheckedChange={(next) => toggleAll(next === true)}
              aria-label={c.selectAll}
            />
            {c.selectAll}
          </label>
          {ticked.length > 0 ? (
            <>
              <span className="qbank-bulk__count" aria-live="polite">
                {formatCopy(c.selectedCount, { n: ticked.length })}
              </span>
              <span className="qbank-bulk__actions">
                <button type="button" className="chip chip--quiet" onClick={() => toggleAll(false)}>
                  {c.clearSelection}
                </button>
                <button type="button" className="chip qbank-danger" onClick={() => setDeleting(ticked)}>
                  <Trash2 className="size-4" aria-hidden="true" />
                  {c.deleteSelected}
                </button>
              </span>
            </>
          ) : null}
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {rows.map((row) => {
          const latest = row.versions[0];
          if (!latest) return null;
          const isSelected = selected.has(row.id);
          const stemText = stripHtml(latest.stemHtml);
          return (
            <li key={row.id}>
              <article
                className={cn('qrow', isSelected && 'qrow--selected')}
                style={{ '--type-h': TYPE_HUE[latest.type] } as CSSProperties}
                aria-label={stemText.slice(0, 80) || copy.quizAdmin.newQuestion}
              >
                <div className="qrow__top">
                  {archived ? null : (
                    <label className="qrow__pick">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(next) => toggle(row.id, next === true)}
                        aria-label={c.selectRow}
                      />
                    </label>
                  )}
                  <span className="qtag qtag--type">{copy.quizAdmin.types[latest.type]}</span>
                  <Link
                    href={`/admin/questions?category=${encodeURIComponent(row.category.id)}`}
                    className="qtag qtag--category"
                    style={{ '--cat-h': categoryHue(row.category.id) } as CSSProperties}
                  >
                    <span className="qbank-cat__dot" aria-hidden="true" />
                    {row.category.name}
                  </Link>
                  {latest.status === 'ready' ? (
                    <span className="qtag qtag--ready">
                      <Check className="size-3.5" aria-hidden="true" />
                      {formatCopy(copy.quizAdmin.versionBadge, { n: latest.version })}
                    </span>
                  ) : (
                    <span className="qtag qtag--draft">{copy.quizAdmin.draftBadge}</span>
                  )}
                  {row.usedInQuizzes > 0 ? (
                    <span className="qtag qtag--used">{formatCopy(c.usedIn, { n: row.usedInQuizzes })}</span>
                  ) : null}
                  <span className="qtag">{formatCopy(c.marks, { n: Number(latest.defaultMark) })}</span>
                </div>

                {/* Not wrapped in a link: a stem may carry its own `<a>` (the
                    sanitizer allows them), and an anchor inside an anchor is
                    invalid markup React will not hydrate. «تعديل» is right
                    below. */}
                <SafeHtml html={latest.stemHtml} className="qrow__stem" />

                <QuestionPreview type={latest.type} options={latest.options} />

                <div className="qrow__foot">
                  <div className="row-actions">
                    {archived ? (
                      <button
                        type="button"
                        className="chip chip--accent"
                        onClick={() => void restore(row.id)}
                        disabled={busy === row.id}
                      >
                        <RotateCcw className="size-4" aria-hidden="true" />
                        {c.restore}
                      </button>
                    ) : (
                      <>
                        <Link href={`/admin/questions/${row.id}`} className="chip chip--accent">
                          <Pencil className="size-4" aria-hidden="true" />
                          {c.edit}
                        </Link>
                        <button
                          type="button"
                          className="chip qbank-plain"
                          onClick={() => void duplicate(row.id)}
                          disabled={busy === row.id}
                        >
                          <Copy className="size-4" aria-hidden="true" />
                          {c.duplicate}
                        </button>
                        <span className="row-actions__sep" aria-hidden="true" />
                        <button type="button" className="chip chip--danger" onClick={() => setDeleting([row.id])}>
                          <Trash2 className="size-4" aria-hidden="true" />
                          {c.delete}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ul>

      <DeleteQuestionsDialog
        ids={deleting}
        onClose={() => setDeleting(null)}
        onDone={() => {
          setDeleting(null);
          setSelected(new Set());
          router.refresh();
        }}
      />
    </>
  );
}

/**
 * The options as the student gets them — the same letters — with the right
 * one(s) marked in `--ok`, a check AND the word «صح», so the key is checked by
 * reading, not by opening forty questions one at a time.
 */
export function QuestionPreview({ type, options }: { type: BankRow['versions'][number]['type']; options: BankRow['versions'][number]['options'] }) {
  if (type === 'essay') return <p className="qrow__note">{c.essayNote}</p>;

  if (type === 'short_answer') {
    return (
      <p className="qrow__note">
        {c.shortAnswerNote}{' '}
        {options.map((option, index) => (
          <span key={option.id}>
            {index > 0 ? copy.quiz.answerListSeparator : null}
            <span className="qopt__pattern">{option.answerPattern ?? ''}</span>
          </span>
        ))}
      </p>
    );
  }

  if (type === 'ordering') {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="qrow__note">{c.orderingKey}</p>
        <ol className="qrow__opts">
          {options.map((option, index) => (
            <li key={option.id} className="qopt">
              <span className="qopt__letter">{index + 1}</span>
              <span className="qopt__body">{stripHtml(option.bodyHtml)}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <ul className="qrow__opts">
      {options.map((option, index) => {
        const right = isRightOption(option);
        return (
          <li key={option.id} className={cn('qopt', right && 'qopt--right')}>
            <span className="qopt__letter">{optionLetter(index)}</span>
            <span className="qopt__body">{stripHtml(option.bodyHtml)}</span>
            {right ? (
              <span className="qopt__right">
                <Check className="size-3.5" aria-hidden="true" />
                {c.right}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
