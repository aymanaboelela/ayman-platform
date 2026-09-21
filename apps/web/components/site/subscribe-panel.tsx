'use client';

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { BookOpen, CalendarClock, CalendarRange, ImagePlus } from 'lucide-react';
import { z } from '@ayman/contracts/zod';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { normalizeEgyptianPhone } from '@ayman/contracts/phone';
import { CatalogCourseDetailSchema, type CatalogCourseTerm } from '@ayman/contracts/catalog';
import { PublicSettingsReadSchema } from '@ayman/contracts/admin/settings';
import { PaymentSubmissionSchema, type PaymentSubmission } from '@ayman/contracts/payments';
// The SUBPATH, never the root barrel — `lib/client-barrel.test.ts` fails the
// build on a root-barrel import from a `'use client'` file.
import type { CourseMonth, SellablePaymentPlan } from '@ayman/contracts/months';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { cn } from '@ayman/ui/lib/cn';
import { ApiRequestError, apiGet, apiPost } from '@/lib/api';
import { uploadPaymentScreenshot } from '@/lib/upload-client';
import { formatEGP } from '@/lib/price';
import { PaymentBrand, type PaymentRail } from './payment-brand';
import { PaymentMethodChoice } from './payment-method-choice';

/** `+201021196367` → `٠١٠٢١١٩٦٣٦٧`-shaped local digits, what a Vodafone Cash
 *  transfer screen actually asks a student to dial. */
function localEgyptianDigits(e164: string): string {
  return e164.replace(/^\+20/, '0');
}

const MY_SUBMISSIONS_SCHEMA = z.array(PaymentSubmissionSchema);

/**
 * `GET /api/payments/courses/:courseId/months/mine` — the months this student
 * can already open, whether they bought them one by one or hold a term/yearly
 * subscription that covers the lot (the endpoint runs the SAME
 * `courseAccessScopes` + `monthSliceOf` pair the padlock does, deliberately).
 *
 * Declared here rather than in `@ayman/contracts` because the route answers an
 * inline shape and nothing else consumes it yet; the day a second screen needs
 * it, it belongs in the package.
 */
const OWNED_MONTHS_SCHEMA = z.object({ ownedMonthIds: z.uuid().array() });

type Step =
  | 'checking'
  | 'pending'
  | 'choose'
  | 'chooseTerm'
  /** «شهر» on a course whose instructor has configured curriculum months —
   *  see `choosePlan`. Unreachable on a course that has none. */
  | 'chooseMonths'
  | 'form'
  | 'submitting'
  | 'success';

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
 *
 * ## `months` has no cached twin, on purpose
 *
 * The other four fields each have a prop behind them because a stale number
 * still sells. `months` does not: it is the array that decides whether «شهر»
 * means "pick your months" or "thirty days from today", and an hours-old answer
 * to THAT is not a slightly wrong price, it is the wrong screen. So it is read
 * live or not at all — and "not at all" falls back to the behaviour the panel
 * had before months existed, which is the safe direction to fail in for every
 * course on the platform except the handful the instructor has configured.
 *
 * ⚠️ `quarterlyPriceCents` is gone from here and from the props. «٣ شهور» is
 * off the shelf — `SellablePaymentPlanSchema` refuses it and the migration
 * NULLs the column — so a field the panel cannot act on is a field that would
 * only ever mislead the next reader. History keeps working everywhere it is
 * READ (admin payments, finance, «اشتراكاتي»); this file is the SALE.
 */
type LivePlans = {
  monthlyPriceCents: number | null;
  yearlyPriceCents: number | null;
  terms: CatalogCourseTerm[];
  months: CourseMonth[];
};

/**
 * One plan choice, as its own tappable CARD rather than a line in a stacked
 * list of buttons — sits beside its siblings in a responsive grid (see
 * `.course-subscribe__plans` in `pages.css`), each with its own icon, name
 * and price, so the three options (monthly/term/yearly) read as three distinct
 * products rather than three rows of text.
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

/**
 * One curriculum month in the picker — «شهر ٢ · ٥ محاضرات», tapped on and off.
 *
 * ## Why it borrows `.pay-choice__card` instead of `.course-subscribe__plan-card`
 *
 * Because it is the same KIND of control as the rail question two screens
 * later, and that block already solved the one problem this screen has: a
 * selected state that survives a phone in daylight. `.pay-choice__card--on` is
 * three signals — amber edge, warm fill, ring — and its own comment explains
 * why one was not enough. `.course-subscribe__plan-card` has no selected state
 * at all, because a plan card acts on the tap and never stays lit. Inventing a
 * third card block to say what an existing one already says, in a stylesheet
 * (`globals.css`) this pass does not own, would be two kinds of wrong.
 *
 * ⚠️ `aria-pressed`, where `PaymentMethodChoice` deliberately has NOTHING.
 * That component's own docblock argues its cards are buttons and not radios
 * because the tap IS the commit. Here the opposite is true: the tap changes a
 * selection that «كمّل الدفع» commits later, several taps on, which is exactly
 * the toggle `aria-pressed` describes. Same paint, different promise, and the
 * promise has to match the screen.
 *
 * No `aria-label`: the accessible name is already the two visible lines, in the
 * order the eye reads them, so overriding it could only ever paraphrase.
 */
function MonthCard({
  month,
  selected,
  owned,
  onToggle,
}: {
  month: CourseMonth;
  selected: boolean;
  /** Already covered — by a month grant, or by a term/yearly subscription that
   *  takes in the whole course. Disabled rather than hidden: a card that
   *  vanishes leaves the student counting months that do not add up. */
  owned: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      disabled={owned}
      aria-pressed={selected}
      onClick={onToggle}
      className={cn('pay-choice__card', selected && 'pay-choice__card--on')}
    >
      <span className="pay-choice__label">{month.title}</span>
      <span className="pay-choice__off">
        {owned
          ? copy.subscribe.monthCardOwned
          : month.lessonCount > 0
            ? formatCopy(copy.subscribe.monthCardLessons, { count: month.lessonCount })
            : // An open month with nothing in it yet is the instructor
              // pre-selling, and it says so rather than printing «0 محاضرة» —
              // which reads as a number that failed to load.
              copy.subscribe.monthCardEmpty}
      </span>
    </button>
  );
}

export function SubscribePanel({
  courseId,
  slug,
  monthlyPriceCents: cachedMonthly,
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
   * ⚠️ Every one of the four below is now a FALLBACK, not the source of truth,
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
  /** A full-year subscription — same date-based expiry treatment as monthly
   *  on a course with no curriculum months, and never the open-ended `term`
   *  one. There is deliberately no `quarterlyPriceCents` any more: see
   *  `LivePlans`. */
  yearlyPriceCents: number | null;
  /** الترم الأول / الترم الثاني — only OPEN, PRICED ones. An independent
   *  purchase option alongside the prices above — see `CatalogCourseTerm`'s
   *  own doc. */
  terms: CatalogCourseTerm[];
  /** E.164, or `null` when the admin has not configured one yet. */
  instapay: string | null;
  /**
   * Close the panel — `undefined` when there is nothing to close.
   *
   * Two callers, two shapes. Inside `<CourseStartButton>`'s dialog this hides
   * the panel and leaves the course page standing behind it. On
   * `/courses/:slug/subscribe` the panel IS the page, so a cancel that hid it
   * would leave a blank screen; that route has its own «رجوع» link at the top
   * and passes nothing here.
   */
  onCancel?: () => void;
}) {
  // Starts in `checking`, not `choose`: a student who already has a
  // submission sitting in the review queue for THIS course must see that —
  // "قيد المراجعة" again, not a second plan picker they could resubmit
  // through (the API would 409 it anyway, but landing there via a fresh
  // "choose a plan" screen reads like the platform forgot they already paid).
  const [step, setStep] = useState<Step>('checking');
  // `SellablePaymentPlan`, not `PaymentPlan`: the narrower enum is what makes
  // «٣ شهور» unreachable from this component rather than merely un-rendered —
  // the card is gone below, and the type is what stops a later edit putting one
  // back for a plan the API would 400.
  const [plan, setPlan] = useState<SellablePaymentPlan | null>(null);
  const [termId, setTermId] = useState<string | null>(null);
  /**
   * The curriculum months this student is buying in THIS transfer — several at
   * once, which is the whole reason the picker is multi-select («ينفع اختيار
   * أكتر من شهر في تحويل واحد»). Empty on every other plan, and on a course
   * that sells no months at all.
   */
  const [selectedMonthIds, setSelectedMonthIds] = useState<string[]>([]);
  /** What the student already holds — read live beside everything else below,
   *  and `[]` when that read fails. The server refuses a month it has already
   *  sold either way (`submit()` runs the same check), so the worst a failed
   *  read costs is a card that looks selectable and is not. */
  const [ownedMonthIds, setOwnedMonthIds] = useState<string[]>([]);
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
  const [liveVodafone, setLiveVodafone] = useState<string | null | undefined>(undefined);
  /**
   * «هتحوّل بإيه؟» — the rail, and whether the student has confirmed it.
   *
   * ⚠️ `rail` starts null and NOTHING preselects it. A default here is a choice
   * the student did not make, and this one decides where their money goes.
   *
   * `railConfirmed` is a second flag rather than `rail !== null`, so going back
   * from the number screen returns to the question with the previous answer
   * still lit instead of clearing it — the student who picked wrong is one tap
   * from right, not back at the start.
   */
  const [rail, setRail] = useState<PaymentRail | null>(null);
  const [railConfirmed, setRailConfirmed] = useState(false);
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
   * The one round trip the panel makes before it shows anything — now four
   * requests instead of one, issued together.
   *
   * `allSettled`, not `all`: these answer four independent questions and one
   * failing must not take the others down. In particular a signed-out visitor
   * (or a 429 on the student's own throttle) makes the submissions call throw,
   * and losing the LIVE PRICE to that would put the panel straight back on the
   * cached numbers this effect exists to stop trusting.
   *
   * ⚠️ The months read is the second call here that needs a session, and it
   * throws for the same signed-out visitor. That must not reach the picker:
   * «مافيش حاجة معاه» is the correct answer for somebody with no account, and
   * a month picker that refused to draw because it could not ask would be a
   * checkout closed by a question about a purchase nobody has made.
   *
   * The catalog read is deliberately the same public endpoint `lib/catalog.ts`
   * wraps in `'use cache'` server-side. Called from the browser it is the
   * uncached twin of it: same data, same shape, no cache entry between the
   * student and Postgres.
   */
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [mineResult, courseResult, settingsResult, ownedMonthsResult] =
        await Promise.allSettled([
          apiGet('/api/payments/submissions/me', MY_SUBMISSIONS_SCHEMA),
          apiGet(`/api/catalog/courses/${encodeURIComponent(slug)}`, CatalogCourseDetailSchema),
          apiGet('/api/settings/public', PublicSettingsReadSchema),
          apiGet(
            `/api/payments/courses/${encodeURIComponent(courseId)}/months/mine`,
            OWNED_MONTHS_SCHEMA,
          ),
        ]);
      if (cancelled) return;

      if (courseResult.status === 'fulfilled') {
        const live = courseResult.value;
        setLivePlans({
          monthlyPriceCents: live.monthlyPriceCents,
          yearlyPriceCents: live.yearlyPriceCents,
          terms: live.terms,
          // OPEN months only, and already empty when the course has no monthly
          // price — `CatalogService` collapses the list in that case, so the
          // «شهر» card and the picker behind it can never disagree about
          // whether a monthly plan exists.
          months: live.months,
        });
      }

      // Only ever written on success. A «جرّب تاني» whose months read fails
      // keeps the answer the first one gave rather than telling a student who
      // owns months that they own none — the more expensive of the two lies,
      // since it is the one that offers to sell them a month twice.
      if (ownedMonthsResult.status === 'fulfilled') {
        setOwnedMonthIds(ownedMonthsResult.value.ownedMonthIds);
      }

      if (settingsResult.status === 'fulfilled') {
        setLiveInstapay(settingsResult.value.contact.instapay ?? null);
        /*
         * The Vodafone number rides the SAME request — no new prop through the
         * nine call sites that pass `instapay` down, and no second round trip.
         * There is no cached seed for it and it does not need one: the rail
         * question renders before any number does, which covers the latency
         * for free.
         */
        setLiveVodafone(settingsResult.value.contact.vodafoneCash ?? null);
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
  const yearlyPriceCents = livePlans ? livePlans.yearlyPriceCents : cachedYearly;
  const terms = livePlans ? livePlans.terms : cachedTerms;
  const instapay = liveInstapay !== undefined ? liveInstapay : cachedInstapay;
  /**
   * ⚠️ ONE array decides what «شهر» means, and there is no second flag to
   * disagree with it. Non-empty ⇒ the student picks named curriculum months
   * that never expire; empty ⇒ the rolling thirty days this panel has always
   * sold, on exactly the old code path.
   *
   * `[]` until the live read lands, and after one that failed — see `LivePlans`
   * for why this one has no cached prop behind it.
   */
  const months = livePlans ? livePlans.months : [];
  /**
   * What a month purchase costs — summed from the CHOSEN months' own prices
   * rather than `monthlyPriceCents × count`.
   *
   * Today the two agree to the piastre: `CatalogService` fills every
   * `month.priceCents` from the course's own monthly price, because the
   * instructor's decision was one price for any month. They stop agreeing the
   * day a month gets a price of its own, and on that day this line is already
   * reading the number the server will charge from the same rows.
   */
  const selectedMonthsTotalCents = months.reduce(
    (sum, month) => (selectedMonthIds.includes(month.id) ? sum + month.priceCents : sum),
    0,
  );
  /*
   * ⚠️ `quarterlyPriceCents` is NOT consulted, and a quarterly-only course now
   * reads as a course with nothing on sale.
   *
   * That is the state the retirement migration names: the column is NULLed
   * everywhere, `SellablePaymentPlanSchema` refuses the plan, and a course
   * priced by nothing else becomes a closed course whose instructor has to
   * price it again. Counting a price the panel cannot take money for would be
   * worse — the student would pass `hasPlan`, reach an empty card grid, and be
   * offered a screen with no way off it.
   */
  const hasPlan = monthlyPriceCents !== null || yearlyPriceCents !== null || terms.length > 0;

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
  /*
   * ⚠️ EITHER rail is enough to sell, so this is `&&` and not `!instapay`.
   *
   * It used to be InstaPay alone, and leaving it that way would close checkout
   * on a platform that takes Vodafone Cash and nothing else — «الاشتراك مش
   * متاح» on a course a student could have paid for in ten seconds.
   */
  const vodafone = liveVodafone !== undefined ? liveVodafone : null;

  if (!hasPlan || (!instapay && !vodafone)) {
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
        {onCancel ? (
          <button type="button" className="course-subscribe__cancel" onClick={onCancel}>
            {copy.subscribe.back}
          </button>
        ) : null}
      </div>
    );
  }

  /**
   * ⚠️ The number FOLLOWS the rail, and there is no fallback between them.
   *
   * Showing the InstaPay number under a «فودافون كاش» heading — or the reverse
   * — is the most expensive bug this screen can have: the money leaves and
   * nothing reconciles it. An unset rail has no number, and the chooser is
   * what the student sees instead.
   */
  const railNumber = rail === 'vodafoneCash' ? vodafone : rail === 'instapay' ? instapay : null;
  // Empty until a rail is chosen, and that is unreachable: the chooser renders
  // in place of everything that reads this until `railConfirmed` is true.
  const localNumber = railNumber ? localEgyptianDigits(railNumber) : '';
  const railName = rail === 'vodafoneCash' ? copy.subscribe.railVodafoneCash : copy.subscribe.railInstapay;

  /**
   * «الاشتراك في الشهر ده» — the month the student arrived asking for.
   *
   * The padlock on a locked lecture links to `/courses/:slug?month=<id>`, and
   * that parameter does two jobs. `proxy.ts` exempts a request carrying it from
   * the redirect that would otherwise bounce an enrolled student back to their
   * library (see that file's own note); and here it is the preselection, so
   * somebody who pressed «الاشتراك في الشهر ده» on «شهر ٣» does not then have
   * to find «شهر ٣» again in a list of nine.
   *
   * Read in the CLICK HANDLER, not in an effect and not with
   * `useSearchParams()`. An effect that sets state on mount is a cascading
   * render the lint rule refuses on sight; `useSearchParams()` opts the whole
   * route out of static rendering unless it is wrapped in its own
   * `<Suspense>`, which this page has no other reason to pay for. By the time
   * anyone can press «شهر», `months` has already landed — the card does not
   * render until prices do — so the handler is the one place where the answer
   * is both available and needed.
   *
   * Validated against `months` rather than trusted: the id sits in a URL
   * anybody can type, and selecting a month that is closed, already owned, or
   * from another course entirely would show a total the student cannot pay and
   * then 400 on a submit they did nothing to earn. An id that does not resolve
   * just leaves the picker empty, which is the screen they would have seen
   * with no parameter at all.
   */
  function preselectedMonthIds(): string[] {
    const requested = new URLSearchParams(window.location.search).get('month');
    if (requested === null) return [];
    if (!months.some((month) => month.id === requested)) return [];
    if (ownedMonthIds.includes(requested)) return [];
    return [requested];
  }

  function choosePlan(next: SellablePaymentPlan) {
    setPlan(next);
    setError(null);
    /*
     * «شهر» is two different products, and `months` is the only thing that
     * says which.
     *
     * A course whose instructor has configured curriculum months sells NAMED
     * slices of the syllabus — the student picks them, they never expire, and
     * `monthIds` on the claim is what the server turns into one open-ended
     * grant each. A course with none sells the rolling thirty days it always
     * did, and falls through to the payment form below on the same path, with
     * the same empty `monthIds`, exactly as before this branch existed.
     */
    if (next === 'monthly' && months.length > 0) {
      setTermId(null);
      // Empty unless the URL named a month, and empty is the ordinary case —
      // see `preselectedMonthIds`.
      setSelectedMonthIds((current) => (current.length > 0 ? current : preselectedMonthIds()));
      setStep('chooseMonths');
      return;
    }
    // Nothing else sells by month. A term or yearly claim carrying `monthIds`
    // is refused by `SubmitPaymentSchema` itself, and the student would have
    // no way to see what they had done to deserve it — so the selection is
    // dropped the moment they choose something else, not at submit time.
    setSelectedMonthIds([]);
    // A term purchase needs a SECOND choice — which one — unless there is
    // only ever one to pick: a course with exactly one open, priced term
    // goes straight to the payment form, same as monthly and yearly do.
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

  /** Multi-select, because a student buys several months in ONE transfer —
   *  the instructor's own rule, and the reason these are toggles and not a
   *  list of «اشترك» buttons that would each want their own screenshot. */
  function toggleMonth(monthId: string) {
    setError(null);
    setSelectedMonthIds((current) =>
      current.includes(monthId) ? current.filter((id) => id !== monthId) : [...current, monthId],
    );
  }

  /**
   * Where «رجوع» on the transfer screen goes back TO — the choice that was
   * actually made, never all the way to the plan grid. Returning there would
   * silently forget WHICH term, or which months, this claim was for, and the
   * student would have to rebuild a selection they could not see was gone.
   */
  function stepBeforeForm(): Step {
    if (plan === 'monthly' && months.length > 0) return 'chooseMonths';
    if (plan === 'term' && terms.length > 1) return 'chooseTerm';
    return 'choose';
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
        // Empty on every plan but a month purchase — `choosePlan` clears it,
        // and `SubmitPaymentSchema` refuses a non-empty list on anything else.
        // The AMOUNT is still the server's to compute from these ids; nothing
        // on this screen tells it what to charge.
        monthIds: selectedMonthIds,
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
          {/*
            ⚠️ There is no «٣ شهور» card, and its absence is a DECISION rather
            than the accident it would otherwise look like.

            `quarterlyPriceCents` is NULL on every course once the retirement
            migration has run, so the card would have stopped drawing on its
            own — which is the worst way for a product to leave a shelf: the
            next reader finds live code for a plan nobody sells and has to
            work out whether it is broken or retired. `copy.subscribe
            .planQuarterlyLabel` deliberately SURVIVES for the screens that
            list history (admin payments, finance, «اشتراكاتي»); a student who
            bought three months still has them.
          */}
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
        {onCancel ? (
          <button type="button" className="course-subscribe__cancel" onClick={onCancel}>
            {copy.subscribe.back}
          </button>
        ) : null}
      </div>
    );
  }

  if (step === 'chooseMonths') {
    const nothingChosen = selectedMonthIds.length === 0;

    return (
      <div className="course-subscribe">
        <p className="course-subscribe__title">{copy.subscribe.chooseMonthsTitle}</p>
        {/* Says the thing that is actually new. A student who subscribed last
            year reads «شهر» as thirty days, and every screen after this one
            would quietly confirm it. */}
        <p className="course-subscribe__instructions">{copy.subscribe.chooseMonthsHint}</p>

        {/* `.pay-choice__grid` rather than `.course-subscribe__plans`: the
            plan grid is hard-wired to two columns because its cards hold one
            short duration word each, and a month title is a phrase. This one
            is `auto-fit` with a `min(100%, …)` floor, so twelve months reflow
            instead of squeezing two to a row on a phone. */}
        <div className="pay-choice__grid">
          {months.map((month) => (
            <MonthCard
              key={month.id}
              month={month}
              selected={selectedMonthIds.includes(month.id)}
              owned={ownedMonthIds.includes(month.id)}
              onToggle={() => toggleMonth(month.id)}
            />
          ))}
        </div>

        {/*
          ⚠️ The total and the CTA live INSIDE `.course-subscribe__actions`,
          which is the row commit e64a39f4 made `position: sticky` after «كمّل
          الطلب» was found below the fold on the transfer screen. This screen
          is the worse case of that same bug: twelve month cards in a dialog
          capped at `100dvh - 2rem` is a list you scroll, and both the running
          total and the button are things the student needs WHILE scrolling,
          not after. Putting them in that row is what keeps them on screen for
          every month they tap.

          The total replaces itself with `monthsRequired` at zero rather than
          printing «الإجمالي: 0 جنيه» beside a dead button — that is the slot
          where the eye already is, so it is where the reason belongs.
        */}
        <div className="course-subscribe__actions">
          <Button type="button" onClick={() => setStep('form')} disabled={nothingChosen}>
            {copy.subscribe.monthsContinue}
          </Button>
          {nothingChosen ? (
            <p className="course-subscribe__hint">{copy.subscribe.monthsRequired}</p>
          ) : (
            <p className="course-subscribe__amount">
              {formatCopy(copy.subscribe.monthsTotal, {
                price: formatEGP(selectedMonthsTotalCents),
              })}
            </p>
          )}
          <button
            type="button"
            className="course-subscribe__cancel"
            onClick={() => setStep('choose')}
          >
            {copy.subscribe.back}
          </button>
        </div>
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
      ? // A month purchase is the sum of what was picked a step ago, not one
        // month's price — the one plan on this screen whose amount is not
        // fixed by the card that was tapped.
        months.length > 0
        ? selectedMonthsTotalCents
        : monthlyPriceCents
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

      {/*
        ⚠️ The rail question comes BEFORE anything with a number on it, and it
        returns early. Rendering the chooser above the form instead would put a
        transfer number on screen while the student is still deciding which app
        to open — which is the exact confusion this step exists to remove.
      */}
      {!railConfirmed ? (
        <PaymentMethodChoice
          value={rail}
          // One tap: pick the rail AND move on. There is no confirm button —
          // see `PaymentMethodChoice`.
          onChange={(next) => {
            setRail(next);
            setRailConfirmed(true);
          }}
          available={{ instapay: Boolean(instapay), vodafoneCash: Boolean(vodafone) }}
        />
      ) : (
        <>
          <button
            type="button"
            onClick={() => setRailConfirmed(false)}
            className="pay-choice__back"
          >
            {copy.subscribe.railChange}
          </button>

          <p className="course-subscribe__instructions">
            {formatCopy(copy.subscribe.instructions, { number: localNumber, rail: railName })}
          </p>

          <PaymentBrand rail={rail ?? 'instapay'} className="course-subscribe__brand" />

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
        <p className="course-subscribe__hint">
          {formatCopy(copy.subscribe.screenshotHint, { rail: railName })}
        </p>
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
          // Back to whichever picker this claim came through — see
          // `stepBeforeForm` for why it is never the plan grid.
          onClick={() => setStep(stepBeforeForm())}
          disabled={submitting}
        >
          {copy.subscribe.back}
        </button>
      </div>
        </>
      )}
    </div>
  );
}
