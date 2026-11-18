'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { dailyEssayCopy } from '@ayman/contracts/copy/daily-essay';
import {
  DEFAULT_ESSAY_IMAGES,
  DEFAULT_ESSAY_MARKS,
  MAX_ESSAY_BATCH,
  MAX_ESSAY_IMAGES,
  MAX_ESSAY_MARKS,
  layEssayDays,
} from '@ayman/contracts/daily-essay';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ayman/ui/components/dialog';
import { Input } from '@ayman/ui/components/input';
import { Select } from '@ayman/ui/components/select';
import { Switch } from '@ayman/ui/components/switch';
import { Textarea } from '@ayman/ui/components/textarea';
import { createEssaysAction } from './actions';
import { CoursePicker, type CoursePick } from './course-picker';
import { essayDayLabel } from './essay-day';

const c = dailyEssayCopy.admin.form;

/** Friday, as `Date#getUTCDay` numbers it. */
const FRIDAY = 5;

interface Draft {
  /** Stable across add/remove, so React keeps each block's own textareas. */
  key: number;
  body: string;
  modelAnswer: string;
  maxMarks: string;
}

const blank = (key: number): Draft => ({ key, body: '', modelAnswer: '', maxMarks: String(DEFAULT_ESSAY_MARKS) });

/**
 * «إضافة أسئلة» — many questions in one sitting, each with its model answer,
 * laid on the calendar by themselves.
 *
 * ## No date per question
 *
 * «أضيف كتير وأعملهم جدولة»: he writes a week or a month of questions at once,
 * so the form asks for ONE date — where the run starts — and shows under every
 * question the day it will land on. `layEssayDays` is the same walk the API
 * does, so what is previewed is what is written.
 *
 * The start defaults to the day after the last question already scheduled, so
 * adding a second batch continues the run instead of piling onto its first day.
 */
export function EssayBatchDialog({
  courses,
  nextFreeDay,
  today,
}: {
  courses: readonly CoursePick[];
  nextFreeDay: string;
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [startDay, setStartDay] = useState(nextFreeDay);
  const [skipFriday, setSkipFriday] = useState(true);
  const [maxImages, setMaxImages] = useState(DEFAULT_ESSAY_IMAGES);
  const [items, setItems] = useState<Draft[]>([blank(0)]);
  const [nextKey, setNextKey] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const skipWeekdays = useMemo(() => (skipFriday ? [FRIDAY] : []), [skipFriday]);
  const days = useMemo(
    () => (/^\d{4}-\d{2}-\d{2}$/.test(startDay) ? layEssayDays(startDay, items.length, skipWeekdays) : []),
    [startDay, items.length, skipWeekdays],
  );

  function reset() {
    setItems([blank(nextKey)]);
    setNextKey(nextKey + 1);
    setError(null);
  }

  function patch(key: number, change: Partial<Draft>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)));
  }

  function add() {
    setItems((current) => [...current, blank(nextKey)]);
    setNextKey(nextKey + 1);
  }

  function save() {
    const ready = items.every((item) => item.body.trim().length >= 3 && item.modelAnswer.trim().length >= 1);
    if (!ready || days.length !== items.length) {
      setError(c.incomplete);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createEssaysAction({
        courseIds,
        startDay,
        skipWeekdays,
        maxImages,
        isPublished: true,
        items: items.map((item) => ({
          body: item.body.trim(),
          modelAnswer: item.modelAnswer.trim(),
          // An emptied field means the default, never zero.
          maxMarks: Number(item.maxMarks) >= 1 ? Math.round(Number(item.maxMarks)) : DEFAULT_ESSAY_MARKS,
        })),
      });
      if (!result.ok) {
        setError(c.failed);
        return;
      }
      toast.success(formatCopy(c.created, { n: result.created }));
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // The start follows the schedule: opened again after a save, it must
        // begin after what was just added.
        if (next) setStartDay(nextFreeDay);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <Plus className="size-4" aria-hidden="true" />
          {dailyEssayCopy.admin.schedule.add}
        </Button>
      </DialogTrigger>

      <DialogContent closeLabel={c.back}>
        <DialogHeader>
          <DialogTitle>{c.addTitle}</DialogTitle>
        </DialogHeader>

        <CoursePicker courses={courses} value={courseIds} onChange={setCourseIds} label={c.courses} hint={c.coursesHint} />

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-[length:var(--fs-text-sm)] text-fg">
            {c.startDay}
            <Input type="date" value={startDay} min={today} onChange={(event) => setStartDay(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-[length:var(--fs-text-sm)] text-fg">
            {c.maxImages}
            <Select value={String(maxImages)} onChange={(event) => setMaxImages(Number(event.target.value))}>
              {Array.from({ length: MAX_ESSAY_IMAGES }, (_, index) => index + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </label>
        </div>

        <label className="flex items-center gap-2.5 text-[length:var(--fs-text-sm)] text-fg">
          <Switch checked={skipFriday} onCheckedChange={setSkipFriday} />
          {c.skipFriday}
        </label>

        <ol className="flex flex-col gap-3">
          {items.map((item, index) => (
            <li key={item.key} className="rounded-xl border border-line bg-surface-2 p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[length:var(--fs-text-base)] font-semibold text-fg">
                  {formatCopy(c.questionN, { n: index + 1 })}
                </span>
                {days[index] ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-0.5 text-[length:var(--fs-text-xs)] font-medium text-accent-text">
                    <CalendarDays className="size-3.5" aria-hidden="true" />
                    {formatCopy(c.landsOn, { day: essayDayLabel(days[index]) })}
                  </span>
                ) : null}
                {items.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setItems((current) => current.filter((entry) => entry.key !== item.key))}
                    className="ms-auto inline-flex items-center gap-1 text-[length:var(--fs-text-xs)] text-fg-muted hover:text-[color:var(--err)]"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    {c.removeItem}
                  </button>
                ) : null}
              </div>

              <label className="mt-3 flex flex-col gap-1.5 text-[length:var(--fs-text-sm)] text-fg">
                {c.body}
                <Textarea
                  rows={3}
                  maxLength={4000}
                  dir="auto"
                  value={item.body}
                  onChange={(event) => patch(item.key, { body: event.target.value })}
                />
              </label>
              <label className="mt-3 flex flex-col gap-1.5 text-[length:var(--fs-text-sm)] text-fg">
                {c.modelAnswer}
                <Textarea
                  rows={4}
                  maxLength={8000}
                  dir="auto"
                  value={item.modelAnswer}
                  onChange={(event) => patch(item.key, { modelAnswer: event.target.value })}
                />
              </label>
              <label className="mt-3 flex max-w-[10rem] flex-col gap-1.5 text-[length:var(--fs-text-sm)] text-fg">
                {c.maxMarks}
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_ESSAY_MARKS}
                  step={1}
                  value={item.maxMarks}
                  onChange={(event) => patch(item.key, { maxMarks: event.target.value })}
                />
              </label>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={add} disabled={items.length >= MAX_ESSAY_BATCH}>
            <Plus className="size-4" aria-hidden="true" />
            {c.addAnother}
          </Button>
          {days.length > 0 ? (
            <span className="text-[length:var(--fs-text-sm)] text-fg-muted">
              {formatCopy(c.summary, {
                n: days.length,
                first: essayDayLabel(days[0]!),
                last: essayDayLabel(days.at(-1)!),
              })}
            </span>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="text-[length:var(--fs-text-sm)] text-[color:var(--err)]">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? c.saving : c.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
