'use client';

import { useId, useState } from 'react';
import { copy, formatCopy, type QuestionType, type QuizPaper } from '@ayman/contracts';
import { Badge, cn } from '@ayman/ui';
import { apiPatch } from '@/lib/api';
import { SortableList, type SortableHandleProps } from '../sortable-list';
import type { ReorderStatus } from '../use-debounced-reorder';
import { SlotQuestionPanel } from './slot-question-panel';

export interface QuizSlotRow {
  id: string;
  paper: QuizPaper;
  position: number;
  maxMark: number;
  kind: 'question' | 'pool';
  /** The bank entry this slot points at. Null for a pool. */
  bankEntryId: string | null;
  type: QuestionType | null;
  stemHtml: string | null;
  poolName: string | null;
  poolPickCount: number | null;
}

export interface SlotListProps {
  quizId: string;
  slots: QuizSlotRow[];
  /**
   * Which paper these slots belong to. Sent with the reorder so the server
   * renumbers ONE sequence: the two papers number independently, and a request
   * that did not say which one it meant would be checked against the wrong set
   * and rejected as incomplete.
   */
  paper: QuizPaper;
  onRemove: (slotId: string) => void;
  /** Threaded from the builder page for the panel's category select — see
   *  `PaperTabs`'s own note on why it is not fetched inside the panel. */
  categories: { id: string; name: string }[];
}

const STATUS_LABEL: Record<ReorderStatus, string> = {
  idle: '',
  pending: copy.admin.common.saving,
  saving: copy.admin.common.saving,
  saved: copy.admin.common.saved,
  error: copy.admin.common.saveFailed,
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim().slice(0, 80);
}

/**
 * One question in the exam, and — for a question slot — the whole question
 * underneath it.
 *
 * ## Why the label is the button and the row is not
 *
 * The row already carries two other controls: a drag handle and a delete X.
 * Making the whole row the toggle would nest them inside a button (invalid,
 * and the browser resolves it by dropping one) and would turn every failed
 * drag into an accidental expand. So the STEM is the button — the thing an
 * instructor points at when they mean "that question" — and the handle and
 * the X keep their own hit areas beside it.
 *
 * A pool slot does not expand: it points at no single question, so there is
 * nothing to open. Its label stays plain text.
 */
function SlotRow({
  slot,
  handle,
  onRemove,
  quizId,
  categories,
}: {
  slot: QuizSlotRow;
  handle: SortableHandleProps;
  onRemove: () => void;
  quizId: string;
  categories: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  /**
   * Sticky: once a row has been opened, its panel stays MOUNTED and is merely
   * hidden when collapsed.
   *
   * Unmounting on collapse threw away the fetched question, so reopening the
   * same row issued the request again — and threw away a half-typed edit with
   * it. Mounting on first open is what keeps the initial render request-free;
   * keeping it mounted afterwards is what makes reopening free too.
   */
  const [hasOpened, setHasOpened] = useState(false);
  const panelId = useId();
  const canOpen = slot.kind === 'question' && slot.bankEntryId !== null;

  const label =
    slot.kind === 'pool'
      ? formatCopy(copy.quizAdmin.poolPickCount, { n: slot.poolPickCount ?? 0 }) + ` — ${slot.poolName ?? ''}`
      : stripHtml(slot.stemHtml ?? '');

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-3 border p-3 transition-colors duration-[160ms] ease-out',
          // An open row is the header of the block below it, so it carries the
          // same accent edge and loses its bottom rounding to sit against it.
          // A closed row is unchanged — the list must still read as a list.
          open
            ? 'rounded-t-sm border-line border-s-2 border-s-accent bg-surface-3'
            : 'rounded-sm border-line-subtle bg-surface-2',
        )}
      >
        <button
          type="button"
          {...handle.attributes}
          {...handle.listeners}
          aria-label={copy.admin.reorder.handle}
          className="cursor-grab rounded-xs px-2 py-1 text-fg-muted focus-visible:outline-2"
        >
          <span aria-hidden="true" className="block h-px w-4 bg-current" />
          <span aria-hidden="true" className="mt-1 block h-px w-4 bg-current" />
        </button>

        <span className="mono w-10 shrink-0 text-[length:var(--fs-mono-label)] text-fg-muted">
          {String(slot.position + 1).padStart(2, '0')}
        </span>

        {canOpen ? (
          <button
            type="button"
            onClick={() => {
              setHasOpened(true);
              setOpen((wasOpen) => !wasOpen);
            }}
            aria-expanded={open}
            aria-controls={panelId}
            className={cn(
              'min-w-0 flex-1 truncate rounded-xs px-1 py-0.5 text-start text-fg',
              'hover:text-accent-text focus-visible:outline-2',
            )}
            title={open ? copy.quizAdmin.slotCollapse : copy.quizAdmin.slotExpand}
          >
            {label}
          </button>
        ) : (
          <span className="min-w-0 flex-1 truncate text-fg">{label}</span>
        )}

        {slot.type ? <Badge tone="neutral">{copy.quizAdmin.types[slot.type]}</Badge> : null}
        <span className="mono shrink-0 text-[length:var(--fs-mono-label)] text-fg-muted">{slot.maxMark}</span>

        <button
          type="button"
          onClick={onRemove}
          aria-label={copy.quizAdmin.slotRemove}
          className="rounded-xs p-1 text-fg-muted hover:bg-surface-3 hover:text-err"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
            <path d="M3 3l10 10M13 3 3 13" />
          </svg>
        </button>
      </div>

      {/* Mounted on FIRST open, never before — that is what makes the fetch
          lazy, and why a fifteen-question exam still renders in one request.
          `hidden` rather than unmounted afterwards: see `hasOpened`. */}
      {hasOpened && canOpen ? (
        <div id={panelId} hidden={!open}>
          <SlotQuestionPanel
            quizId={quizId}
            slotId={slot.id}
            bankEntryId={slot.bankEntryId!}
            maxMark={slot.maxMark}
            categories={categories}
            onClose={() => setOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * One debounced PATCH of the FULL ordered id array per drag session — never
 * one write per position. Keyed by the caller on the slot id SET (see the
 * quiz builder page), so an add/remove (which changes membership, not just
 * order) always mounts a fresh instance rather than replaying a stale order
 * against a list `SortableList`'s own debounce hook never re-synced to.
 */
export function SlotList({ quizId, slots, paper, onRemove, categories }: SlotListProps) {
  return (
    <SortableList
      items={slots}
      onReorder={async (orderedIds) => {
        try {
          await apiPatch(`/api/admin/quizzes/${quizId}/slots/order`, { slotIds: orderedIds, paper });
          return { ok: true };
        } catch {
          return { ok: false, message: copy.admin.common.saveFailed };
        }
      }}
      renderItem={(slot, handle) => (
        <SlotRow
          slot={slot}
          handle={handle}
          onRemove={() => onRemove(slot.id)}
          quizId={quizId}
          categories={categories}
        />
      )}
      announcements={{
        pickedUp: (position) => `${copy.admin.reorder.pickedUp} ${position}`,
        movedOver: (position) => `${copy.admin.reorder.movedOver} ${position}`,
        dropped: (position) => `${copy.admin.reorder.dropped} ${position}`,
        cancelled: copy.admin.reorder.cancelled,
      }}
      statusSlot={(status) => (
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{copy.quizAdmin.reorderHint}</p>
          <p
            aria-live="polite"
            className={cn('mono text-[length:var(--fs-mono-label)]', status === 'error' ? 'text-err' : 'text-fg-muted')}
          >
            {STATUS_LABEL[status]}
          </p>
        </div>
      )}
    />
  );
}
