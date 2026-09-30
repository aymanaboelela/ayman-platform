'use client';

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  CalendarRange,
  CircleCheck,
  GraduationCap,
  Hourglass,
  ImagePlus,
  LoaderCircle,
  Lock,
  TriangleAlert,
  Wallet,
} from 'lucide-react';
import { z } from '@ayman/contracts/zod';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { normalizeEgyptianPhone } from '@ayman/contracts/phone';
import { CatalogCourseDetailSchema, type CatalogCourseTerm } from '@ayman/contracts/catalog';
import { PublicSettingsReadSchema } from '@ayman/contracts/admin/settings';
import { PaymentSubmissionSchema, type PaymentSubmission } from '@ayman/contracts/payments';
import { WalletBalanceSchema, WalletPurchaseResultSchema } from '@ayman/contracts/wallet';
// The SUBPATH, never the root barrel — `lib/client-barrel.test.ts` fails the
// build on a root-barrel import from a `'use client'` file.
import type { CourseMonth, SellablePaymentPlan } from '@ayman/contracts/months';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { cn } from '@ayman/ui/lib/cn';
import { ApiRequestError, apiGet, apiPost } from '@/lib/api';
import { uploadPaymentScreenshot } from '@/lib/upload-client';
import { formatEGP } from '@/lib/price';
import { PaymentBrand, type PaymentRail } from './payment-brand';
import { PaymentMethodChoice } from './payment-method-choice';
import {
  AmountCard,
  CheckoutDone,
  CheckoutField,
  CheckoutFooter,
  CheckoutSteps,
  CheckoutSummary,
  CopyButton,
  FooterTotal,
  Money,
  PayStep,
  useCheckoutKeyboard,
} from './checkout-parts';
import { WalletPayCard } from '@/components/wallet/wallet-pay-card';
import { newIdempotencyKey } from '@/lib/idempotency-key';
import { formatEGPExact } from '@/lib/price';
import '@/components/wallet/wallet.css';
/* The checkout frame's stylesheet — shared with the book checkout, `:root`
   tokens only: this panel is drawn in a dialog that portals out of `.site`,
   and on the subscribe page inside the dark course hero. */
import './book-checkout.css';
import { arabicCount } from '@ayman/contracts/arabic-count';
import { monthLessonForms } from '@/lib/month-lesson-count';

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
const OWNED_MONTHS_SCHEMA = z.object({
  ownedMonthIds: z.uuid().array(),
  /** A term, «٣ شهور», a year or an admin grant — every month is open. */
  coversAll: z.boolean().default(false),
});

/**
 * The months the link asked for — `?month=a` from a lecture's padlock, or
 * `?month=a,b` from the «شهور جديدة اتفتحت» card — kept only when they are on
 * sale here and not already held. The id sits in a URL anybody can type, and
 * a month that is closed, owned or from another course would show a total
 * the student cannot pay and then 400 on a submit they did nothing to earn.
 */
function requestedMonthIds(months: readonly { id: string }[], owned: readonly string[]): string[] {
  const raw = new URLSearchParams(window.location.search).get('month');
  if (!raw) return [];
  const asked = new Set(raw.split(',').map((id) => id.trim()));
  return months
    .map((month) => month.id)
    .filter((id) => asked.has(id) && !owned.includes(id));
}

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
  /** Paid from the wallet — access is already open, nothing to review. */
  | 'walletSuccess'
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
  /** `CatalogCourse.monthlyOnSale` — false on a course sold by month with
   *  every month closed. Read as `!== false`: a tab of the previous build can
   *  pair this component with the old catalog schema, which strips the key. */
  monthlyOnSale: boolean;
  yearlyPriceCents: number | null;
  terms: CatalogCourseTerm[];
  months: CourseMonth[];
};

/**
 * One plan choice, as its own tappable CARD rather than a line in a stacked
 * list of buttons — sits beside its siblings in a responsive grid
 * (`.bco-plans` in `book-checkout.css`), each with its own icon, name
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
    <button type="button" className="bco-plan" onClick={onClick} aria-label={`${name} — ${price}`}>
      <span className="bco-plan__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="bco-plan__name">{name}</span>
      <span className="bco-plan__price">{price}</span>
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
      className={cn(
        'pay-choice__card',
        selected && 'pay-choice__card--on',
        owned && 'pay-choice__card--owned',
      )}
    >
      {/* A padlock and a green «اتشترى قبل كده», not just a faded card: a
          faded card reads as «مش متاح» and sends the student to ask why. */}
      {owned ? (
        <span className="pay-choice__lock" aria-hidden="true">
          <Lock className="size-4" />
        </span>
      ) : null}
      <span className="pay-choice__label">{month.title}</span>
      <span className={owned ? 'pay-choice__owned' : 'pay-choice__off'}>
        {owned
          ? copy.subscribe.monthCardOwned
          : month.lessonCount > 0
            ? arabicCount(month.lessonCount, monthLessonForms())
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
  /** Every month is already open — see `OWNED_MONTHS_SCHEMA`. The «شهر» card
   *  gives way to one sentence saying so. */
  const [coversAll, setCoversAll] = useState(false);
  const [senderPhone, setSenderPhone] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * The two payment fields' own messages — the SAME three checks `submit` has
   * always run, in the same order and the same words, shown under the field
   * they are about instead of as one line at the bottom. `error` above keeps
   * everything that is about no single field (a 409, an upload that failed).
   */
  const [fieldErrors, setFieldErrors] = useState<{ senderPhone?: string; screenshot?: string }>({});
  /** The phone-width summary is folded by default; wide screens ignore it. */
  const [summaryOpen, setSummaryOpen] = useState(false);
  /** The course's name for the summary — read off the same live catalog
   *  response the prices come from. Display only; `null` until it lands. */
  const [courseTitle, setCourseTitle] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  /* The sheet rides above an on-screen keyboard — see `useCheckoutKeyboard`. */
  useCheckoutKeyboard(rootRef);
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
  /**
   * «المحفظة» — the balance, read live with everything else when the panel
   * opens. `null` for a visitor with no session (the read 401s) and for a
   * failed read: the wallet card simply does not appear and the transfer
   * checkout is exactly what it always was.
   */
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  /**
   * ONE key for this checkout's wallet payment, minted when the panel mounts.
   * A double press or a retry after a dropped response sends the same key, and
   * the server answers with the purchase it already made instead of charging
   * again. Kept across a failed attempt on purpose: a failure that DID commit
   * (the response was lost) is then answered with its own result.
   */
  const [walletKey] = useState(newIdempotencyKey);
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
      const [mineResult, courseResult, settingsResult, ownedMonthsResult, walletResult] =
        await Promise.allSettled([
          apiGet('/api/payments/submissions/me', MY_SUBMISSIONS_SCHEMA),
          apiGet(`/api/catalog/courses/${encodeURIComponent(slug)}`, CatalogCourseDetailSchema),
          apiGet('/api/settings/public', PublicSettingsReadSchema),
          apiGet(
            `/api/payments/courses/${encodeURIComponent(courseId)}/months/mine`,
            OWNED_MONTHS_SCHEMA,
          ),
          apiGet('/api/wallet/balance', WalletBalanceSchema),
        ]);
      if (cancelled) return;

      setWalletBalance(walletResult.status === 'fulfilled' ? walletResult.value.balanceCents : null);

      if (courseResult.status === 'fulfilled') {
        const live = courseResult.value;
        setCourseTitle(live.title);
        setLivePlans({
          monthlyPriceCents: live.monthlyPriceCents,
          monthlyOnSale: live.monthlyOnSale !== false,
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
        setCoversAll(ownedMonthsResult.value.coversAll);
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
      /*
       * The link named the months — a lecture's padlock, or the «شهور جديدة
       * اتفتحت» card — so the panel opens ON them, already ticked, instead of
       * on a plan grid whose question the student has just answered by
       * pressing «الاشتراك في الشهر ده».
       */
      if (courseResult.status === 'fulfilled') {
        const live = courseResult.value;
        const owned = ownedMonthsResult.status === 'fulfilled' ? ownedMonthsResult.value : null;
        const wanted =
          live.monthlyOnSale !== false && live.monthlyPriceCents !== null && !owned?.coversAll
            ? requestedMonthIds(live.months, owned?.ownedMonthIds ?? [])
            : [];
        if (wanted.length > 0) {
          setPlan('monthly');
          setTermId(null);
          setSelectedMonthIds(wanted);
          setStep('chooseMonths');
          return;
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
  /*
   * The monthly price AS SOLD HERE — `null` when there is no month to buy.
   *
   * A course sold by curriculum month with every month closed still has its
   * price, but the «شهر» card it drew could only fail: no month to pick, and a
   * claim the server refuses after the transfer screenshot is already up. With
   * the plan off sale, the card is gone, and a course sold by month alone
   * reaches `noPlans` («لسه مش مفتوح») instead. This component is the SALE
   * and only the sale — «is the course paid?» is answered elsewhere, from the
   * price.
   */
  const monthlyPriceCents = livePlans
    ? livePlans.monthlyOnSale
      ? livePlans.monthlyPriceCents
      : null
    : cachedMonthly;
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

  /*
   * ══ The screen ═══════════════════════════════════════════════════════════
   * Everything from here down that returns JSX is layout, drawn in the same
   * frame as the book checkout (`checkout-parts.tsx`): a step bar, the body —
   * with the ONE summary beside it on a wide screen and folded above it on a
   * phone — and a footer OUTSIDE the scrolling body that holds the total and
   * the action, so it never sits on a field. It reads the state above and calls
   * the handlers below; it decides nothing about what is sold or sent.
   *
   * `ref={rootRef}` is on the same element in every branch, so the keyboard
   * hook finds the dialog from the very first paint (`checking`).
   */
  function frame(
    current: number,
    main: ReactNode,
    footer?: ReactNode,
    summary?: ReactNode,
  ) {
    return (
      <div ref={rootRef} className="bco bco--course" data-step={step}>
        <CheckoutSteps
          label={copy.subscribe.stepsLabel}
          stops={[copy.subscribe.stepPlan, copy.subscribe.stepPay, copy.subscribe.stepConfirm]}
          current={current}
        />
        <div className="bco__scroll">
          <div className={cn('bco__layout', summary ? 'bco__layout--split' : null)}>
            <div className="bco__main">{main}</div>
            {summary ?? null}
          </div>
        </div>
        {footer ?? null}
      </div>
    );
  }

  /** «رجوع» / «تمام» out of the panel — only where there is somewhere to go
   *  (see `onCancel`: the subscribe PAGE passes none). */
  const closeButton = (label: string) =>
    onCancel ? (
      <button type="button" className="bco-secondary" onClick={onCancel}>
        {label}
      </button>
    ) : null;

  if (step === 'checking') {
    return frame(
      1,
      <p className="bco-loading" role="status">
        <LoaderCircle className="bco-loading__spin" size={22} aria-hidden="true" />
        {copy.subscribe.checking}
      </p>,
    );
  }

  if (step === 'pending') {
    return frame(
      3,
      <CheckoutDone
        tone="info"
        icon={<Hourglass size={30} />}
        title={copy.subscribe.pendingTitle}
        body={copy.subscribe.pendingStatus}
      />,
      onCancel ? (
        <CheckoutFooter
          primary={
            <Button type="button" className="bco-primary" onClick={onCancel}>
              {copy.subscribe.done}
            </Button>
          }
        />
      ) : undefined,
    );
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
    return frame(
      1,
      <p className="bco-unavailable" role="status">
        <TriangleAlert size={18} aria-hidden="true" />
        {hasPlan ? copy.subscribe.noNumber : copy.subscribe.noPlans}
      </p>,
      <CheckoutFooter
        secondary={closeButton(copy.subscribe.back)}
        primary={
          <Button
            type="button"
            className="bco-primary"
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
        }
      />,
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
    return requestedMonthIds(months, ownedMonthIds);
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

  /**
   * «الدفع من المحفظة» — the same plan, term and months a transfer claim would
   * carry, and no transfer. The server re-derives the price and re-checks
   * everything `submit` is checked for; this only says what was picked.
   */
  async function payFromWallet() {
    if (!plan) return;
    setError(null);
    setStep('submitting');
    try {
      const result = await apiPost('/api/payments/wallet-purchase', WalletPurchaseResultSchema, {
        courseId,
        plan,
        termId,
        monthIds: selectedMonthIds,
        idempotencyKey: walletKey,
      });
      setWalletBalance(result.balanceCents);
      setStep('walletSuccess');
    } catch (caught) {
      const payload =
        caught instanceof ApiRequestError
          ? ((caught.payload ?? {}) as { code?: unknown; details?: { balanceCents?: unknown } })
          : {};
      if (payload.code === 'wallet_insufficient') {
        // The balance moved since the panel opened — show the live one, and
        // the card redraws as «ناقص كام» with the top-up link.
        const live = Number(payload.details?.balanceCents);
        if (Number.isFinite(live)) setWalletBalance(live);
        setError(copy.subscribe.walletInsufficient);
      } else if (payload.code === 'wallet_already_owned') {
        setError(copy.subscribe.walletOwned);
      } else if (caught instanceof ApiRequestError && caught.status === 409) {
        setError(copy.subscribe.alreadyPending);
      } else {
        setError(copy.subscribe.walletGeneric);
      }
      setStep('form');
    }
  }

  async function submit() {
    if (!plan) return;
    const normalizedPhone = normalizeEgyptianPhone(senderPhone);
    // The same three checks, in the same order, with the same words — each
    // reported under its own field, and the cursor put in the first one.
    const errors: { senderPhone?: string; screenshot?: string } = {};
    if (!senderPhone.trim()) errors.senderPhone = copy.subscribe.senderPhoneRequired;
    else if (!normalizedPhone) errors.senderPhone = copy.subscribe.senderPhoneInvalid;
    if (!file) errors.screenshot = copy.subscribe.screenshotRequired;
    setFieldErrors(errors);
    if (errors.senderPhone || errors.screenshot || !file || !normalizedPhone) {
      setError(null);
      document
        .getElementById(errors.senderPhone ? 'subscribe-sender-phone' : 'subscribe-screenshot-button')
        ?.focus();
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

  /*
   * The plan the student has picked, and the months under it — for the ONE
   * summary. Display only: every figure in it is one the steps below already
   * compute, restated in one place.
   */
  const chosenTerm = plan === 'term' ? (terms.find((term) => term.id === termId) ?? null) : null;
  // A month purchase on a course sold by curriculum month is named by its
  // months (the row under it), not by the word «شهر» — which would read as one
  // rolling month and contradict the list.
  const planName =
    plan === 'monthly'
      ? months.length > 0
        ? null
        : copy.subscribe.planMonthlyLabel
      : plan === 'yearly'
        ? copy.subscribe.planYearlyLabel
        : plan === 'term'
          ? (chosenTerm?.title ?? copy.subscribe.planTermLabel)
          : null;
  const chosenMonths = months.filter((month) => selectedMonthIds.includes(month.id));

  function summaryCard(amount: number | null) {
    return (
      <CheckoutSummary
        title={copy.subscribe.summaryTitle}
        icon={<GraduationCap size={16} />}
        toggleLabel={copy.subscribe.summaryDetails}
        open={summaryOpen}
        onToggle={() => setSummaryOpen((open) => !open)}
      >
        {courseTitle ? <p className="bco-sum__course">{courseTitle}</p> : null}
        <dl className="bco-sum__rows">
          {planName ? (
            <div className="bco-sum__row">
              <dt>{copy.subscribe.summaryPlan}</dt>
              <dd>{planName}</dd>
            </div>
          ) : null}
          {chosenMonths.length > 0 ? (
            <div className="bco-sum__row bco-sum__row--stack">
              <dt>{copy.subscribe.summaryMonths}</dt>
              <dd>
                <ul className="bco-sum__chips">
                  {chosenMonths.map((month) => (
                    <li key={month.id} className="bco-sum__chip">
                      {month.title}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}
          {amount !== null && amount > 0 ? (
            <div className="bco-sum__row bco-sum__row--total">
              <dt>{copy.subscribe.summaryAmount}</dt>
              <dd>
                <Money cents={amount} />
              </dd>
            </div>
          ) : null}
        </dl>
      </CheckoutSummary>
    );
  }

  if (step === 'walletSuccess') {
    return frame(
      4,
      <CheckoutDone
        tone="success"
        icon={<CircleCheck size={34} />}
        title={copy.subscribe.walletSuccessTitle}
        body={formatCopy(copy.subscribe.walletSuccess, { balance: formatEGPExact(walletBalance ?? 0) })}
      >
        <a href={`/library/${encodeURIComponent(slug)}`} className="wl-btn wl-btn--primary bco-done__cta">
          {copy.subscribe.walletSuccessOpen}
        </a>
      </CheckoutDone>,
      onCancel ? <CheckoutFooter secondary={closeButton(copy.subscribe.done)} /> : undefined,
    );
  }

  if (step === 'success') {
    return frame(
      4,
      <CheckoutDone
        tone="success"
        icon={<CircleCheck size={34} />}
        title={copy.subscribe.successTitle}
        body={copy.subscribe.success}
      />,
      onCancel ? (
        <CheckoutFooter
          primary={
            <Button type="button" className="bco-primary" onClick={onCancel}>
              {copy.subscribe.done}
            </Button>
          }
        />
      ) : undefined,
    );
  }

  if (step === 'choose') {
    // The cheapest open term's price — the only number a course selling
    // SEVERAL terms can show before the student picks one. `Math.min` over
    // an empty array is `Infinity`, but this branch never runs on an empty
    // `terms` (see the `terms.length > 1` guard below).
    const cheapestTermCents =
      terms.length > 1 ? Math.min(...terms.map((term) => term.priceCents)) : null;
    // A course sold by curriculum month, to somebody whose subscription already
    // opens every month: the «شهر» card could only lead to a grid of padlocks.
    const monthCardCovered = coversAll && months.length > 0;

    return frame(
      1,
      <div className="bco-stack">
        {rejection ? (
          <p className="bco-note bco-note--err">
            {copy.subscribe.rejectedStatus}
            {': '}
            {rejection}
          </p>
        ) : null}
        {previouslyLapsed ? (
          <p className="bco-note bco-note--warn">{copy.subscribe.previouslySubscribedLapsed}</p>
        ) : null}
        {monthCardCovered ? <p className="bco-note bco-note--ok">{copy.subscribe.coversAllNote}</p> : null}
        <section className="bco-card" aria-labelledby="bco-plans-title">
          <h3 id="bco-plans-title" className="bco-heading">
            {copy.subscribe.choosePlan}
          </h3>
          <div className="bco-plans">
            {monthlyPriceCents !== null && !monthCardCovered ? (
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
        </section>
      </div>,
      onCancel ? <CheckoutFooter secondary={closeButton(copy.subscribe.back)} /> : undefined,
    );
  }

  if (step === 'chooseMonths') {
    const nothingChosen = selectedMonthIds.length === 0;

    return frame(
      1,
      <section className="bco-card" aria-labelledby="bco-months-title">
        <h3 id="bco-months-title" className="bco-heading">
          {copy.subscribe.chooseMonthsTitle}
        </h3>
        {/* Says the thing that is actually new. A student who subscribed last
            year reads «شهر» as thirty days, and every screen after this one
            would quietly confirm it. */}
        <p className="bco-lead">{copy.subscribe.chooseMonthsHint}</p>

        {/* `.pay-choice__grid` for the cards' selected state (see `MonthCard`),
            re-flowed by `.bco-months` so a month title — a phrase, not a word —
            gets the width it needs. */}
        <div className="pay-choice__grid bco-months">
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
      </section>,
      /*
       * The running total and the CTA live in the footer, which never scrolls:
       * twelve month cards is a list you scroll, and both are things the
       * student needs WHILE scrolling, not after.
       *
       * The total replaces itself with `monthsRequired` at zero rather than
       * printing «الإجمالي: 0 جنيه» beside a dead button — that is the slot
       * where the eye already is, so it is where the reason belongs.
       */
      <CheckoutFooter
        total={
          nothingChosen ? (
            <p className="bco-total__hint">{copy.subscribe.monthsRequired}</p>
          ) : (
            <p className="bco-total__line">
              {formatCopy(copy.subscribe.monthsTotal, {
                price: formatEGP(selectedMonthsTotalCents),
              })}
            </p>
          )
        }
        secondary={
          <button type="button" className="bco-secondary" onClick={() => setStep('choose')}>
            {copy.subscribe.back}
          </button>
        }
        primary={
          <Button
            type="button"
            className="bco-primary"
            onClick={() => setStep('form')}
            disabled={nothingChosen}
          >
            {copy.subscribe.monthsContinue}
            <ArrowLeft size={17} aria-hidden="true" />
          </Button>
        }
      />,
      nothingChosen ? undefined : summaryCard(selectedMonthsTotalCents),
    );
  }

  if (step === 'chooseTerm') {
    return frame(
      1,
      <section className="bco-card" aria-labelledby="bco-terms-title">
        <h3 id="bco-terms-title" className="bco-heading">
          {copy.subscribe.chooseTermTitle}
        </h3>
        <div className="bco-plans">
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
      </section>,
      <CheckoutFooter
        secondary={
          <button type="button" className="bco-secondary" onClick={() => setStep('choose')}>
            {copy.subscribe.back}
          </button>
        }
      />,
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

  return frame(
    2,
    <div className="bco-stack">
      {amountCents !== null ? (
        <AmountCard
          icon={<Wallet size={22} />}
          label={copy.subscribe.payAmountLabel}
          value={formatCopy(copy.subscribe.priceLine, { price: formatEGP(amountCents) })}
          digits={String(Math.round(amountCents / 100))}
          copyLabel={copy.subscribe.copyAmount}
          copiedLabel={copy.subscribe.copied}
        />
      ) : null}

      {/*
        «الدفع من المحفظة» — asked FIRST when there is money in the wallet, and
        only then: a student with an empty wallet sees the checkout exactly as
        it always was. Hidden once a rail is picked — the student has answered
        «بالتحويل» by then.
      */}
      {!railConfirmed && walletBalance !== null && walletBalance > 0 && amountCents !== null ? (
        <WalletPayCard
          balanceCents={walletBalance}
          priceCents={amountCents}
          paying={submitting}
          onPay={payFromWallet}
          topupHref={`/wallet?amount=${Math.max(0, amountCents - walletBalance)}&back=${encodeURIComponent(
            `/courses/${slug}/subscribe`,
          )}`}
        />
      ) : null}

      {/*
        ⚠️ The rail question comes BEFORE anything with a number on it, and it
        replaces the steps below rather than sitting above them. Rendering the
        chooser beside the number would put a transfer number on screen while
        the student is still deciding which app to open — which is the exact
        confusion this step exists to remove.
      */}
      {!railConfirmed ? (
        <div className="bco-card bco-card--rails">
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
        </div>
      ) : (
        <ol className="bco-paysteps">
          <PayStep n={1}>
            <div className="bco-paystep__head">
              {/* Names the chosen rail in words — the number below belongs to
                  it and to nothing else (see `railNumber`). */}
              <p className="bco-paystep__title">{formatCopy(copy.subscribe.payStepSend, { rail: railName })}</p>
              <button
                type="button"
                className="bco-link"
                onClick={() => setRailConfirmed(false)}
                disabled={submitting}
              >
                {copy.subscribe.railChange}
              </button>
            </div>
            <div className="bco-number">
              <PaymentBrand rail={rail ?? 'instapay'} className="bco-number__brand" />
              <bdi dir="ltr" className="bco-number__value">
                {localNumber}
              </bdi>
              <CopyButton
                text={localNumber}
                label={copy.subscribe.copyNumber}
                copiedLabel={copy.subscribe.copied}
                solid
              />
            </div>
          </PayStep>

          <PayStep n={2}>
            <CheckoutField
              id="subscribe-sender-phone"
              label={copy.subscribe.senderPhoneLabel}
              error={fieldErrors.senderPhone}
            >
              <Input
                id="subscribe-sender-phone"
                className="bco-input bco-input--ltr"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                dir="ltr"
                placeholder="01xxxxxxxxx"
                invalid={Boolean(fieldErrors.senderPhone)}
                aria-describedby={fieldErrors.senderPhone ? 'subscribe-sender-phone-error' : undefined}
                value={senderPhone}
                onChange={(event) => {
                  setSenderPhone(event.target.value);
                  setFieldErrors((current) => ({ ...current, senderPhone: undefined }));
                }}
                disabled={submitting}
              />
            </CheckoutField>
          </PayStep>

          <PayStep n={3}>
            <CheckoutField
              id="subscribe-screenshot"
              label={copy.subscribe.screenshotLabel}
              error={fieldErrors.screenshot}
              hint={formatCopy(copy.subscribe.screenshotHint, { rail: railName })}
            >
              <input
                ref={fileInputRef}
                id="subscribe-screenshot"
                type="file"
                /* `image/*`, not the API's allowlist.

                   The narrow list greyed out a real share of the photo library
                   on iOS, where pictures are HEIC and HEIC is not on that
                   allowlist — the student taps a screenshot that is visibly
                   there and the picker refuses to hand it over.

                   Safe to widen because the upload no longer sends what the
                   picker returns: `compressImage` re-encodes to JPEG first, and
                   the API's own allowlist is still the gate. Same value the
                   homework picker has always used. */
                accept="image/*"
                onChange={(event) => {
                  handleFileChange(event);
                  setFieldErrors((current) => ({ ...current, screenshot: undefined }));
                }}
                disabled={submitting}
                className="sr-only"
              />
              <button
                id="subscribe-screenshot-button"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={submitting}
                aria-describedby={fieldErrors.screenshot ? 'subscribe-screenshot-error' : undefined}
                className={cn('bco-upload', previewUrl && 'bco-upload--filled')}
              >
                {previewUrl ? (
                  // A plain `<img>`, deliberately: this is a local `blob:`
                  // preview of the student's own pick, never a remote asset, so
                  // `next/image`'s optimizer has nothing to do here.
                  <img src={previewUrl} alt="" className="bco-upload__preview" />
                ) : (
                  <span className="bco-upload__icon" aria-hidden="true">
                    <ImagePlus size={24} strokeWidth={2} />
                  </span>
                )}
                <span className="bco-upload__text">
                  <span className="bco-upload__name">{file ? file.name : copy.subscribe.screenshotPlaceholder}</span>
                  {file ? <span className="bco-upload__change">{copy.subscribe.screenshotChange}</span> : null}
                </span>
              </button>
            </CheckoutField>
          </PayStep>
        </ol>
      )}
    </div>,
    <CheckoutFooter
      error={error}
      total={
        amountCents !== null ? (
          <FooterTotal label={copy.subscribe.totalLabel} value={<Money cents={amountCents} />} />
        ) : undefined
      }
      secondary={
        <button
          type="button"
          className="bco-secondary"
          // Back to whichever picker this claim came through — see
          // `stepBeforeForm` for why it is never the plan grid.
          onClick={() => setStep(stepBeforeForm())}
          disabled={submitting}
        >
          {copy.subscribe.back}
        </button>
      }
      primary={
        railConfirmed ? (
          <Button type="button" className="bco-primary" onClick={submit} disabled={submitting}>
            {submitting ? (
              <>
                <LoaderCircle className="bco-loading__spin" size={17} aria-hidden="true" />
                {copy.subscribe.submitting}
              </>
            ) : (
              <>
                {copy.subscribe.submit}
                <ArrowLeft size={17} aria-hidden="true" />
              </>
            )}
          </Button>
        ) : null
      }
    />,
    summaryCard(amountCents),
  );
}
