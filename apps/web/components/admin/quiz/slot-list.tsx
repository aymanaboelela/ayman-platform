'use client';

import { copy, formatCopy, type QuestionType } from '@ayman/contracts';
import { Badge, cn } from '@ayman/ui';
import { apiPatch } from '@/lib/api';
import { SortableList, type SortableHandleProps } from '../sortable-list';
import type { ReorderStatus } from '../use-debounced-reorder';

export interface QuizSlotRow {
  id: string;
  position: number;
  maxMark: number;
  kind: 'question' | 'pool';
  type: QuestionType | null;
  stemHtml: string | null;
  poolName: string | null;
  poolPickCount: number | null;
}

export interface SlotListProps {
  quizId: string;
  slots: QuizSlotRow[];
  onRemove: (slotId: string) => void;
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

function SlotRow({ slot, handle, onRemove }: { slot: QuizSlotRow; handle: SortableHandleProps; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-sm border border-line-subtle bg-surface-2 p-3">
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

      <span className="min-w-0 flex-1 truncate text-fg">
        {slot.kind === 'pool'
          ? formatCopy(copy.quizAdmin.poolPickCount, { n: slot.poolPickCount ?? 0 }) + ` — ${slot.poolName ?? ''}`
          : stripHtml(slot.stemHtml ?? '')}
      </span>

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
  );
}

/**
 * One debounced PATCH of the FULL ordered id array per drag session — never
 * one write per position. Keyed by the caller on the slot id SET (see the
 * quiz builder page), so an add/remove (which changes membership, not just
 * order) always mounts a fresh instance rather than replaying a stale order
 * against a list `SortableList`'s own debounce hook never re-synced to.
 */
export function SlotList({ quizId, slots, onRemove }: SlotListProps) {
  return (
    <SortableList
      items={slots}
      onReorder={async (orderedIds) => {
        try {
          await apiPatch(`/api/admin/quizzes/${quizId}/slots/order`, { slotIds: orderedIds });
          return { ok: true };
        } catch {
          return { ok: false, message: copy.admin.common.saveFailed };
        }
      }}
      renderItem={(slot, handle) => <SlotRow slot={slot} handle={handle} onRemove={() => onRemove(slot.id)} />}
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
