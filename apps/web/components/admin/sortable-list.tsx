'use client';

import { useId, type ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@ayman/ui';
import { type CommitResult, type ReorderStatus, useDebouncedReorder } from './use-debounced-reorder';

/** What a consumer spreads onto its own drag-handle element. */
export type SortableHandleProps = {
  attributes: ReturnType<typeof useSortable>['attributes'];
  listeners: ReturnType<typeof useSortable>['listeners'];
};

export interface SortableListAnnouncements {
  pickedUp: (position: number) => string;
  movedOver: (position: number) => string;
  dropped: (position: number) => string;
  cancelled: string;
}

export interface SortableListProps<T extends { id: string }> {
  items: readonly T[];
  /**
   * Fired ONCE per settled drag session (debounced — several rapid drags
   * collapse into one call) with the FULL ordered id array, never a delta.
   * May return the write's outcome so the list can revert to the last good
   * order on failure; returning void/undefined trusts the optimistic order
   * as final.
   */
  onReorder: (orderedIds: string[]) => Promise<CommitResult> | Promise<void> | void;
  renderItem: (item: T, handleProps: SortableHandleProps) => ReactNode;
  /** Debounce before `onReorder` fires. Default 600. */
  delayMs?: number;
  disabled?: boolean;
  /** Arabic screen-reader announcements per drag lifecycle event — required, never a hardcoded default. */
  announcements: SortableListAnnouncements;
  /** Optional slot rendered above the list, given the current save status. */
  statusSlot?: (status: ReorderStatus) => ReactNode;
}

function SortableRow<T extends { id: string }>({
  item,
  renderItem,
}: {
  item: T;
  renderItem: SortableListProps<T>['renderItem'];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  return (
    <li
      ref={setNodeRef}
      // transform + opacity only — animating layout would force paint on
      // every frame of the drag.
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && 'relative z-10 opacity-80')}
    >
      {renderItem(item, { attributes, listeners })}
    </li>
  );
}

/**
 * The generic drag-reorder shell — @dnd-kit/core + @dnd-kit/sortable, one
 * debounced write of the whole ordered id array. Deliberately NOT
 * lesson-specific: `SortableLessonList` is its first consumer, but Plan 5
 * (quiz slots) and Plan 6 (navigation items, home blocks) bind the same
 * component to their own reorder endpoints rather than each hand-rolling
 * DndContext/SortableContext again.
 */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
  delayMs = 600,
  disabled = false,
  announcements,
  statusSlot,
}: SortableListProps<T>) {
  const byId = new Map(items.map((item) => [item.id, item]));

  const { items: orderedIds, status, move } = useDebouncedReorder({
    initial: items.map((item) => item.id),
    delayMs,
    onCommit: async (orderedIdsArg) => {
      const result = await onReorder(orderedIdsArg);
      // A consumer that doesn't care about revert-on-failure returns void —
      // treat that as "always succeeded" rather than forcing every caller to
      // fabricate an { ok: true }.
      return result && typeof result === 'object' ? result : { ok: true };
    },
  });

  const sensors = useSensors(
    // 8px of travel before a drag starts, so clicking the handle still works.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // Keyboard reordering is not optional — mouse-only is a WCAG 2.1.1 failure.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const dndAnnouncements: Announcements = {
    onDragStart: ({ active }) => announcements.pickedUp(orderedIds.indexOf(String(active.id)) + 1),
    onDragOver: ({ over }) =>
      over ? announcements.movedOver(orderedIds.indexOf(String(over.id)) + 1) : undefined,
    onDragEnd: ({ over }) =>
      over ? announcements.dropped(orderedIds.indexOf(String(over.id)) + 1) : undefined,
    onDragCancel: () => announcements.cancelled,
  };

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    move(orderedIds.indexOf(String(active.id)), orderedIds.indexOf(String(over.id)));
  }

  return (
    <div>
      {statusSlot ? statusSlot(status) : null}
      <DndContext
        // Explicit id: dnd-kit generates one otherwise, and a server/client
        // mismatch produces a hydration warning on every admin page load.
        id={useId()}
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        accessibility={{ announcements: dndAnnouncements }}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={orderedIds} strategy={verticalListSortingStrategy} disabled={disabled}>
          <ul className="space-y-2">
            {orderedIds.map((id) => {
              const item = byId.get(id);
              // key is the item's own id, never the array index — an index
              // key makes React reuse the wrong DOM node on every reorder.
              return item ? <SortableRow key={id} item={item} renderItem={renderItem} /> : null;
            })}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
