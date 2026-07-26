'use client';

import { useId, useState, type ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
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
import { copy, hasChoiceOptions, type QuestionType } from '@ayman/contracts';
import { Button, Checkbox, Input, Label, RadioGroup, RadioGroupItem, cn } from '@ayman/ui';

/**
 * A superset of `ChoiceOptionInput | PatternOptionInput` PLUS a client-only
 * `id`, always present here (server-generated for an existing row, a fresh
 * `crypto.randomUUID()` for a brand-new one). Nothing server-side ever reads
 * this `id` back off the write payload — `QuestionBankService.optionRows()`
 * builds every persisted row field-by-field and Prisma mints the real id.
 *
 * This does NOT reuse Plan 3's `SortableList`: that component's debounced
 * reorder hook snapshots its `items` prop into internal state exactly ONCE,
 * on mount, which is correct for a fixed membership that only reorders
 * (lessons, quiz slots between page loads) but silently strands a row the
 * moment membership itself changes (add/remove an option, or switch a
 * question's type) — the newly-added id is simply absent from the hook's own
 * stale order and never renders. Options here are added, removed and
 * type-switched constantly, so this renders directly off the live `options`
 * prop with plain `@dnd-kit` primitives instead — the same libraries
 * `SortableList` itself is built on, with no membership snapshot to go stale.
 */
export interface OptionRowValue {
  id: string;
  bodyHtml?: string;
  answerPattern?: string;
  fraction: number;
  feedbackHtml?: string;
}

export interface OptionRowsProps {
  type: QuestionType;
  options: OptionRowValue[];
  onChange: (next: OptionRowValue[]) => void;
  /** The single `options`-path error, if the array as a whole is invalid. */
  error?: string;
}

function relabelWeights(options: OptionRowValue[], correctIndex: number): OptionRowValue[] {
  return options.map((option, index) => ({ ...option, fraction: index === correctIndex ? 1 : 0 }));
}

/** mcq_multi: ticked rows re-split 1/n so the sum-to-one rule holds by construction. */
function redistribute(options: OptionRowValue[], tickedIds: ReadonlySet<string>): OptionRowValue[] {
  const share = tickedIds.size > 0 ? 1 / tickedIds.size : 0;
  return options.map((option) => ({ ...option, fraction: tickedIds.has(option.id) ? share : 0 }));
}

/**
 * Inline correctness by construction (spec: "typing 1 into four boxes is how
 * you get four correct answers"). Raw weight editing is available per row
 * behind a "وزن الاختيار" disclosure for the rare negative-marking case —
 * never the primary control for mcq_single/true_false, where exactly one
 * option may ever be full credit.
 */
export function OptionRows({ type, options, onChange, error }: OptionRowsProps) {
  const [showWeights, setShowWeights] = useState(false);
  const isSingleCorrect = type === 'mcq_single' || type === 'true_false';
  const isMulti = type === 'mcq_multi';
  const isPattern = type === 'short_answer';

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function patch(id: string, next: Partial<OptionRowValue>) {
    onChange(options.map((option) => (option.id === id ? { ...option, ...next } : option)));
  }

  function remove(id: string) {
    onChange(options.filter((option) => option.id !== id));
  }

  function add() {
    const fresh: OptionRowValue = isPattern
      ? { id: crypto.randomUUID(), answerPattern: '', fraction: 1 }
      : { id: crypto.randomUUID(), bodyHtml: '', fraction: 0 };
    onChange([...options, fresh]);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = options.findIndex((option) => option.id === active.id);
    const to = options.findIndex((option) => option.id === over.id);
    if (from === -1 || to === -1) return;
    onChange(arrayMove(options, from, to));
  }

  const correctId = options.find((option) => option.fraction > 1 - 1e-6)?.id;
  const tickedIds = new Set(options.filter((option) => option.fraction > 0).map((option) => option.id));

  const list = (
    <DndContext
      id={useId()}
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={options.map((option) => option.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-2">
          {options.map((option) => (
            <SortableRow
              key={option.id}
              option={option}
              type={type}
              showWeight={showWeights && !isPattern}
              onPatch={(next) => patch(option.id, next)}
              onRemove={() => remove(option.id)}
              correctnessControl={
                isSingleCorrect ? (
                  <RadioGroupItem value={option.id} aria-label={copy.quizAdmin.markCorrect} />
                ) : isMulti ? (
                  <Checkbox
                    checked={tickedIds.has(option.id)}
                    aria-label={copy.quizAdmin.markCorrect}
                    onCheckedChange={(checked) => {
                      const next = new Set(tickedIds);
                      if (checked) next.add(option.id);
                      else next.delete(option.id);
                      onChange(redistribute(options, next));
                    }}
                  />
                ) : null
              }
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Label>{copy.quizAdmin.options}</Label>
        {!isSingleCorrect && !isPattern ? (
          <button
            type="button"
            onClick={() => setShowWeights((value) => !value)}
            className="text-[length:var(--fs-text-xs)] text-fg-muted underline decoration-dotted hover:text-fg"
          >
            {copy.quizAdmin.showWeights}
          </button>
        ) : null}
      </div>

      {isSingleCorrect ? (
        <RadioGroup
          value={correctId}
          onValueChange={(value) => onChange(relabelWeights(options, options.findIndex((o) => o.id === value)))}
        >
          {list}
        </RadioGroup>
      ) : (
        list
      )}

      {error ? (
        <p role="alert" className="text-[length:var(--fs-text-xs)] text-err">
          {error}
        </p>
      ) : null}

      {hasChoiceOptions(type) || isPattern ? (
        <Button type="button" variant="secondary" size="sm" onClick={add} className="self-start">
          {isPattern ? copy.quizAdmin.addPattern : copy.quizAdmin.addOption}
        </Button>
      ) : null}
    </div>
  );
}

function SortableRow({
  option,
  type,
  showWeight,
  onPatch,
  onRemove,
  correctnessControl,
}: {
  option: OptionRowValue;
  type: QuestionType;
  showWeight: boolean;
  onPatch: (next: Partial<OptionRowValue>) => void;
  onRemove: () => void;
  correctnessControl: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: option.id,
  });
  const isPattern = type === 'short_answer';

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && 'relative z-10 opacity-80')}
    >
      <div className="flex items-start gap-2 rounded-sm border border-line-subtle bg-surface-2 p-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={copy.admin.reorder.handle}
          className="mt-2 flex size-6 shrink-0 cursor-grab items-center justify-center text-fg-muted"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5" fill="currentColor">
            <circle cx="5" cy="4" r="1.2" />
            <circle cx="11" cy="4" r="1.2" />
            <circle cx="5" cy="8" r="1.2" />
            <circle cx="11" cy="8" r="1.2" />
            <circle cx="5" cy="12" r="1.2" />
            <circle cx="11" cy="12" r="1.2" />
          </svg>
        </button>

        <div className="mt-2">{correctnessControl}</div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {isPattern ? (
            <Input
              value={option.answerPattern ?? ''}
              onChange={(event) => onPatch({ answerPattern: event.target.value })}
              placeholder={copy.quizAdmin.answerPattern}
              aria-label={copy.quizAdmin.answerPattern}
              dir="rtl"
            />
          ) : (
            <Input
              value={option.bodyHtml ?? ''}
              onChange={(event) => onPatch({ bodyHtml: event.target.value })}
              placeholder={copy.quizAdmin.options}
              aria-label={copy.quizAdmin.options}
            />
          )}

          {showWeight ? (
            <label className="flex items-center gap-2 text-[length:var(--fs-text-xs)] text-fg-muted">
              {copy.quizAdmin.fraction}
              <Input
                type="number"
                step="0.01"
                min={-1}
                max={1}
                value={option.fraction}
                onChange={(event) => onPatch({ fraction: Number(event.target.value) })}
                className={cn('w-24')}
              />
            </label>
          ) : null}
        </div>

        <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label={copy.quizAdmin.removeOption}>
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
          >
            <path d="M3 3l10 10M13 3 3 13" />
          </svg>
        </Button>
      </div>
    </li>
  );
}
