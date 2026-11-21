'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import type {
  BroadcastAccess,
  BroadcastCourseOption,
  BroadcastTarget,
} from '@ayman/contracts/outreach/broadcast';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { Checkbox } from '@ayman/ui/components/checkbox';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@ayman/ui/components/radio-group';
import { Select } from '@ayman/ui/components/select';
import { Textarea } from '@ayman/ui/components/textarea';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ayman/ui/components/dialog';
import { recipientCountAction, resolveStudentAction, sendBroadcastAction } from './actions';

const c = copy.admin.broadcast;

type ResolvedStudent = { id: string; fullName: string; contact: string };
type TargetType = 'all' | 'user' | 'course';

const ACCESS_OPTIONS: BroadcastAccess[] = ['any', 'missing', 'has'];

/**
 * The one screen that gets to send to everyone — see the page header for
 * why this is a separate screen from «رسايلي للطلبة» rather than a button
 * added to it.
 *
 * ## Two very different confirm shapes, on purpose
 *
 * «طالب واحد» sends the moment the button is pressed: one person, a mistake
 * costs one extra message in a thread he can already read and answer in.
 * «كل الطلبة» sends through a dialog that restates the exact number first —
 * the one press this whole screen exists to make sure is never an accident.
 * «طلبة كورس» goes through the same dialog: it is a list of people too, and
 * the number is the only way to see a filter that caught more than meant.
 */
export function BroadcastForm({ courses }: { courses: BroadcastCourseOption[] }) {
  const [body, setBody] = useState('');
  const [targetType, setTargetType] = useState<TargetType>('user');

  const [courseId, setCourseId] = useState('');
  const [monthId, setMonthId] = useState('');
  const [access, setAccess] = useState<BroadcastAccess>('any');
  const [paidBefore, setPaidBefore] = useState(false);

  const [query, setQuery] = useState('');
  const [resolved, setResolved] = useState<ResolvedStudent | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolving, startResolving] = useTransition();

  // Keyed by the target it was counted for, so a stale number from the
  // previous filter is never shown against the new one while it reloads.
  const [counted, setCounted] = useState<{ key: string; value: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [sending, startSending] = useTransition();

  const course = courses.find((entry) => entry.id === courseId) ?? null;
  const month = course?.months.find((entry) => entry.id === monthId) ?? null;

  /** The target the count, the dialog and the send all read — one value, so
   *  the number on screen is always the number for what gets sent. */
  const listTarget = useMemo<BroadcastTarget | null>(() => {
    if (targetType === 'all') return { type: 'all' };
    if (targetType === 'course' && courseId) {
      return { type: 'course', courseId, monthId: monthId || undefined, access, paidBefore };
    }
    return null;
  }, [targetType, courseId, monthId, access, paidBefore]);

  const targetKey = listTarget ? JSON.stringify(listTarget) : null;
  const count = counted && counted.key === targetKey ? counted.value : null;

  useEffect(() => {
    if (!listTarget || !targetKey) return;
    let cancelled = false;
    void recipientCountAction(listTarget).then((value) => {
      if (!cancelled) setCounted({ key: targetKey, value });
    });
    return () => {
      cancelled = true;
    };
  }, [listTarget, targetKey]);

  function resolve() {
    setResolveError(null);
    setResolved(null);
    startResolving(async () => {
      const result = await resolveStudentAction(query);
      if (result.ok) {
        setResolved({ id: result.id, fullName: result.fullName, contact: result.contact });
        return;
      }
      if (result.message.startsWith('ambiguous:')) {
        setResolveError(formatCopy(c.targetAmbiguous, { n: result.message.split(':')[1]! }));
      } else if (result.message === 'not-found') {
        setResolveError(c.targetNotFound);
      }
    });
  }

  function reset() {
    setBody('');
    setQuery('');
    setResolved(null);
    setResolveError(null);
  }

  function send(target: BroadcastTarget) {
    startSending(async () => {
      const result = await sendBroadcastAction({ body: body.trim(), target });
      if (!result.ok) {
        toast.error(result.notFound ? c.targetNotFound : c.sendFailed);
        return;
      }
      toast.success(target.type === 'user' ? c.sentOne : formatCopy(c.sentAll, { count: result.queued }));
      reset();
      setConfirmOpen(false);
    });
  }

  const canSend =
    body.trim().length > 0 &&
    (targetType === 'user' ? resolved !== null : listTarget !== null && (count ?? 0) > 0);

  function accessLabel(option: BroadcastAccess): string {
    if (option === 'any') return c.accessAny;
    if (month) {
      return formatCopy(option === 'has' ? c.accessHasMonth : c.accessMissingMonth, { month: month.title });
    }
    return option === 'has' ? c.accessHas : c.accessMissing;
  }

  return (
    <div className="max-w-[var(--w-prose)]">
      <div className="mb-5">
        <Label htmlFor="broadcast-body">{c.body}</Label>
        <Textarea
          id="broadcast-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={c.bodyPlaceholder}
          rows={6}
          maxLength={2000}
          className="mt-1.5"
        />
      </div>

      <fieldset className="mb-5">
        <RadioGroup
          value={targetType}
          onValueChange={(value) => {
            setTargetType(value as TargetType);
            setResolved(null);
            setResolveError(null);
          }}
          className="flex-row gap-6"
        >
          <label className="flex items-center gap-2 text-[length:var(--fs-text-sm)] text-fg">
            <RadioGroupItem value="user" />
            {c.targetOne}
          </label>
          <label className="flex items-center gap-2 text-[length:var(--fs-text-sm)] text-fg">
            <RadioGroupItem value="course" />
            {c.targetCourse}
          </label>
          <label className="flex items-center gap-2 text-[length:var(--fs-text-sm)] text-fg">
            <RadioGroupItem value="all" />
            {c.targetAll}
          </label>
        </RadioGroup>
      </fieldset>

      {targetType === 'user' ? (
        <div className="mb-6">
          <Label htmlFor="broadcast-target">{c.targetSearchLabel}</Label>
          <div className="mt-1.5 flex gap-2">
            <Input
              id="broadcast-target"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setResolved(null);
                setResolveError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  resolve();
                }
              }}
              placeholder={c.targetSearchPlaceholder}
              className="flex-1"
            />
            <Button type="button" variant="secondary" onClick={resolve} disabled={resolving || !query.trim()}>
              {c.targetSearchButton}
            </Button>
          </div>
          {resolved ? (
            <p className="mt-2 text-[length:var(--fs-text-sm)] text-[color:var(--ok)]">
              {formatCopy(c.targetFound, { name: resolved.fullName, email: resolved.contact })}
            </p>
          ) : resolveError ? (
            <p className="mt-2 text-[length:var(--fs-text-sm)] text-[color:var(--err)]">{resolveError}</p>
          ) : null}
        </div>
      ) : null}

      {targetType === 'course' ? (
        <div className="mb-5 grid gap-4">
          {courses.length === 0 ? (
            <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.noCourses}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="broadcast-course">{c.courseLabel}</Label>
                <Select
                  id="broadcast-course"
                  className="mt-1.5"
                  value={courseId}
                  onChange={(event) => {
                    setCourseId(event.target.value);
                    setMonthId('');
                  }}
                >
                  <option value="">{c.coursePlaceholder}</option>
                  {courses.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.title}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="broadcast-month">{c.monthLabel}</Label>
                <Select
                  id="broadcast-month"
                  className="mt-1.5"
                  value={monthId}
                  onChange={(event) => setMonthId(event.target.value)}
                  disabled={!course || course.months.length === 0}
                >
                  <option value="">{c.monthWhole}</option>
                  {course?.months.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.title}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          )}

          {course ? (
            <>
              <fieldset>
                <legend className="mb-2 text-[length:var(--fs-text-sm)] font-medium text-fg">{c.accessLabel}</legend>
                <RadioGroup
                  value={access}
                  onValueChange={(value) => setAccess(value as BroadcastAccess)}
                  className="gap-2"
                >
                  {ACCESS_OPTIONS.map((option) => (
                    <label key={option} className="flex items-center gap-2 text-[length:var(--fs-text-sm)] text-fg">
                      <RadioGroupItem value={option} />
                      {accessLabel(option)}
                    </label>
                  ))}
                </RadioGroup>
              </fieldset>

              <label className="flex items-start gap-2 text-[length:var(--fs-text-sm)] text-fg">
                <Checkbox
                  checked={paidBefore}
                  onCheckedChange={(value) => setPaidBefore(value === true)}
                  className="mt-0.5"
                />
                <span>
                  {c.paidBefore}
                  <span className="mt-0.5 block text-fg-muted">{c.paidBeforeHint}</span>
                </span>
              </label>
            </>
          ) : null}
        </div>
      ) : null}

      {listTarget ? (
        <p className="mb-6 text-[length:var(--fs-text-sm)] font-medium text-fg">
          {count === null ? c.countLoading : formatCopy(c.recipientCountAll, { count })}
        </p>
      ) : null}

      {targetType !== 'user' ? (
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <Button type="button" disabled={!canSend || sending} onClick={() => setConfirmOpen(true)}>
            {sending ? c.sending : c.send}
          </Button>
          <DialogContent closeLabel={copy.common.close}>
            <DialogHeader>
              <DialogTitle>
                {course && targetType === 'course'
                  ? formatCopy(c.confirmTitleCourse, { course: course.title })
                  : c.confirmTitle}
              </DialogTitle>
              <DialogDescription>
                {formatCopy(c.confirmBody, { count: count ?? 0 })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="danger" onClick={() => listTarget && send(listTarget)} disabled={sending || !listTarget}>
                {sending ? c.sending : c.confirmSend}
              </Button>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  {c.confirmCancel}
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : (
        <Button
          type="button"
          disabled={!canSend || sending}
          onClick={() => resolved && send({ type: 'user', userId: resolved.id })}
        >
          {sending ? c.sending : c.send}
        </Button>
      )}
    </div>
  );
}
