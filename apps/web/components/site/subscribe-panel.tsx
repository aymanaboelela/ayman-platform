'use client';

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { BookOpen, CalendarClock, CalendarRange, ImagePlus, Layers3 } from 'lucide-react';
import { z } from '@ayman/contracts/zod';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { normalizeEgyptianPhone } from '@ayman/contracts/phone';
import { CatalogCourseDetailSchema, type CatalogCourseTerm } from '@ayman/contracts/catalog';
import { PublicSettingsReadSchema } from '@ayman/contracts/admin/settings';
import { PaymentSubmissionSchema, type PaymentPlan, type PaymentSubmission } from '@ayman/contracts/payments';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { ApiRequestError, apiGet, apiPost } from '@/lib/api';
import { uploadPaymentScreenshot } from '@/lib/upload-client';
import { formatEGP } from '@/lib/price';
import { PaymentBrand } from './payment-brand';

/** `+201021196367` → `٠١٠٢١١٩٦٣٦٧`-shaped local digits, what a Vodafone Cash
 *  transfer screen actually asks a student to dial. */
function localEgyptianDigits(e164: string): string {
  return e164.replace(/^\+20/, '0');
}

const MY_SUBMISSIONS_SCHEMA = z.array(PaymentSubmissionSchema);

type Step = 'checking' | 'pending' | 'choose' | 'chooseTerm' | 'form' | 'submitting' | 'success';

/**
 * What this panel is willing to sell, and where the money goes — read LIVE from
 * the API when the panel opens, never taken from the page underneath it.
 *
 * ## Why the props are not enough, and never were
 *
 * `(site)/courses/[slug]/page.tsx` is `'use cache'` with `cacheLife('hours')`.
 * Its price props, its `terms` list and the `contact.instapay` it passes down
 * are all as old as that cache entry. For everything ELSE on that page — the
 * title, the outline, the cover — an hour of staleness is free. For these four
 * it is the difference between a checkout and a dead end:
 *
 *   · prices all `null` in the entry ⇒ `CourseStartButton` used to conclude the
 *     course was free and print «الكورس ده مقفول دلوقتي. رسالة للمهندس أيمن».
 *     A course priced twenty minutes ago is exactly that shape.
 *   · `terms` empty in the entry ⇒ a term opened this morning is not on sale
 *     until the entry expires.
 *   · `instapay` null in the entry ⇒ «الاشتراك مش متاح دلوقتي. تواصل معانا على
 *     واتساب» — a student who came to pay, sent to WhatsApp.
 *
 * The admin UI does invalidate: every write in `(admin)/admin/courses/actions.ts`
 * calls `invalidateCourse`, and the settings actions call `updateTag`. That
 * covers the admin UI and nothing else — and course content on this platform is
 * routinely written straight to the API (see `docs/runbooks/`), which touches no
 * Next cache tag at all. So "the cache is correctly invalidated" is true of one
 * path and the checkout was betting on all of them.
 *
 * ## Why re-reading here costs nothing
 *
 * Both endpoints are `@Public()`, both are already served to anonymous
 * visitors, and both are fetched from the BROWSER — so they go through the
 * `/api/*` rewrite straight to Nest and past every Next cache by construction.
 * They ride in the same `Promise.allSettled` as the submissions check the panel
 * already made before showing anything, so they add no step and no latency the
 * student can perceive: this is two requests, once, at the moment somebody
 * decided to pay.
 *
 * `null` here means "asked, and the answer was nothing for sale" — a real
 * state. `undefined` (the state before the effect resolves, and after it fails)
 * is what falls back to the cached props, which is strictly better than showing
 * nothing.
 */
type LivePlans = {
  monthlyPriceCents: number | null;
  quarterlyPriceCents: number | null;
  yearlyPriceCents: number | null;
  terms: CatalogCourseTerm[];
};

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
  slug,
  monthlyPriceCents: cachedMonthly,
  quarterlyPriceCents: cachedQuarterly,
  yearlyPriceCents: cachedYearly,
  terms: cachedTerms,
  instapay: cachedInstapay,
  onCancel,
}: {
  courseId: string;
  /**
   * The course's public slug — what `GET /api/catalog/courses/:slug` is keyed
   * by, and the only reason this component takes it. See `LivePlans`.
   */
  slug: string;
  /**
   * ⚠️ Every one of the five below is now a FALLBACK, not the source of truth,
   * and the rename is what makes that impossible to forget: nothing in the body
   * of this component may read `cachedMonthly` and friends directly. The live
   * values computed just under the effect carry the unprefixed names, so a
   * later edit that reaches for `monthlyPriceCents` gets the right one.
   *
   * They are still worth taking. The live read is one round trip away, and
   * showing the price the student was already looking at while it lands is
   * better than showing nothing — and if the API is unreachable, the cached
   * numbers are the only ones there are.
   */
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
  instapay: string | null;
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
  // Set only when the newest submission for THIS course was actually
  // approved and its grant's `validUntil` has already passed — a student who
  // subscribed before and let it lapse, landing back on the plan picker
  // because they no longer have access. Never true for a `plan: 'term'` row
  // (its `validUntil` is always `null`, see `PaymentSubmissionSchema`'s own
  // note) — a closed term is a different admin action, not a date running
  // out, so it is not what "اشتراكه خلص" describes here.
  const [previouslyLapsed, setPreviouslyLapsed] = useState(false);
  // What the API says is on sale right now, and where to send the money. See
  // `LivePlans` for why the props cannot be trusted for either. `undefined`
  // until the read lands, and after a read that failed.
  const [livePlans, setLivePlans] = useState<LivePlans | undefined>(undefined);
  const [liveInstapay, setLiveInstapay] = useState<string | null | undefined>(undefined);
  // Bumped by «جرّب تاني» on the two dead-end screens, which is the whole of
  // what that button does: re-run the effect below. A student who opened the
  // panel thirty seconds before the admin finished setting the price gets the
  // price without losing the dialog, the course, or their place on the page.
  const [attempt, setAttempt] = useState(0);
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

  /*
   * The one round trip the panel makes before it shows anything — now three
   * requests instead of one, issued together.
   *
   * `allSettled`, not `all`: these answer three independent questions and one
   * failing must not take the others down. In particular a signed-out visitor
   * (or a 429 on the student's own throttle) makes the submissions call throw,
   * and losing the LIVE PRICE to that would put the panel straight back on the
   * cached numbers this effect exists to stop trusting.
   *
   * The catalog read is deliberately the same public endpoint `lib/catalog.ts`
   * wraps in `'use cache'` server-side. Called from the browser it is the
   * uncached twin of it: same data, same shape, no cache entry between the
   * student and Postgres.
   */
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [mineResult, courseResult, settingsResult] = await Promise.allSettled([
        apiGet('/api/payments/submissions/me', MY_SUBMISSIONS_SCHEMA),
        apiGet(`/api/catalog/courses/${encodeURIComponent(slug)}`, CatalogCourseDetailSchema),
        apiGet('/api/settings/public', PublicSettingsReadSchema),
      ]);
      if (cancelled) return;

      if (courseResult.status === 'fulfilled') {
        const live = courseResult.value;
        setLivePlans({
          monthlyPriceCents: live.monthlyPriceCents,
          quarterlyPriceCents: live.quarterlyPriceCents,
          yearlyPriceCents: live.yearlyPriceCents,
          terms: live.terms,
        });
      }

      if (settingsResult.status === 'fulfilled') {
        setLiveInstapay(settingsResult.value.contact.instapay ?? null);
      }

      if (mineResult.status === 'fulfilled') {
        // `listMine` is newest-first, so the first match for this course is
        // its most recent submission — the only one that should gate the
        // panel. An older rejection sitting behind a later approval must not
        // resurface here.
        const latest: PaymentSubmission | undefined = mineResult.value.find(
          (row) => row.courseId === courseId,
        );
        if (latest?.status === 'pending') {
          setStep('pending');
          return;
        }
        if (latest?.status === 'rejected') setRejection(latest.rejectionReason);
        if (latest?.status === 'approved' && latest.validUntil !== null) {
          setPreviouslyLapsed(new Date(latest.validUntil).getTime() < Date.now());
        }
      }
      // A failed check must never block checkout — worst case, a student sees
      // the plan picker again and the submit call 409s (handled below) instead
      // of the friendlier up-front message.
      setStep('choose');
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [courseId, slug, attempt]);

  /*
   * The live answer where there is one, the cached prop where there is not.
   *
   * These carry the names the rest of the component reads, so every price
   * rendered, every plan card offered and the number on the transfer screen all
   * come from the same place — and the props are unreachable from here under
   * their original names. See `LivePlans` for the whole argument.
   */
  const monthlyPriceCents = livePlans ? livePlans.monthlyPriceCents : cachedMonthly;
  const quarterlyPriceCents = livePlans ? livePlans.quarterlyPriceCents : cachedQuarterly;
  const yearlyPriceCents = livePlans ? livePlans.yearlyPriceCents : cachedYearly;
  const terms = livePlans ? livePlans.terms : cachedTerms;
  const instapay = liveInstapay !== undefined ? liveInstapay : cachedInstapay;
  const hasPlan =
    monthlyPriceCents !== null ||
    quarterlyPriceCents !== null ||
    yearlyPriceCents !== null ||
    terms.length > 0;

  if (step === 'checking') {
    return <p className="course-subscribe__loading">{copy.subscribe.checking}</p>;
  }

  if (step === 'pending') {
    return <p className="course-subscribe__pending">{copy.subscribe.pendingStatus}</p>;
  }

  /*
   * The two states where there is nothing to sell, and the ONLY two left that
   * do not end in a transfer.
   *
   * Both used to be reachable from a cache entry alone and are now reachable
   * only from a live read that really did come back empty — a course the
   * instructor has not priced, or a platform whose InstaPay number has not been
   * set. Both carry «جرّب تاني», which re-runs the effect above rather than
   * reloading: the student stays in the dialog, on the course, and picks up a
   * price the moment there is one.
   *
   * Ordered with `hasPlan` first on purpose. A course with no price is not a
   * payment problem, and telling someone the transfer number is missing for a
   * course they could not buy anyway is the wrong sentence.
   *
   * ⚠️ AFTER the `checking`/`pending` branches, not before them as the old
   * `if (!instapay)` was. That one ran on the first render, off the cached
   * prop, before the live read had even been issued — so a stale `null` closed
   * the panel with «تواصل معانا على واتساب» and the answer that would have
   * contradicted it arrived, unread, a moment later.
   */
  if (!hasPlan || !instapay) {
    return (
      <div className="course-subscribe">
        <p className="course-subscribe__error">
          {hasPlan ? copy.subscribe.noNumber : copy.subscribe.noPlans}
        </p>
        <Button
          type="button"
          onClick={() => {
            // Back to `checking` as well as bumping the attempt, so the press
            // has a visible answer. Without it the effect re-runs behind an
            // unchanged screen and the button reads as broken — which is the
            // complaint `use-error-retry.ts` was written about, one screen over.
            setStep('checking');
            setAttempt((n) => n + 1);
          }}
        >
          {copy.subscribe.retry}
        </Button>
        <button type="button" className="course-subscribe__cancel" onClick={onCancel}>
          {copy.subscribe.back}
        </button>
      </div>
    );
  }

  const localNumber = localEgyptianDigits(instapay);

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
        {previouslyLapsed ? (
          <p className="course-subscribe__lapsed">{copy.subscribe.previouslySubscribedLapsed}</p>
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
          {yearlyPriceCents !== null ? (
            <PlanCard
              icon={<CalendarRange className="size-6" strokeWidth={2} />}
              name={copy.subscribe.planYearlyLabel}
              price={formatCopy(copy.subscribe.priceLine, { price: formatEGP(yearlyPriceCents) })}
              onClick={() => choosePlan('yearly')}
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

  // The amount this SPECIFIC screen is about — chosen a step ago, on the
  // plan-card grid the student may no longer be looking at. Restated here,
  // large, above the transfer instructions, because "how much do I actually
  // send" is the one fact this whole screen exists to answer and it used to
  // only ever appear on the card they already tapped past.
  const amountCents =
    plan === 'monthly'
      ? monthlyPriceCents
      : plan === 'quarterly'
        ? quarterlyPriceCents
        : plan === 'yearly'
          ? yearlyPriceCents
          : plan === 'term'
            ? (terms.find((term) => term.id === termId)?.priceCents ?? null)
            : null;

  return (
    <div className="course-subscribe">
      {amountCents !== null ? (
        <p className="course-subscribe__amount">
          {formatCopy(copy.subscribe.priceLine, { price: formatEGP(amountCents) })}
        </p>
      ) : null}

      <p className="course-subscribe__instructions">
        {formatCopy(copy.subscribe.instructions, { number: localNumber })}
      </p>

      <PaymentBrand className="course-subscribe__brand" />

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
          /* `image/*`, not the API's allowlist.

             The narrow list greyed out a real share of the photo library on
             iOS, where pictures are HEIC and HEIC is not on that allowlist —
             the student taps a screenshot that is visibly there and the picker
             refuses to hand it over, so the form still says «ارفع صورة إثبات
             التحويل» and there is nothing on screen explaining why.

             Safe to widen because the upload no longer sends what the picker
             returns: `compressImage` re-encodes to JPEG first, and the API's
             own allowlist is still the gate. Same value the homework picker
             has always used. */
          accept="image/*"
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
