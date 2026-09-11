'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { BroadcastTarget } from '@ayman/contracts/outreach/broadcast';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@ayman/ui/components/radio-group';
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
 */
export function BroadcastForm() {
  const [body, setBody] = useState('');
  const [targetType, setTargetType] = useState<'all' | 'user'>('user');

  const [query, setQuery] = useState('');
  const [resolved, setResolved] = useState<ResolvedStudent | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolving, startResolving] = useTransition();

  const [allCount, setAllCount] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [sending, startSending] = useTransition();

  useEffect(() => {
    if (targetType !== 'all') return;
    let cancelled = false;
    void recipientCountAction({ type: 'all' }).then((count) => {
      if (!cancelled) setAllCount(count);
    });
    return () => {
      cancelled = true;
    };
  }, [targetType]);

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
      toast.success(target.type === 'all' ? formatCopy(c.sentAll, { count: result.queued }) : c.sentOne);
      reset();
      setConfirmOpen(false);
    });
  }

  const canSend = body.trim().length > 0 && (targetType === 'all' || resolved !== null);

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
            setTargetType(value as 'all' | 'user');
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
      ) : (
        <p className="mb-6 text-[length:var(--fs-text-sm)] text-fg-muted">
          {allCount === null ? c.countLoading : formatCopy(c.recipientCountAll, { count: allCount })}
        </p>
      )}

      {targetType === 'all' ? (
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <Button type="button" disabled={!canSend || sending} onClick={() => setConfirmOpen(true)}>
            {sending ? c.sending : c.send}
          </Button>
          <DialogContent closeLabel={copy.common.close}>
            <DialogHeader>
              <DialogTitle>{c.confirmTitle}</DialogTitle>
              <DialogDescription>
                {formatCopy(c.confirmBody, { count: allCount ?? 0 })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="danger" onClick={() => send({ type: 'all' })} disabled={sending}>
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
