'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { TestSendResult } from '@ayman/contracts/marketing/campaign';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { Card, CardBody, CardHeader, CardTitle } from '@ayman/ui/components/card';
import { Field, FieldLabel } from '@ayman/ui/components/field';
import { Input } from '@ayman/ui/components/input';
import { Textarea } from '@ayman/ui/components/textarea';
import { testSendAction, testSendReceiptAction } from '../actions';

const c = copy.marketing;

/** `proto.WebMessageInfo.Status`. Mirrors the sidecar's `receipt-store.mjs`. */
const REFUSED = 0;
const DELIVERED = 3;
const READ = 4;

/**
 * «رسالة تجربة» — one message, one number, and the truth about what happened
 * to it.
 *
 * ## Why this screen exists
 *
 * Until it did, the smallest question anybody could ask the WhatsApp sender
 * was a whole campaign. So when messages began being accepted by WhatsApp and
 * delivered to nobody — every send returning a message id, every row going
 * `sent`, nothing red anywhere — the way the platform found out was seventy-
 * four students not getting a lecture reminder, and the instructor eventually
 * noticing one grey tick on his own phone.
 *
 * This asks that question for the price of one message.
 *
 * ## Why the delivery answer is polled rather than awaited
 *
 * A delivery receipt is not part of the send. It arrives afterwards, out of
 * band, over a separate connection — in seconds if the phone is on and in
 * hours if it is not. So the send answers immediately with what it knows, and
 * «اعرف وصلت ولا لأ» asks again. Nothing here ever calls a missing receipt a
 * failure: that is the exact mistake — reading silence as an outcome — that
 * made «اتبعت» mean «وصلت» for months.
 */
export function TestSend() {
  const [phone, setPhone] = useState('');
  const [text, setText] = useState('');
  const [sent, setSent] = useState<TestSendResult | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    startTransition(async () => {
      setSent(null);
      setStatus(null);
      const result = await testSendAction(phone.trim(), text.trim() || null);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setSent(result.data);
      if (result.data.messageId) {
        // One automatic look after a few seconds: a recipient who is online
        // acks almost immediately, and making the operator press a button for
        // the common case would be asking them to do the polling.
        const first = result.data.messageId;
        setTimeout(() => {
          void testSendReceiptAction(first).then((r) => {
            if (r) setStatus(r.status);
          });
        }, 5000);
      }
    });
  }

  function check() {
    if (!sent?.messageId) return;
    const id = sent.messageId;
    startTransition(async () => {
      const receipt = await testSendReceiptAction(id);
      setStatus(receipt?.status ?? null);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{c.testSendTitle}</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <p className="max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] text-fg-muted">{c.testSendLead}</p>

        <Field name="phone">
          <FieldLabel>{c.testSendPhone}</FieldLabel>
          <Input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            dir="ltr"
            inputMode="tel"
            placeholder="01xxxxxxxxx"
          />
        </Field>

        <Field name="text">
          <FieldLabel>{c.testSendText}</FieldLabel>
          <Textarea rows={2} value={text} onChange={(event) => setText(event.target.value)} />
        </Field>

        <div>
          <Button disabled={pending || phone.trim().length < 6} onClick={send}>
            {pending ? c.testSendSending : c.testSendButton}
          </Button>
        </div>

        {sent && !sent.onWhatsApp ? (
          <p className="text-[length:var(--fs-text-sm)] text-err">{c.testSendNotOnWhatsapp}</p>
        ) : null}

        {sent?.messageId ? (
          <div className="flex flex-col gap-2 rounded-[var(--r-md)] border border-line-subtle p-3">
            {/*
              The three states, and the middle one is the important one: a
              message WhatsApp took and nobody has acknowledged. It is not
              styled as a failure, because for a phone that is switched off it
              is not one — it is simply not an answer yet.
            */}
            <p
              className={
                status === DELIVERED || status === READ
                  ? 'text-[length:var(--fs-text-sm)] font-medium text-ok'
                  : status === REFUSED
                    ? 'text-[length:var(--fs-text-sm)] font-medium text-err'
                    : 'text-[length:var(--fs-text-sm)] text-fg-muted'
              }
            >
              {status === READ
                ? c.testSendRead
                : status === DELIVERED
                  ? c.testSendDelivered
                  : status === REFUSED
                    ? c.testSendRefused
                    : status === null
                      ? c.testSendQueued
                      : c.testSendPending}
            </p>

            {/*
              The diagnosis line. A recipient with a LID whose message never
              gets past one tick is the shape of the addressing failure the
              6.x sender cannot handle — and that pair of facts is exactly
              what was impossible to observe before this screen.
            */}
            <p className="mono text-[length:var(--fs-text-xs)] text-fg-muted" dir="ltr">
              {sent.lid ? formatCopy(c.testSendLid, { lid: sent.lid }) : c.testSendNoLid}
            </p>

            {status === DELIVERED || status === READ ? null : (
              <div>
                <Button variant="secondary" disabled={pending} onClick={check}>
                  {c.testSendCheckAgain}
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
