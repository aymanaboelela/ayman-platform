'use client';

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { BookOpen, CalendarClock, CalendarRange, ImagePlus, Layers3 } from 'lucide-react';
import { z } from '@ayman/contracts/zod';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { normalizeEgyptianPhone } from '@ayman/contracts/phone';
import type { CatalogCourseTerm } from '@ayman/contracts/catalog';
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

type Step = 'checking' | 'pending' | 'choose' | 'chooseTerm' | 'form' | 'submitting' | 'success';

/**
 * One plan choice, as its own tappable CARD rather than a line in a stacked
 * list of buttons — sits beside its siblings in a responsive grid (see
 * `.course-subscribe__plans` in `pages.css`), each with its own icon, name
 * and price, so four options (monthly/quarterly/term/yearly) read as four
 * distinct products rather than four rows of text.
 *
 * The accessible name is built from the SAME visible strings the card
 * prints (`name` then `price`), same discipline as `ImagePlus`'s own note
 * two components over: a screen reader announces exactly what the eye reads,
 * never a paraphrase of it.
 */
function PlanCard({
  icon,
  name,
  price,
  onClick,
}: {
  icon: ReactNode;
  name: string;
  price: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="course-subscribe__plan-card"
      onClick={onClick}
      aria-label={`${name} — ${price}`}
    >
      <span className="course-subscribe__plan-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="course-subscribe__plan-name">{name}</span>
      <span className="course-subscribe__plan-price">{price}</span>
    </button>
  );
}

export function SubscribePanel({
  courseId,
  monthlyPriceCents,
  quarterlyPriceCents,
  yearlyPriceCents,
  terms,
  vodafoneCash,
  onCancel,
}: {
  courseId: string;
  monthlyPriceCents: number | null;
  quarterlyPriceCents: number | null;
  /** A full-year subscription — a FOURTH plan, same date-based expiry
   *  treatment as the two above (not the open-ended `term` one). */
  yearlyPriceCents: number | null;
  /** الترم الأول / الترم الثاني — only OPEN, PRICED ones. An independent
   *  purchase option alongside the prices above — see `CatalogCourseTerm`'s
   *  own doc. */
  terms: CatalogCourseTerm[];
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
  const [termId, setTermId] = useState<string | null>(null);
  const [senderPhone, setSenderPhone] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejection, setRejection] = useState<string | null>(null);
  // The clipboard write's own fallback target — see `copyNumber` below.
  const numberInputRef = useRef<HTMLInputElement>(null);
  // The native file input is visually hidden (`sr-only`) — this is what the
  // styled dropzone button actually clicks, since a plain browser "Choose
  // File" control reads as nothing selectable on the smaller, older devices
  // most likely to be uploading a Vodafone Cash screenshot.
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revokes the previous object URL whenever a new one replaces it, and on
  // unmount — an un-revoked one leaks the decoded image for the panel's
  // lifetime, which matters when a student picks the wrong screenshot twice.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    setPreviewUrl((prevUrl) => {
      if (prevUrl) URL.revokeObjectURL(prevUrl);
      return next ? URL.createObjectURL(next) : null;
    });
    setFile(next);
  }

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
    // A term purchase needs a SECOND choice — which one — unless there is
    // only ever one to pick: a course with exactly one open, priced term
    // goes straight to the payment form, same as monthly/quarterly do.
    if (next === 'term') {
      if (terms.length === 1) {
        setTermId(terms[0]!.id);
        setStep('form');
      } else {
        setTermId(null);
        setStep('chooseTerm');
      }
      return;
    }
    setTermId(null);
    setStep('form');
  }

  function chooseTerm(next: CatalogCourseTerm) {
    setTermId(next.id);
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
        termId,
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
    // The cheapest open term's price — the only number a course selling
    // SEVERAL terms can show before the student picks one. `Math.min` over
    // an empty array is `Infinity`, but this branch never runs on an empty
    // `terms` (see the `terms.length > 1` guard below).
    const cheapestTermCents =
      terms.length > 1 ? Math.min(...terms.map((term) => term.priceCents)) : null;

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
            <PlanCard
              icon={<CalendarClock className="size-6" strokeWidth={2} />}
              name={copy.subscribe.planMonthlyLabel}
              price={formatCopy(copy.subscribe.priceLine, { price: formatEGP(monthlyPriceCents) })}
              onClick={() => choosePlan('monthly')}
            />
          ) : null}
          {quarterlyPriceCents !== null ? (
            <PlanCard
              icon={<Layers3 className="size-6" strokeWidth={2} />}
              name={copy.subscribe.planQuarterlyLabel}
              price={formatCopy(copy.subscribe.priceLine, { price: formatEGP(quarterlyPriceCents) })}
              onClick={() => choosePlan('quarterly')}
            />
          ) : null}
          {yearlyPriceCents !== null ? (
            <PlanCard
              icon={<CalendarRange className="size-6" strokeWidth={2} />}
              name={copy.subscribe.planYearlyLabel}
              price={formatCopy(copy.subscribe.priceLine, { price: formatEGP(yearlyPriceCents) })}
              onClick={() => choosePlan('yearly')}
            />
          ) : null}
          {terms.length === 1 ? (
            <PlanCard
              icon={<BookOpen className="size-6" strokeWidth={2} />}
              name={copy.subscribe.planTermLabel}
              price={formatCopy(copy.subscribe.priceLine, { price: formatEGP(terms[0]!.priceCents) })}
              onClick={() => choosePlan('term')}
            />
          ) : cheapestTermCents !== null ? (
            <PlanCard
              icon={<BookOpen className="size-6" strokeWidth={2} />}
              name={copy.subscribe.planTermLabel}
              price={formatCopy(copy.subscribe.planTermFromPrice, { price: formatEGP(cheapestTermCents) })}
              onClick={() => choosePlan('term')}
            />
          ) : null}
        </div>
        <button type="button" className="course-subscribe__cancel" onClick={onCancel}>
          {copy.subscribe.back}
        </button>
      </div>
    );
  }

  if (step === 'chooseTerm') {
    return (
      <div className="course-subscribe">
        <p className="course-subscribe__title">{copy.subscribe.chooseTermTitle}</p>
        <div className="course-subscribe__plans">
          {terms.map((term) => (
            <PlanCard
              key={term.id}
              icon={<BookOpen className="size-6" strokeWidth={2} />}
              name={term.title}
              price={formatCopy(copy.subscribe.priceLine, { price: formatEGP(term.priceCents) })}
              onClick={() => chooseTerm(term)}
            />
          ))}
        </div>
        <button type="button" className="course-subscribe__cancel" onClick={() => setStep('choose')}>
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
          ref={fileInputRef}
          id="subscribe-screenshot"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFileChange}
          disabled={submitting}
          className="sr-only"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={submitting}
          className="course-subscribe__upload"
        >
          {previewUrl ? (
            // A plain `<img>`, deliberately — same reasoning as `offline/page.tsx`:
            // this is a local `blob:` preview of the student's own file pick,
            // never a remote asset, so `next/image`'s optimizer (which serves
            // through `/_next/image`, a server route) has nothing to do here.
            <img src={previewUrl} alt="" className="course-subscribe__upload-preview" />
          ) : (
            // `ImagePlus`, not a bare "+" — the whole point of this pass was
            // that the control read as decoration rather than "press this to
            // pick a photo". A generic plus is still generic; a picture-frame
            // glyph with a plus on it says "add an image" on sight, before a
            // student has read a word of the label beside it.
            <span className="course-subscribe__upload-icon" aria-hidden="true">
              <ImagePlus className="size-6" strokeWidth={2} />
            </span>
          )}
          <span className="course-subscribe__upload-text">
            {file ? file.name : copy.subscribe.screenshotPlaceholder}
          </span>
          {file ? (
            <span className="course-subscribe__upload-change">{copy.subscribe.screenshotChange}</span>
          ) : null}
        </button>
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
        <button
          type="button"
          className="course-subscribe__cancel"
          // Back to the TERM picker when there was one to pick from —
          // returning all the way to the plan choice would silently forget
          // which of several terms this was.
          onClick={() => setStep(plan === 'term' && terms.length > 1 ? 'chooseTerm' : 'choose')}
          disabled={submitting}
        >
          {copy.subscribe.back}
        </button>
      </div>
    </div>
  );
}
