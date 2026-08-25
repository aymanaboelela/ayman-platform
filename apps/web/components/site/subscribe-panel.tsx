'use client';

import { useEffect, useRef, useState } from 'react';
import { z } from '@ayman/contracts/zod';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { normalizeEgyptianPhone } from '@ayman/contracts/phone';
import { PaymentSubmissionSchema, type PaymentPlan, type PaymentSubmission } from '@ayman/contracts/payments';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { ApiRequestError, apiGet, apiPost } from '@/lib/api';
import { uploadPaymentScreenshot } from '@/lib/upload-client';
import { formatEGP } from '@/lib/price';

/** `+201021196367` → `٠١٠٢١١٩٦٣٦٧`-shaped local digits, what a Vodafone Cash
 *  transfer screen actually asks a student to dial. */
function localEgyptianDigits(e164: string): string {
  return e164.replace(/^\+20/, '0');
}

const MY_SUBMISSIONS_SCHEMA = z.array(PaymentSubmissionSchema);

type Step = 'checking' | 'pending' | 'choose' | 'form' | 'submitting' | 'success';

export function SubscribePanel({
  courseId,
  monthlyPriceCents,
  quarterlyPriceCents,
  vodafoneCash,
  onCancel,
}: {
  courseId: string;
  monthlyPriceCents: number | null;
  quarterlyPriceCents: number | null;
  /** E.164, or `null` when the admin has not configured one yet. */
  vodafoneCash: string | null;
  onCancel: () => void;
}) {
  // Starts in `checking`, not `choose`: a student who already has a
  // submission sitting in the review queue for THIS course must see that —
  // "قيد المراجعة" again, not a second plan picker they could resubmit
  // through (the API would 409 it anyway, but landing there via a fresh
  // "choose a plan" screen reads like the platform forgot they already paid).
  const [step, setStep] = useState<Step>('checking');
  const [plan, setPlan] = useState<PaymentPlan | null>(null);
  const [senderPhone, setSenderPhone] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejection, setRejection] = useState<string | null>(null);
  // The clipboard write's own fallback target — see `copyNumber` below.
  const numberInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkExisting() {
      try {
        const mine = await apiGet('/api/payments/submissions/me', MY_SUBMISSIONS_SCHEMA);
        if (cancelled) return;
        // `listMine` is newest-first, so the first match for this course is
        // its most recent submission — the only one that should gate the
        // panel. An older rejection sitting behind a later approval must not
        // resurface here.
        const latest: PaymentSubmission | undefined = mine.find((row) => row.courseId === courseId);
        if (latest?.status === 'pending') {
          setStep('pending');
        } else {
          if (latest?.status === 'rejected') setRejection(latest.rejectionReason);
          setStep('choose');
        }
      } catch {
        // A failed check must never block checkout — worst case, a student
        // sees the plan picker again and the submit call 409s (handled below)
        // instead of the friendlier up-front message.
        if (!cancelled) setStep('choose');
      }
    }

    void checkExisting();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  if (!vodafoneCash) {
    return <p className="course-subscribe__error">{copy.subscribe.noNumber}</p>;
  }

  if (step === 'checking') {
    return <p className="course-subscribe__loading">{copy.subscribe.checking}</p>;
  }

  if (step === 'pending') {
    return <p className="course-subscribe__pending">{copy.subscribe.pendingStatus}</p>;
  }

  const localNumber = localEgyptianDigits(vodafoneCash);

  function choosePlan(next: PaymentPlan) {
    setPlan(next);
    setError(null);
    setStep('form');
  }

  async function copyNumber() {
    // Two paths, because `navigator.clipboard` is not a given: it needs a
    // secure context and can be refused outright by permissions policy or an
    // older WebView, which is exactly the class of device most likely to be
    // paying over Vodafone Cash. `execCommand('copy')` against a real,
    // focused, selected input still works in every one of those cases —
    // deprecated, but not yet removed anywhere that matters here.
    try {
      await navigator.clipboard.writeText(localNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    } catch {
      // Fall through to the execCommand path below.
    }

    const input = numberInputRef.current;
    if (!input) return;
    try {
      input.focus();
      input.select();
      const ok = document.execCommand('copy');
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Both paths refused. The number is still selected text on screen —
      // nothing else to do here.
    }
  }

  async function submit() {
    if (!plan) return;
    const normalizedPhone = normalizeEgyptianPhone(senderPhone);
    if (!senderPhone.trim()) {
      setError(copy.subscribe.senderPhoneRequired);
      return;
    }
    if (!normalizedPhone) {
      setError(copy.subscribe.senderPhoneInvalid);
      return;
    }
    if (!file) {
      setError(copy.subscribe.screenshotRequired);
      return;
    }

    setError(null);
    setStep('submitting');

    const uploaded = await uploadPaymentScreenshot(file);
    if (!uploaded.ok) {
      setError(copy.subscribe.uploadError);
      setStep('form');
      return;
    }

    try {
      await apiPost('/api/payments/submissions', PaymentSubmissionSchema, {
        courseId,
        plan,
        senderPhone: normalizedPhone,
        screenshotKey: uploaded.value.screenshotKey,
      });
      setStep('success');
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.status === 409) {
        setError(copy.subscribe.alreadyPending);
      } else {
        setError(copy.subscribe.genericError);
      }
      setStep('form');
    }
  }

  if (step === 'success') {
    return <p className="course-subscribe__success">{copy.subscribe.success}</p>;
  }

  if (step === 'choose') {
    return (
      <div className="course-subscribe">
        {rejection ? (
          <p className="course-subscribe__rejected">
            {copy.subscribe.rejectedStatus}
            {': '}
            {rejection}
          </p>
        ) : null}
        <p className="course-subscribe__title">{copy.subscribe.choosePlan}</p>
        <div className="course-subscribe__plans">
          {monthlyPriceCents !== null ? (
            <Button type="button" variant="secondary" onClick={() => choosePlan('monthly')}>
              {formatCopy(copy.subscribe.planMonthly, { price: formatEGP(monthlyPriceCents) })}
            </Button>
          ) : null}
          {quarterlyPriceCents !== null ? (
            <Button type="button" variant="secondary" onClick={() => choosePlan('quarterly')}>
              {formatCopy(copy.subscribe.planQuarterly, { price: formatEGP(quarterlyPriceCents) })}
            </Button>
          ) : null}
        </div>
        <button type="button" className="course-subscribe__cancel" onClick={onCancel}>
          {copy.subscribe.back}
        </button>
      </div>
    );
  }

  const submitting = step === 'submitting';

  return (
    <div className="course-subscribe">
      <p className="course-subscribe__instructions">
        {formatCopy(copy.subscribe.instructions, { number: localNumber })}
      </p>

      <div className="course-subscribe__number-row">
        <span dir="ltr" className="course-subscribe__number">
          {localNumber}
        </span>
        {/* `readOnly`, not `type="hidden"` — `execCommand('copy')` in
            `copyNumber` needs a real, focusable, selectable input to select
            text from when the async Clipboard API is unavailable. Visually
            merged into the row rather than hidden off-screen, since a
            focused element some browsers scroll into view. */}
        <input
          ref={numberInputRef}
          readOnly
          dir="ltr"
          value={localNumber}
          aria-hidden="true"
          tabIndex={-1}
          className="sr-only"
        />
        <button type="button" onClick={copyNumber} className="course-subscribe__copy">
          {copied ? copy.subscribe.copied : copy.subscribe.copyNumber}
        </button>
      </div>

      <div>
        <Label htmlFor="subscribe-sender-phone">{copy.subscribe.senderPhoneLabel}</Label>
        <Input
          id="subscribe-sender-phone"
          type="tel"
          inputMode="tel"
          dir="ltr"
          placeholder="01xxxxxxxxx"
          value={senderPhone}
          onChange={(event) => setSenderPhone(event.target.value)}
          disabled={submitting}
        />
      </div>

      <div>
        <Label htmlFor="subscribe-screenshot">{copy.subscribe.screenshotLabel}</Label>
        <input
          id="subscribe-screenshot"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          disabled={submitting}
        />
        <p className="course-subscribe__hint">{copy.subscribe.screenshotHint}</p>
      </div>

      {error ? (
        <p role="alert" className="course-subscribe__error">
          {error}
        </p>
      ) : null}

      <div className="course-subscribe__actions">
        <Button type="button" onClick={submit} disabled={submitting}>
          {submitting ? copy.subscribe.submitting : copy.subscribe.submit}
        </Button>
        <button type="button" className="course-subscribe__cancel" onClick={() => setStep('choose')} disabled={submitting}>
          {copy.subscribe.back}
        </button>
      </div>
    </div>
  );
}
