'use client';

import { useId, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';
import { SafeHtml } from '@/components/content/safe-html';

export interface OrderingItem {
  id: string;
  bodyHtml: string;
}

export interface OrderingListProps {
  /** The SERVED order — the shuffled sequence the API snapshotted. */
  options: OrderingItem[];
  /** The student's order so far, as option ids. Empty means «untouched». */
  value: string[];
  onChange: (optionIds: string[]) => void;
}

/**
 * Reconciles the student's stored order against the options actually served.
 *
 * Never trust the stored array to still describe this question: a version can
 * be republished between two sittings, and a resumed attempt reads a response
 * written before that. Ids no longer served are dropped and served ids the
 * response never mentioned are appended, so the list a student comes back to
 * is always exactly the options they were given — in their order as far as it
 * still makes sense.
 */
function resolveOrder(options: readonly OrderingItem[], value: readonly string[]): OrderingItem[] {
  const byId = new Map(options.map((option) => [option.id, option]));
  const ordered: OrderingItem[] = [];
  const used = new Set<string>();
  for (const id of value) {
    const option = byId.get(id);
    if (option && !used.has(id)) {
      ordered.push(option);
      used.add(id);
    }
  }
  for (const option of options) {
    if (!used.has(option.id)) ordered.push(option);
  }
  return ordered;
}

/** The announcement text, and the review screen's list label — plain text, so
 *  markup in an option body never reaches a live region as tags. */
function plainText(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

/**
 * The student's side of an ordering question.
 *
 * Two ways to move a row, both of which have to work on their own:
 *
 * - Drag, which is what «رتّب» means to a phone user. The touch sensor waits
 *   200ms before claiming the gesture, so an ordinary scroll through a long
 *   paper still scrolls — a reorder control that eats vertical swipes on a
 *   timed exam is worse than no drag at all.
 * - Up/down buttons, which are the ones that work with a screen reader, with a
 *   keyboard, and for a student whose hand is not steady on a small screen.
 *   They are not a fallback bolted on afterwards: they are the primary control
 *   for everyone the drag does not serve, so they are always visible rather
 *   than revealed on focus.
 *
 * Every move announces the item and its new position through a live region,
 * because the visual reflow is the only other feedback and it is invisible to
 * exactly the students using the buttons.
 */
export function OrderingList({ options, value, onChange }: OrderingListProps) {
  const [announcement, setAnnouncement] = useState('');
  const ordered = resolveOrder(options, value);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function commit(next: OrderingItem[], moved?: OrderingItem) {
    onChange(next.map((option) => option.id));
    if (moved) {
      const position = next.findIndex((option) => option.id === moved.id) + 1;
      setAnnouncement(
        formatCopy(copy.quiz.movedTo, {
          item: plainText(moved.bodyHtml),
          position,
          total: next.length,
        }),
      );
    }
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= ordered.length) return;
    commit(arrayMove(ordered, index, target), ordered[index]);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ordered.findIndex((option) => option.id === active.id);
    const to = ordered.findIndex((option) => option.id === over.id);
    if (from === -1 || to === -1) return;
    commit(arrayMove(ordered, from, to), ordered[from]);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{copy.quiz.orderInstruction}</p>

      <DndContext
        id={useId()}
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={ordered.map((option) => option.id)}
          strategy={verticalListSortingStrategy}
        >
          <ol className="flex flex-col gap-2">
            {ordered.map((option, index) => (
              <SortableItem
                key={option.id}
                option={option}
                position={index + 1}
                isFirst={index === 0}
                isLast={index === ordered.length - 1}
                onMoveUp={() => move(index, -1)}
                onMoveDown={() => move(index, 1)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{copy.quiz.orderAllOrNothing}</p>
    </div>
  );
}

function SortableItem({
  option,
  position,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
}: {
  option: OrderingItem;
  position: number;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: option.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && 'relative z-10 opacity-80')}
    >
      <div className="flex items-center gap-2 rounded-sm border border-line-subtle bg-surface-2 p-2">
        {/* The drag affordance and the position indicator are the same element:
            a student who cannot drag still reads the number, and one who can
            has something obvious to grab. `touch-none` is what stops the
            browser from claiming the gesture as a scroll before dnd-kit's
            delay has elapsed. */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={copy.quiz.orderInstruction}
          className="mono flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm bg-surface-3 text-[length:var(--fs-mono-label)] tabular-nums text-fg-muted"
        >
          {position}
        </button>

        <div className="min-w-0 flex-1">
          <SafeHtml html={option.bodyHtml} />
        </div>

        <div className="flex shrink-0 flex-col">
          <MoveButton label={copy.quiz.moveUp} disabled={isFirst} onClick={onMoveUp} up />
          <MoveButton label={copy.quiz.moveDown} disabled={isLast} onClick={onMoveDown} />
        </div>
      </div>
    </li>
  );
}

function MoveButton({
  label,
  disabled,
  onClick,
  up = false,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  up?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex size-8 items-center justify-center rounded-sm text-fg-muted hover:text-fg disabled:pointer-events-none disabled:opacity-30"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className={cn('size-4', !up && 'rotate-180')}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 12.5V3.5M4 7.5 8 3.5l4 4" />
      </svg>
    </button>
  );
}
