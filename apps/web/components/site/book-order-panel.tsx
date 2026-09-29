'use client';

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleCheck,
  Copy,
  ImagePlus,
  LoaderCircle,
  MapPin,
  PackageCheck,
  Pencil,
  ShoppingBag,
  TriangleAlert,
  Truck,
  UserRound,
  Wallet,
} from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { normalizeEgyptianPhone } from '@ayman/contracts/phone';
import { TaxonomySchema, type Taxonomy } from '@ayman/contracts/taxonomy';
import { BookOrderSchema, type BookOrder } from '@ayman/contracts/book-orders';
import {
  bookShippingCentsFor,
  bookShippingZoneOf,
  minBookShippingCents,
  type BookShippingRates,
  type BookShippingZone,
} from '@ayman/contracts/books';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';
import { Textarea } from '@ayman/ui/components/textarea';
import { cn } from '@ayman/ui/lib/cn';
import { ApiRequestError, apiGet, apiPost } from '@/lib/api';
import { duplicateOrderFrom, whereIs, type DuplicateTwin } from '@/lib/duplicate-order';
import { uploadBookOrderScreenshot } from '@/lib/upload-client';
import { formatEGP } from '@/lib/price';
import {
  CART_ORDER_KEY,
  cartKeyOf,
  clearInProgressBookOrder,
  orderMatchesCart,
  readInProgressBookOrder,
  saveInProgressBookOrder,
} from '@/lib/book-order-storage';
import { PaymentBrand, type PaymentRail } from './payment-brand';
import { PaymentMethodChoice } from './payment-method-choice';
/*
 * The checkout's own stylesheet, and every rule in it reads `:root` tokens
 * only. This panel is drawn inside a Radix dialog, which portals into
 * `<body>` — outside `.site` and outside `.store-surface` — so a `--site-*`
 * token there resolves to nothing (`lib/books-dialog-tokens.test.ts`).
 * Imported HERE rather than from a route stylesheet because the panel opens
 * from four places in two route groups — `/books`, `/store`, the course page
 * and the dashboard — plus the resume page, and this is the one module all of
 * them load.
 */
import './book-checkout.css';

const c = copy.bookOrder;

/** One line of what is being bought, for the summary — display only. */
export type BookOrderSummaryLine = { title: string; quantity: number; unitCents: number };

/** The three zones, named — `books.shippingZone*`, the same words the shop's
 *  shipping card uses, so the two screens cannot describe a zone differently. */
const ZONE_NAMES: Record<BookShippingZone, string> = {
  cairo_giza: copy.books.shippingZoneNear,
  delta: copy.books.shippingZoneDelta,
  far: copy.books.shippingZoneFar,
};

/** Every field that can carry its own inline message. */
type FieldKey =
  | 'fullName'
  | 'phone'
  | 'altPhone'
  | 'governorateCode'
  | 'city'
  | 'addressStreet'
  | 'senderPhone'
  | 'screenshot';

/** Where focus goes when a field is the first one wrong. */
const FIELD_IDS: Record<FieldKey, string> = {
  fullName: 'book-order-full-name',
  phone: 'book-order-phone',
  altPhone: 'book-order-alt-phone',
  governorateCode: 'book-order-governorate',
  city: 'book-order-city',
  addressStreet: 'book-order-street',
  senderPhone: 'book-order-sender-phone',
  screenshot: 'book-order-screenshot-button',
};

/**
 * A price the way the checkout prints it: the figure, then a smaller «ج».
 *
 * `<bdi>` around the figure — a Latin-digit run inside Arabic, grouped with
 * «٬» by `formatEGP` — so it can never be reordered against the unit or the
 * words beside it.
 *
 * ⚠️ Deliberately NOT `bookOrder.priceLine` («٣٠٠ جنيه»). That string is the
 * payment step's headline figure and is printed there exactly once; the
 * footer and the summary carry the same number in this split form.
 */
function Money({ cents }: { cents: number }) {
  return (
    <>
      <bdi className="bco-money">{formatEGP(cents)}</bdi>{' '}
      <span className="bco-money__unit">{copy.books.currencyShort}</span>
    </>
  );
}

/** `+201021196367` → `٠١٠٢١١٩٦٣٦٧`-shaped local digits — same helper
 *  `SubscribePanel` uses for the same Vodafone Cash number. */
function localEgyptianDigits(e164: string): string {
  return e164.replace(/^\+20/, '0');
}

type Step = 'checking' | 'address' | 'payment' | 'submitting' | 'success' | 'alreadyOrdered';

/**
 * الكتاب الورقي — ordering the printed textbook of a course that has one.
 *
 * Two steps: an ADDRESS form, saved to the database the moment it is
 * submitted (before any payment exists — see `BookOrdersService.create`),
 * then the exact same payment UI `SubscribePanel` uses — the rail question
 * and the transfer details behind it. A
 * student who abandons after step one already left a real, visible row for
 * an admin — see the `BookOrder` model doc for why that is the point.
 *
 * ## Guest checkout needs no `onUnauthorized` any more
 *
 * `POST /api/book-orders` and `POST /api/book-orders/:id/payment` are
 * `@Public()` now — a signed-out visitor's submit never 401s, so there is no
 * "redirect to login" branch left to react to. `CourseStartButton`'s own
 * 401→login redirect is unrelated and untouched: enrolling in a course still
 * requires an account, ordering its book does not (Ayman: "a different
 * service").
 *
 * ## Resuming across a closed tab
 *
 * A guest who finishes the address step but closes the tab before paying has
 * a real `BookOrder` row (`status: 'address_only'`) with nothing tying it to
 * them but its own id — no account, no session. `saveInProgressBookOrder`
 * remembers `{courseId, bookOrderId}` in `localStorage` the moment that row
 * is created; on mount, this panel checks for that id and — if the order is
 * still `address_only` — jumps straight to the payment step instead of
 * re-asking for an address already on file. An order that turns out to be
 * `paid`/`shipped` already (finished on a previous visit, or by an account
 * this browser is no longer signed into) shows `alreadyOrdered` instead of
 * silently re-showing a payment step there is nothing left to pay for. The
 * entry is cleared the moment payment actually succeeds, and also when a
 * remembered id turns out to be stale — see `lib/book-order-storage.ts`.
 *
 * ## واستئناف تاني، من «كتبي»
 *
 * `resumeOrderId` بيعدّي على اللوكال ستوريج خالص. الحالة مختلفة: الطالب داخل
 * بحسابه وبيبصّ على طلب مربوط بيه، فالمعرّف جاي من السيرفر. شوف البروب نفسه.
 *
 * ## The screen (2026-09-29 redesign — layout only)
 *
 * «بوكسات جوه بوكسات، رمادي، ومفيش إحساس بخطوات». So, one frame for every
 * step: a step bar (الطلب · العنوان · الدفع), ONE order summary — beside the
 * form when there is room, folded above it on a phone — and a footer that holds
 * the total and the one action, OUTSIDE the scrolling body so it never sits on
 * a field. Inside a dialog (`.bco-dialog`) the frame fills it; on the resume
 * page it is a card in the page.
 *
 * ⚠️ Nothing below the render changed what is sent or when: the same checks
 * gate the same two POSTs, with the same fields. The checks now report per
 * field instead of one line at the bottom, and that is the whole difference.
 */
export function BookOrderPanel({
  courseId,
  items,
  itemsCents,
  shippingRates,
  instapay,
  vodafoneCash,
  resumeOrderId,
  summaryLines,
  onCancel,
}: {
  /**
   * The course-book flow: this course's own printed textbook, one copy.
   *
   * Exactly one of `courseId` and `items` — the API enforces the same rule on
   * the payload (`CreateBookOrderSchema`'s own refinement), so this is the
   * client half of one decision rather than a second, softer version of it.
   */
  courseId?: string;
  /** «قسم الكتب»: a basket. Ids and quantities only — the server prices it. */
  items?: readonly { bookId: string; quantity: number }[];
  /**
   * The BOOKS only, with no delivery in it.
   *
   * ⚠️ It used to be `amountCents` — books plus delivery, totalled by each
   * caller. That stopped being possible when delivery became zoned: neither
   * caller knows where the parcel is going, because the governorate is chosen
   * on THIS form. A total computed before the address is a total that is wrong
   * for two of the three zones, and «الكتاب بـ١٥٠ والشحن ٨٠» followed by a form
   * that asks for ٣٠٠ is exactly the surprise the breakdown exists to prevent.
   *
   * So the panel owns the quote now: it holds `governorateCode`, so it is the
   * only place that can say what delivery costs, and it says so the instant the
   * select changes. This is still what the person was TOLD and never what they
   * are charged — the server reprices the basket and re-derives the fee from
   * the same table when the order is written.
   */
  itemsCents: number;
  /** The three zone rates, from `GET /api/books`. See `bookShippingCentsFor`. */
  shippingRates: BookShippingRates;
  /** E.164, or `null` when the admin has not configured one yet. */
  instapay: string | null;
  /** The wallet number — a second live destination, see `ContactSchema`. */
  vodafoneCash: string | null;
  /**
   * طلب موجود بالفعل، نكمّله — «كمّل الدفع» من «كتبي».
   *
   * لما تتبعت، اللوكال ستوريج مابيتقراش خالص: الطالب داخل بحسابه وبيبصّ على
   * طلبه هو، فالمعرّف وصل من السيرفر مش من المتصفح. ودي الفرق بين الحالتين:
   *
   * - **الاستئناف القديم** (زائر قفل التاب) — الطلب مالوش صاحب غير معرّفه،
   *   واللوكال ستوريج هو الحبل الوحيد. شغّال زي ما هو ومالمسّتوش.
   * - **ده** — الطالب مسجّل والطلب مربوط بحسابه. صف بيقول «لسه ماتدفعش»
   *   وتحته مفيش زرار كان بيخلّي الجملة دي بلا معنى، وده اللي اتشكى منه.
   *
   * الباب نفسه كان موجود من الأول: `POST /api/book-orders/:id/payment` بيحرّك
   * الطلب من `address_only` لـ`paid`. اللي كان ناقص هو اللينك ليه.
   */
  resumeOrderId?: string;
  /**
   * What is being bought, for the summary — DISPLAY ONLY, never sent.
   *
   * Before an order exists the panel knows ids and quantities (`items`) or a
   * course id, not titles. The caller does, so it hands them over; once the
   * order row is back its own frozen lines replace these. It used to be a
   * second summary box the CALLER drew above the panel — «ملخص مكرر مرتين».
   */
  summaryLines?: readonly BookOrderSummaryLine[];
  onCancel: () => void;
}) {
  /*
   * What `localStorage` remembers this in-progress order under.
   *
   * The course flow keys on the course, as it always has — one unfinished order
   * per course, resumable from that course's page. The shop keys on a single
   * `CART_ORDER_KEY`: a basket is not "for" any one thing, and a second
   * unfinished basket should replace the first rather than accumulate keys
   * nobody will ever read again. See `book-order-storage.ts`.
   */
  const storageKey = courseId ?? CART_ORDER_KEY;
  /* The shop's basket, comparable — `null` on the course flow and on «كتبي»,
     where the order to resume is the one asked for. See `orderMatchesCart`. */
  const cartKey = items && resumeOrderId === undefined ? cartKeyOf(items) : null;

  // Only used once, on the success path — see the ⚠️ there.
  const router = useRouter();

  const [step, setStep] = useState<Step>('checking');
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [order, setOrder] = useState<BookOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Which copy button just worked — the number or the amount. */
  const [copied, setCopied] = useState<'number' | 'amount' | null>(null);
  /**
   * One message per field, instead of one line at the bottom naming the first
   * wrong field while the reader looks at the field. Same checks, same order,
   * same words — see `addressErrors` and `submitPayment`.
   */
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  /** The phone-width summary is folded by default; wide screens ignore it. */
  const [summaryOpen, setSummaryOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  /**
   * «هتحوّل بإيه؟» — same two-state shape as the course panel. Nothing is
   * preselected: a default is a choice the student did not make, and this one
   * decides where their money goes. `railConfirmed` is separate from
   * `rail !== null` so going back keeps the previous answer lit.
   */
  const [rail, setRail] = useState<PaymentRail | null>(null);
  const [railConfirmed, setRailConfirmed] = useState(false);

  // Address fields.
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [altPhone, setAltPhone] = useState('');
  const [governorateCode, setGovernorateCode] = useState('');
  /*
   * ── الشحن على حسب المحافظة، حيّ ────────────────────────────────────────
   *
   * `null` until a governorate is picked, and that is a THIRD state rather than
   * a zero: «٠ ج» reads as free delivery, and the honest answer before the
   * select is touched is «على حسب المحافظة» — which is also the sentence that
   * stops «ليه الرقم اتغيّر؟» when the total moves a line later.
   *
   * ⚠️ It is what the reader is TOLD, never what they are charged. The server
   * re-derives the fee from the same table off the governorate on the saved
   * row, so a tampered client changes the sentence on its own screen and
   * nothing else. Same rule the book prices follow.
   */
  const shippingQuoteCents = governorateCode
    ? bookShippingCentsFor(governorateCode, shippingRates)
    : null;
  const quotedTotalCents = itemsCents + (shippingQuoteCents ?? 0);
  const [city, setCity] = useState('');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressBuilding, setAddressBuilding] = useState('');
  const [addressNote, setAddressNote] = useState('');
  const [savingAddress, setSavingAddress] = useState(false);
  /** The server said this phone already has a finished order for these books. */
  const [duplicatePrompt, setDuplicatePrompt] = useState(false);
  /** The existing order the 409 named — its status and reference, for the
   *  «طلبك القديم» line. Null when the body could not be read. */
  const [duplicateTwin, setDuplicateTwin] = useState<DuplicateTwin | null>(null);

  // Payment fields — identical shape to `SubscribePanel`.
  const [senderPhone, setSenderPhone] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const numberInputRef = useRef<HTMLInputElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /*
   * ── The on-screen keyboard ─────────────────────────────────────────────
   *
   * On a phone the dialog is a sheet pinned to the bottom of the LAYOUT
   * viewport, and neither iOS Safari nor Chrome (whose default is now
   * `resizes-visual`) shrinks that viewport for the keyboard — they shrink
   * the VISUAL one. So a keyboard opened for «الشارع» slid up over the sheet's
   * footer and the lower fields, and the pinned total sat on the very input
   * being typed into.
   *
   * This lifts the sheet to sit on top of the keyboard and caps it to the
   * visible height: the footer stays in view, the body scrolls, and the
   * browser scrolls the focused field into that body. Written as custom
   * properties on the dialog (`.bco-dialog[data-keyboard]` in the stylesheet)
   * rather than inline geometry, so the dialog's own layout is untouched the
   * rest of the time. Nothing happens outside a dialog, or on a desktop.
   */
  useEffect(() => {
    const host = rootRef.current?.closest<HTMLElement>('.bco-dialog');
    const viewport = typeof window === 'undefined' ? null : window.visualViewport;
    if (!host || !viewport) return;
    const clear = () => {
      host.style.removeProperty('--bco-kb');
      host.style.removeProperty('--bco-vvh');
      host.style.removeProperty('--bco-vvtop');
      delete host.dataset.keyboard;
    };
    const update = () => {
      const covered = window.innerHeight - (viewport.offsetTop + viewport.height);
      // 80px: a keyboard, not a collapsing URL bar.
      if (covered > 80) {
        host.style.setProperty('--bco-kb', `${Math.round(covered)}px`);
        host.style.setProperty('--bco-vvh', `${Math.round(viewport.height)}px`);
        host.style.setProperty('--bco-vvtop', `${Math.round(viewport.offsetTop)}px`);
        host.dataset.keyboard = 'open';
      } else {
        clear();
      }
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      clear();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    let cancelled = false;
    apiGet('/api/taxonomy', TaxonomySchema)
      .then((value) => {
        if (!cancelled) setTaxonomy(value);
      })
      .catch(() => {
        // The governorate select just stays empty — the form's own
        // `required` still stops a submit with nothing chosen.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Starts every mount at `checking` (not synchronously reading
  // `localStorage` into the initial `useState`) so the server-rendered
  // markup and the client's first render always agree — only THIS effect,
  // which runs after hydration, ever branches on what this browser remembers.
  //
  // State is only ever set from inside the promise callbacks below, never
  // synchronously in the effect body (`react-hooks/set-state-in-effect`) —
  // same convention `submit-dialog.tsx`'s own preflight effect follows. The
  // "nothing stored" case is folded into the same chain via
  // `Promise.resolve(null)` rather than an early `setStep` + `return`, so
  // there is exactly one place that decides the resolved step.
  useEffect(() => {
    let cancelled = false;
    /* المعرّف الصريح بيغلب اللوكال ستوريج: الطالب طالب الطلب ده بالذات من
       «كتبي»، فقراية حاجة تانية من المتصفح كانت هتفتحله طلب غيره. */
    const storedOrderId = resumeOrderId ?? readInProgressBookOrder(storageKey);
    const lookup = storedOrderId
      ? apiGet(`/api/book-orders/${storedOrderId}`, BookOrderSchema)
      : Promise.resolve(null);

    lookup
      .then((fetched) => {
        if (cancelled) return;
        if (!fetched) {
          setStep('address');
          return;
        }
        /*
         * ⚠️ A remembered order for a DIFFERENT basket is not resumed — see
         * `orderMatchesCart`. Its address is still prefilled below, so the
         * student presses «التالي» once and gets an order for what is in the
         * basket now; the old unpaid one stays `address_only` in the queue.
         */
        const otherBasket = cartKey !== null && !orderMatchesCart(fetched.items, cartKey);
        if (!otherBasket) setOrder(fetched);
        if (fetched.status === 'address_only') {
          /*
           * ⚠️ The ADDRESS step, not the payment one, and the prefill below is
           * what makes that affordable.
           *
           * This used to resume straight at payment, on the reasoning that the
           * address was already given and re-asking for it is friction. What
           * that produced in practice: press «اطلب الكتاب» and land on a
           * Vodafone number and a screenshot uploader, with nothing on the
           * screen saying WHERE the parcel is going or that an address was ever
           * entered. «المفروض لما أضغط على طلب الكتاب الأول أكتب العنوان بتاعي
           * وكده.» The way back existed — «رجوع» sets this same step — but a
           * control labelled "back" does not read as "review your address", so
           * the saved address was effectively invisible.
           *
           * Now the first screen is always the one that says where it is going,
           * already filled in, and «التالي — الدفع» is one press away.
           * `submitAddress` reuses this order untouched when nothing changed,
           * so opening here costs no extra row.
           */
          setFullName(fetched.fullName);
          setPhone(fetched.phone);
          setAltPhone(fetched.altPhone);
          setGovernorateCode(fetched.governorateCode);
          setCity(fetched.city);
          setAddressStreet(fetched.addressStreet);
          setAddressBuilding(fetched.addressBuilding ?? '');
          setAddressNote(fetched.addressNote ?? '');
          /*
           * ⚠️ PAYMENT, not the address form — and the summary line on that
           * screen is what makes it affordable.
           *
           * The history here runs both ways and both complaints are real. It
           * resumed at payment once, and a student landed on a transfer number
           * with nothing saying WHERE the parcel was going: «المفروض لما أضغط
           * على طلب الكتاب الأول أكتب العنوان بتاعي وكده». So it was moved to
           * the prefilled address form — and then «هو مش عايز يقعد يكتب العنوان
           * مرة تانية»: a student who already gave the address is made to walk
           * through it again before they can pay.
           *
           * Neither screen was wrong; the missing piece was that the address
           * was invisible on the payment step. It is now printed there with
           * «تعديل العنوان» beside it, so the parcel's destination is on screen
           * AND nobody retypes it.
           */
          setStep(otherBasket ? 'address' : 'payment');
        } else {
          // Already `paid`/`shipped` — nothing left to resume.
          clearInProgressBookOrder(storageKey);
          // …and «إنت طلبت قبل كده» is about THAT basket, not this one.
          setStep(otherBasket ? 'address' : 'alreadyOrdered');
        }
      })
      .catch(() => {
        // Stale id — 404, a reset dev database, whatever. Nothing to resume.
        if (cancelled) return;
        clearInProgressBookOrder(storageKey);
        setStep('address');
      });
    return () => {
      cancelled = true;
    };
  }, [storageKey, resumeOrderId, cartKey]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    setPreviewUrl((prevUrl) => {
      if (prevUrl) URL.revokeObjectURL(prevUrl);
      return next ? URL.createObjectURL(next) : null;
    });
    setFile(next);
  }

  // ⚠️ EITHER rail sells a book. Keeping this on InstaPay alone would close the
  // shop on a platform that takes Vodafone Cash and nothing else.
  if (!instapay && !vodafoneCash) {
    return (
      <p className="bco-unavailable" role="status">
        <TriangleAlert size={18} aria-hidden="true" />
        {c.noNumber}
      </p>
    );
  }

  /**
   * ⚠️ The number FOLLOWS the rail, with no fallback between them. A Vodafone
   * heading over an InstaPay number sends the money somewhere nothing
   * reconciles it — see the same note in `subscribe-panel.tsx`.
   */
  const railNumber = rail === 'vodafoneCash' ? vodafoneCash : rail === 'instapay' ? instapay : null;
  const localNumber = railNumber ? localEgyptianDigits(railNumber) : '';
  const railName =
    rail === 'vodafoneCash' ? copy.subscribe.railVodafoneCash : copy.subscribe.railInstapay;

  /** The amount as bare digits — what a banking app's amount field takes. */
  const payAmountCents = order?.amountCents ?? quotedTotalCents;
  const amountDigits = String(Math.round(payAmountCents / 100));

  /**
   * Clipboard first, then the hidden-input `execCommand` path — unchanged from
   * the single «نسخ الرقم» this used to be, now shared by the amount too.
   */
  async function copyText(text: string, which: 'number' | 'amount', input: HTMLInputElement | null) {
    const done = () => {
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    };
    try {
      await navigator.clipboard.writeText(text);
      done();
      return;
    } catch {
      // Fall through to the execCommand path below.
    }
    if (!input) return;
    try {
      input.focus();
      input.select();
      if (document.execCommand('copy')) done();
    } catch {
      // Both paths refused — the text is still selected on screen.
    }
  }

  function copyNumber() {
    return copyText(localNumber, 'number', numberInputRef.current);
  }

  function copyAmount() {
    return copyText(amountDigits, 'amount', amountInputRef.current);
  }

  /** A field was edited — its own message goes, the others stay. */
  function clearFieldError(key: FieldKey) {
    setFieldErrors((current) => {
      if (!(key in current)) return current;
      const { [key]: _gone, ...rest } = current;
      return rest;
    });
  }

  /** Report per field, and put the cursor in the first one that is wrong. */
  function reportFieldErrors(errors: Partial<Record<FieldKey, string>>): boolean {
    setFieldErrors(errors);
    const first = (Object.keys(errors) as FieldKey[])[0];
    if (!first) return false;
    setError(null);
    document.getElementById(FIELD_IDS[first])?.focus();
    return true;
  }

  /**
   * Is what is on screen the same address the resumed order already carries?
   *
   * Compared on the NORMALISED, trimmed values — the exact strings
   * `submitAddress` would send — so re-typing `0102 111 2222` as `01021112222`
   * is not "a change" and does not cost a second order. The two optional
   * fields collapse `''` and `null` for the same reason: the form holds an
   * empty string where the order holds a null, and they mean one thing.
   */
  function addressMatches(existing: BookOrder): boolean {
    return (
      existing.fullName === fullName.trim() &&
      existing.phone === normalizeEgyptianPhone(phone) &&
      existing.altPhone === normalizeEgyptianPhone(altPhone) &&
      existing.governorateCode === governorateCode &&
      existing.city === city.trim() &&
      existing.addressStreet === addressStreet.trim() &&
      (existing.addressBuilding ?? '') === addressBuilding.trim() &&
      (existing.addressNote ?? '') === addressNote.trim()
    );
  }

  /**
   * The address checks — the same eight, in the same order, with the same
   * messages as the chain of early returns they replace. The only difference
   * is that every failing field gets its message at once, under itself.
   */
  function addressErrors(): Partial<Record<FieldKey, string>> {
    const errors: Partial<Record<FieldKey, string>> = {};
    if (!fullName.trim()) errors.fullName = c.fullNameRequired;
    if (!phone.trim()) errors.phone = c.phoneRequired;
    else if (!normalizeEgyptianPhone(phone)) errors.phone = c.phoneInvalid;
    if (!altPhone.trim()) errors.altPhone = c.altPhoneRequired;
    else if (!normalizeEgyptianPhone(altPhone)) errors.altPhone = c.altPhoneInvalid;
    if (!governorateCode) errors.governorateCode = c.governorateRequired;
    if (!city.trim()) errors.city = c.cityRequired;
    if (!addressStreet.trim()) errors.addressStreet = c.addressStreetRequired;
    return errors;
  }

  async function submitAddress() {
    if (reportFieldErrors(addressErrors())) return;
    setError(null);

    /*
     * The order we are already holding, when this screen was opened on a
     * resumed one and nothing about the address was touched.
     *
     * Without this, opening on the address step would POST a second order every
     * single time the dialog is reopened — and there is no PATCH on
     * `/api/book-orders` (create, pay, read; see the controller), so an edit
     * genuinely is a new row. Reusing the unchanged one keeps that cost at
     * "only when the student actually changed something", which is also
     * exactly what pressing «رجوع» and re-submitting used to do.
     */
    if (order && order.status === 'address_only' && addressMatches(order)) {
      setStep('payment');
      return;
    }

    setSavingAddress(true);
    try {
      const created = await postOrder(false);
      if (created) finishAddress(created);
    } catch (cause) {
      /*
       * ⚠️ ONE code, and it is not an error: the server has seen a FINISHED
       * order for this phone with the same books inside the last week, and is
       * asking rather than refusing.
       *
       * It cannot be "did they already pay", because this platform has no
       * payment gateway and nobody verifies the transfer — «مدفوع» is a claim
       * made with a screenshot. So the question is «are you sure», and the
       * student answers it.
       */
      if (cause instanceof ApiRequestError && cause.status === 409) {
        setDuplicateTwin(duplicateOrderFrom(cause.payload));
        setDuplicatePrompt(true);
      } else {
        // No `onUnauthorized` branch — this endpoint is `@Public()`, so a
        // signed-out visitor's submit never 401s.
        setError(c.genericError);
      }
    } finally {
      setSavingAddress(false);
    }
  }

  /**
   * The POST itself, lifted out of `submitAddress` so the confirm path can
   * repeat it verbatim with the flag set. Re-normalising the phones here rather
   * than passing them in keeps the two calls provably identical — the whole
   * point is that the second request differs from the first in ONE field.
   */
  async function postOrder(confirmDuplicate: boolean) {
    return apiPost('/api/book-orders', BookOrderSchema, {
        /* Exactly one of the two reaches the wire — `CreateBookOrderSchema` is
           `.strict()` AND refines on "one, never both", so spreading whichever
           this panel was given is the only spelling that satisfies it. */
        ...(items ? { items } : { courseId }),
        fullName: fullName.trim(),
        phone: normalizeEgyptianPhone(phone),
        altPhone: normalizeEgyptianPhone(altPhone),
        governorateCode,
        city: city.trim(),
        addressStreet: addressStreet.trim(),
        addressBuilding: addressBuilding.trim() === '' ? null : addressBuilding.trim(),
        addressNote: addressNote.trim() === '' ? null : addressNote.trim(),
        confirmDuplicate,
        // This IS the checkout — see `reuseOpenOrder` in the contract.
        reuseOpenOrder: true,
      });
  }

  function finishAddress(created: BookOrder) {
    setOrder(created);
    // Remembered on THIS browser so closing the tab before paying does not
    // lose the order. ⚠️ It is no longer the only thing stopping a duplicate:
    // the SERVER now reuses this phone's own unpaid order, because this key
    // lives in one browser and half the production queue was the same person
    // starting over somewhere else.
    saveInProgressBookOrder(storageKey, created.id);
    setStep('payment');
  }

  /** «أيوه، عايز نسخة كمان» — the same POST, with the student's answer. */
  async function confirmDuplicateOrder() {
    setDuplicatePrompt(false);
    /* Cleared with the prompt. A twin left behind would be printed on the NEXT
       question this session raises, about a different order. */
    setDuplicateTwin(null);
    setSavingAddress(true);
    try {
      finishAddress(await postOrder(true));
    } catch {
      setError(c.genericError);
    } finally {
      setSavingAddress(false);
    }
  }

  async function submitPayment() {
    if (!order) return;
    const normalizedSenderPhone = normalizeEgyptianPhone(senderPhone);
    // Same three checks, same order, same words — reported per field.
    const errors: Partial<Record<FieldKey, string>> = {};
    if (!senderPhone.trim()) errors.senderPhone = c.senderPhoneRequired;
    else if (!normalizedSenderPhone) errors.senderPhone = c.senderPhoneInvalid;
    if (!file) errors.screenshot = c.screenshotRequired;
    if (reportFieldErrors(errors) || !file) return;

    setError(null);
    setStep('submitting');

    const uploaded = await uploadBookOrderScreenshot(file);
    if (!uploaded.ok) {
      setError(c.uploadError);
      setStep('payment');
      return;
    }

    try {
      await apiPost(`/api/book-orders/${order.id}/payment`, BookOrderSchema, {
        senderPhone: normalizedSenderPhone,
        screenshotKey: uploaded.value.screenshotKey,
      });
      // Finished — nothing left to resume if this tab closes now.
      clearInProgressBookOrder(storageKey);
      /*
       * And the client router cache has to hear about it. `next.config.ts` lets
       * that cache reuse a dynamic route for 30 seconds
       * (`staleTimes.dynamic`), and this order is rendered by two OTHER routes
       * — `/store/orders`, and `MyBookOrdersSection` on the dashboard. Without
       * this, a student who orders a book and taps straight to either one is
       * shown a screen with no sign of the order they just paid for, which is
       * the single most alarming thing this flow could do. `refresh()` is the
       * only call that empties it; same ⚠️ as
       * `components/player/lesson-nav.tsx`.
       */
      router.refresh();
      setStep('success');
    } catch (error) {
      /*
       * ⚠️ 409 is the ONE outcome here worth its own sentence: the receipt has
       * already been attached to another order. Everything else on this route
       * is a network blip or a server fault, and «حصل خطأ، حاول تاني» is the
       * right answer to those — but it is exactly the wrong answer to this one,
       * because trying again with the same screenshot will fail again forever
       * and the student has no way to know why.
       *
       * Branched on the STATUS rather than the body's `code`: `apiPost` throws
       * `ApiRequestError`, which keeps the status and drops the payload, and
       * this route has no other 409 to be confused with.
       */
      setError(
        error instanceof ApiRequestError && error.status === 409
          ? c.receiptAlreadyUsed
          : c.genericError,
      );
      setStep('payment');
    }
  }

  /* ══ The screen ══════════════════════════════════════════════════════════
     Everything from here down is layout. It reads the state above and calls
     the handlers above; it decides nothing about the order. */

  const onPayment = step === 'payment' || step === 'submitting';
  const submitting = step === 'submitting';
  /** 2 = address, 3 = payment, 4 = every stop behind us. «الطلب» — the basket
   *  or the book — was chosen before this dialog opened, so it is always done. */
  const currentStop = step === 'checking' || step === 'address' ? 2 : onPayment ? 3 : 4;

  /*
   * The summary's lines. The ORDER's own once it exists — a resumed order shows
   * what was actually bought, not what this session happens to hold — and the
   * caller's `summaryLines` before that.
   */
  const lines = order
    ? order.items.map((line) => ({
        title: line.titleAr,
        quantity: line.quantity,
        cents: line.unitPriceCents * line.quantity,
      }))
    : (summaryLines ?? []).map((line) => ({
        title: line.title,
        quantity: line.quantity,
        cents: line.unitCents * line.quantity,
      }));

  /*
   * The breakdown follows the same rule it always has: LIVE on the address
   * step (it moves with the governorate select), the order's FROZEN figures
   * once there is money to send — they are what the transfer has to match.
   */
  const frozen =
    order !== null && (onPayment || step === 'success' || step === 'alreadyOrdered');
  const summaryGovernorate = frozen ? order.governorateCode : governorateCode;
  const summaryZone = summaryGovernorate ? ZONE_NAMES[bookShippingZoneOf(summaryGovernorate)] : null;
  const summary = (
    <OrderSummary
      lines={lines}
      subtotalCents={frozen ? order.itemsCents : itemsCents}
      shippingCents={frozen ? order.shippingCents : shippingQuoteCents}
      zone={summaryZone}
      discountCents={frozen ? order.discountCents : 0}
      open={summaryOpen}
      onToggle={() => setSummaryOpen((open) => !open)}
    />
  );

  /** The footer's figure: a floor until a governorate is picked, then the
   *  live quote, then — once the order exists — its frozen total. */
  const footerTotal = frozen ? (
    <Money cents={order.amountCents} />
  ) : shippingQuoteCents === null ? (
    <>
      {formatCopy(copy.books.totalFrom, {
        price: formatEGP(itemsCents + minBookShippingCents(shippingRates)),
      })}{' '}
      <span className="bco-money__unit">{copy.books.currencyShort}</span>
    </>
  ) : (
    <Money cents={quotedTotalCents} />
  );
  const footerNote =
    !frozen && shippingQuoteCents === null
      ? `${copy.books.shipping} ${copy.books.shippingByGovernorate}`
      : c.totalIncludesShipping;

  let main: ReactNode;
  let footer: ReactNode = null;
  let withSummary = true;

  if (step === 'checking') {
    withSummary = false;
    main = (
      <p className="bco-loading" role="status">
        <LoaderCircle className="bco-loading__spin" size={22} aria-hidden="true" />
        {copy.common.loading}
      </p>
    );
  } else if (step === 'alreadyOrdered' || step === 'success') {
    const doneTitle = step === 'success' ? c.successTitle : null;
    main = (
      <div className={cn('bco-done', step === 'success' && 'bco-done--success')} role="status">
        <span className="bco-done__icon" aria-hidden="true">
          {step === 'success' ? <CircleCheck size={34} /> : <PackageCheck size={32} />}
        </span>
        {doneTitle ? <p className="bco-done__title">{doneTitle}</p> : null}
        <p className="bco-done__body">{step === 'success' ? c.successBody : c.alreadyOrdered}</p>
      </div>
    );
    withSummary = order !== null;
    footer = (
      <FooterBar
        total={order ? <Money cents={order.amountCents} /> : undefined}
        note={order ? c.totalIncludesShipping : undefined}
        primary={
          <Button type="button" className="bco-primary" onClick={onCancel}>
            {c.done}
          </Button>
        }
      />
    );
  } else if (step === 'address' && duplicatePrompt) {
    /*
     * ⚠️ The question REPLACES the form rather than sitting over it as a modal.
     *
     * This is the one screen where a student is deciding whether to spend money
     * twice, and a dialog floating over a filled-in form invites the reflex
     * that dismisses dialogs. One screen, one question, two answers — and the
     * safe one is the PRIMARY button, so doing nothing costs nothing.
     */
    main = (
      <div className="bco-warn">
        <span className="bco-warn__icon" aria-hidden="true">
          <TriangleAlert size={22} />
        </span>
        <div className="bco-warn__text">
          <p className="bco-warn__title">{c.duplicateTitle}</p>
          <p className="bco-warn__body">{c.duplicateBody}</p>
          {/*
            «لو راح للطباعة تقوله راح للطباعة». Without this the student is
            being asked to decide about an order they cannot see — and the one
            who cannot tell whether the first is coming is exactly the one who
            orders again. Rendered only when the 409 carried a body.
          */}
          {duplicateTwin ? (
            <p className="bco-warn__body">
              <b>{c.duplicateWhereTitle}</b> {whereIs(duplicateTwin.status)}
              {duplicateTwin.ref ? (
                <>
                  {' '}
                  {/* The label reads right to left and ONLY the reference is
                      pinned left to right — «ك-A3F92C», exactly as the shipping
                      card prints it. The whole sentence in `ltr` put the colon
                      and the label on the wrong side of it. */}
                  {c.duplicateRef.split('{ref}')[0]}
                  <bdi dir="ltr">{duplicateTwin.ref}</bdi>
                  {c.duplicateRef.split('{ref}')[1]}
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>
    );
    footer = (
      <FooterBar
        error={error}
        secondary={
          <button
            type="button"
            className="bco-secondary"
            onClick={() => void confirmDuplicateOrder()}
            disabled={savingAddress}
          >
            {c.duplicateConfirm}
          </button>
        }
        primary={
          <Button type="button" className="bco-primary" onClick={onCancel}>
            {c.duplicateCancel}
          </Button>
        }
      />
    );
  } else if (step === 'address') {
    const pinned = (taxonomy?.pinnedGovernorateCodes ?? [])
      .map((code) => taxonomy?.governorates.find((g) => g.code === code))
      .filter((g): g is Taxonomy['governorates'][number] => g !== undefined);
    const rest = (taxonomy?.governorates ?? []).filter(
      (g) => !(taxonomy?.pinnedGovernorateCodes ?? []).includes(g.code),
    );
    const governorateOptions = [...pinned, ...rest];

    main = (
      <div className="bco-stack">
        <section className="bco-card" aria-labelledby="bco-contact-title">
          <div className="bco-card__head">
            <span className="bco-card__icon" aria-hidden="true">
              <UserRound size={18} />
            </span>
            <div>
              <h3 id="bco-contact-title" className="bco-card__title">
                {c.contactTitle}
              </h3>
              <p className="bco-card__lead">{c.contactLead}</p>
            </div>
          </div>

          <div className="bco-grid">
            <Field id={FIELD_IDS.fullName} label={c.fullNameLabel} error={fieldErrors.fullName} full>
              <Input
                id={FIELD_IDS.fullName}
                className="bco-input"
                autoComplete="name"
                enterKeyHint="next"
                invalid={Boolean(fieldErrors.fullName)}
                aria-describedby={fieldErrors.fullName ? `${FIELD_IDS.fullName}-error` : undefined}
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  clearFieldError('fullName');
                }}
              />
            </Field>

            <Field id={FIELD_IDS.phone} label={c.phoneLabel} error={fieldErrors.phone}>
              <Input
                id={FIELD_IDS.phone}
                className="bco-input bco-input--ltr"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                enterKeyHint="next"
                dir="ltr"
                placeholder="01xxxxxxxxx"
                invalid={Boolean(fieldErrors.phone)}
                aria-describedby={fieldErrors.phone ? `${FIELD_IDS.phone}-error` : undefined}
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  clearFieldError('phone');
                }}
              />
            </Field>

            <Field id={FIELD_IDS.altPhone} label={c.altPhoneLabel} error={fieldErrors.altPhone}>
              <Input
                id={FIELD_IDS.altPhone}
                className="bco-input bco-input--ltr"
                type="tel"
                inputMode="tel"
                /* Not `tel`: autofill would put the SAME number here, and a
                   second number that is the first one is no second number. */
                autoComplete="off"
                enterKeyHint="next"
                dir="ltr"
                placeholder="01xxxxxxxxx"
                invalid={Boolean(fieldErrors.altPhone)}
                aria-describedby={fieldErrors.altPhone ? `${FIELD_IDS.altPhone}-error` : undefined}
                value={altPhone}
                onChange={(e) => {
                  setAltPhone(e.target.value);
                  clearFieldError('altPhone');
                }}
              />
            </Field>
          </div>
        </section>

        <section className="bco-card" aria-labelledby="bco-delivery-title">
          <div className="bco-card__head">
            <span className="bco-card__icon" aria-hidden="true">
              <MapPin size={18} />
            </span>
            <div>
              <h3 id="bco-delivery-title" className="bco-card__title">
                {c.deliveryTitle}
              </h3>
              <p className="bco-card__lead">{c.deliveryLead}</p>
            </div>
          </div>

          <div className="bco-grid">
            <Field
              id={FIELD_IDS.governorateCode}
              label={c.governorateLabel}
              error={fieldErrors.governorateCode}
            >
              <Select
                id={FIELD_IDS.governorateCode}
                className="bco-input"
                autoComplete="address-level1"
                invalid={Boolean(fieldErrors.governorateCode)}
                aria-describedby={
                  fieldErrors.governorateCode ? `${FIELD_IDS.governorateCode}-error` : undefined
                }
                value={governorateCode}
                onChange={(e) => {
                  setGovernorateCode(e.target.value);
                  clearFieldError('governorateCode');
                }}
              >
                <option value="">{c.governoratePlaceholder}</option>
                {governorateOptions.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.nameAr}
                  </option>
                ))}
              </Select>
            </Field>

            <Field id={FIELD_IDS.city} label={c.cityLabel} error={fieldErrors.city}>
              <Input
                id={FIELD_IDS.city}
                className="bco-input"
                autoComplete="address-level2"
                enterKeyHint="next"
                invalid={Boolean(fieldErrors.city)}
                aria-describedby={fieldErrors.city ? `${FIELD_IDS.city}-error` : undefined}
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  clearFieldError('city');
                }}
              />
            </Field>

            {/* Which zone the picked governorate is in, and what that zone
                costs — the answer to «ليه الشحن ١٥٠؟» before it is asked. The
                same number the summary's «الشحن» row moves to. */}
            {governorateCode && shippingQuoteCents !== null ? (
              <p className="bco-zone" aria-live="polite">
                <Truck size={16} aria-hidden="true" />
                <span className="bco-zone__name">
                  {formatCopy(c.zoneHint, { zone: ZONE_NAMES[bookShippingZoneOf(governorateCode)] })}
                </span>
                <span className="bco-zone__price">
                  {shippingQuoteCents === 0 ? copy.books.shippingFree : <Money cents={shippingQuoteCents} />}
                </span>
              </p>
            ) : null}

            <Field id={FIELD_IDS.addressStreet} label={c.addressStreetLabel} error={fieldErrors.addressStreet} full>
              <Input
                id={FIELD_IDS.addressStreet}
                className="bco-input"
                autoComplete="address-line1"
                enterKeyHint="next"
                invalid={Boolean(fieldErrors.addressStreet)}
                aria-describedby={
                  fieldErrors.addressStreet ? `${FIELD_IDS.addressStreet}-error` : undefined
                }
                value={addressStreet}
                onChange={(e) => {
                  setAddressStreet(e.target.value);
                  clearFieldError('addressStreet');
                }}
              />
            </Field>

            <Field id="book-order-building" label={c.addressBuildingLabel}>
              <Input
                id="book-order-building"
                className="bco-input"
                autoComplete="address-line2"
                enterKeyHint="next"
                value={addressBuilding}
                onChange={(e) => setAddressBuilding(e.target.value)}
              />
            </Field>

            <Field id="book-order-note" label={c.addressNoteLabel}>
              <Textarea
                id="book-order-note"
                className="bco-input bco-input--note"
                rows={2}
                autoComplete="off"
                placeholder={c.addressNotePlaceholder}
                value={addressNote}
                onChange={(e) => setAddressNote(e.target.value)}
              />
            </Field>
          </div>
        </section>
      </div>
    );

    footer = (
      <FooterBar
        error={error}
        total={footerTotal}
        note={footerNote}
        secondary={
          <button type="button" className="bco-secondary" onClick={onCancel} disabled={savingAddress}>
            {c.back}
          </button>
        }
        primary={
          <Button type="button" className="bco-primary" onClick={submitAddress} disabled={savingAddress}>
            {savingAddress ? (
              <>
                <LoaderCircle className="bco-loading__spin" size={17} aria-hidden="true" />
                {c.addressSubmitting}
              </>
            ) : (
              <>
                {c.addressSubmit}
                <ArrowLeft size={17} aria-hidden="true" />
              </>
            )}
          </Button>
        }
      />
    );
  } else {
    // `payment` / `submitting`.
    main = (
      <div className="bco-stack">
        {/*
          The figure to send, first and largest, with its own copy button —
          priced from the ORDER's own frozen total once it exists (by this step
          it always does); the fallback is the live quote, reachable only in the
          instant between the address saving and the row coming back.
        */}
        <div className="bco-amount">
          <span className="bco-amount__icon" aria-hidden="true">
            <Wallet size={22} />
          </span>
          <div className="bco-amount__text">
            <p className="bco-amount__label">{c.payAmountLabel}</p>
            <p className="bco-amount__value">
              {formatCopy(c.priceLine, { price: formatEGP(payAmountCents) })}
            </p>
          </div>
          <button type="button" className="bco-copy" onClick={() => void copyAmount()}>
            {copied === 'amount' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
            {copied === 'amount' ? copy.subscribe.copied : c.copyAmount}
          </button>
          <input
            ref={amountInputRef}
            readOnly
            dir="ltr"
            value={amountDigits}
            aria-hidden="true"
            tabIndex={-1}
            className="sr-only"
          />
        </div>

        {/*
          ⚠️ WHERE THE PARCEL IS GOING, on the screen that asks for money — the
          reason resuming can land here instead of on the address form. From
          `order`, not the form state: after a resume those can differ, and the
          parcel follows the server's copy.
        */}
        {order ? (
          <div className="bco-recap">
            <span className="bco-recap__icon" aria-hidden="true">
              <MapPin size={17} />
            </span>
            <div className="bco-recap__text">
              <p className="bco-recap__label">{c.deliverTo}</p>
              <p className="bco-recap__value">
                {[
                  order.fullName,
                  taxonomy?.governorates.find((g) => g.code === order.governorateCode)?.nameAr ??
                    order.governorateCode,
                  order.city,
                  order.addressStreet,
                ]
                  .filter(Boolean)
                  .join(c.itemSeparator)}
              </p>
            </div>
            <button
              type="button"
              className="bco-link"
              onClick={() => setStep('address')}
              disabled={submitting}
            >
              <Pencil size={14} aria-hidden="true" />
              {c.editAddress}
            </button>
          </div>
        ) : null}

        {/* The rail question comes before anything carrying a number — see the
            note in `subscribe-panel.tsx`. */}
        {!railConfirmed ? (
          <div className="bco-card bco-card--rails">
            <PaymentMethodChoice
              value={rail}
              // One tap: pick the rail AND move on — see `PaymentMethodChoice`.
              onChange={(next) => {
                setRail(next);
                setRailConfirmed(true);
              }}
              available={{ instapay: Boolean(instapay), vodafoneCash: Boolean(vodafoneCash) }}
            />
          </div>
        ) : (
          <ol className="bco-paysteps">
            <li className="bco-paystep">
              <span className="bco-paystep__num" aria-hidden="true">
                1
              </span>
              <div className="bco-paystep__body">
                <div className="bco-paystep__head">
                  <p className="bco-paystep__title">{formatCopy(c.payStepSend, { rail: railName })}</p>
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
                  <button type="button" className="bco-copy bco-copy--solid" onClick={() => void copyNumber()}>
                    {copied === 'number' ? (
                      <Check size={15} aria-hidden="true" />
                    ) : (
                      <Copy size={15} aria-hidden="true" />
                    )}
                    {copied === 'number' ? copy.subscribe.copied : copy.subscribe.copyNumber}
                  </button>
                  <input
                    ref={numberInputRef}
                    readOnly
                    dir="ltr"
                    value={localNumber}
                    aria-hidden="true"
                    tabIndex={-1}
                    className="sr-only"
                  />
                </div>
              </div>
            </li>

            <li className="bco-paystep">
              <span className="bco-paystep__num" aria-hidden="true">
                2
              </span>
              <div className="bco-paystep__body">
                <Field
                  id={FIELD_IDS.senderPhone}
                  label={copy.subscribe.senderPhoneLabel}
                  error={fieldErrors.senderPhone}
                >
                  <Input
                    id={FIELD_IDS.senderPhone}
                    className="bco-input bco-input--ltr"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    dir="ltr"
                    placeholder="01xxxxxxxxx"
                    invalid={Boolean(fieldErrors.senderPhone)}
                    aria-describedby={
                      fieldErrors.senderPhone ? `${FIELD_IDS.senderPhone}-error` : undefined
                    }
                    value={senderPhone}
                    onChange={(event) => {
                      setSenderPhone(event.target.value);
                      clearFieldError('senderPhone');
                    }}
                    disabled={submitting}
                  />
                </Field>
              </div>
            </li>

            <li className="bco-paystep">
              <span className="bco-paystep__num" aria-hidden="true">
                3
              </span>
              <div className="bco-paystep__body">
                <Field
                  id={FIELD_IDS.screenshot}
                  label={copy.subscribe.screenshotLabel}
                  error={fieldErrors.screenshot}
                  hint={formatCopy(copy.subscribe.screenshotHint, { rail: railName })}
                >
                  <input
                    ref={fileInputRef}
                    id="book-order-screenshot"
                    type="file"
                    /* `image/*`, not the API's allowlist. The narrow list greyed
                       out HEIC screenshots on iOS; `compressImage` re-encodes to
                       JPEG first and the API's own allowlist is still the gate.
                       Same value the homework picker has always used. */
                    accept="image/*"
                    onChange={(event) => {
                      handleFileChange(event);
                      clearFieldError('screenshot');
                    }}
                    disabled={submitting}
                    className="sr-only"
                  />
                  <button
                    id={FIELD_IDS.screenshot}
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={submitting}
                    aria-describedby={fieldErrors.screenshot ? `${FIELD_IDS.screenshot}-error` : undefined}
                    className={cn('bco-upload', previewUrl && 'bco-upload--filled')}
                  >
                    {previewUrl ? (
                      <img src={previewUrl} alt="" className="bco-upload__preview" />
                    ) : (
                      <span className="bco-upload__icon" aria-hidden="true">
                        <ImagePlus size={24} strokeWidth={2} />
                      </span>
                    )}
                    <span className="bco-upload__text">
                      <span className="bco-upload__name">
                        {file ? file.name : copy.subscribe.screenshotPlaceholder}
                      </span>
                      {file ? <span className="bco-upload__change">{copy.subscribe.screenshotChange}</span> : null}
                    </span>
                  </button>
                </Field>
              </div>
            </li>
          </ol>
        )}
      </div>
    );

    footer = (
      <FooterBar
        error={error}
        total={footerTotal}
        note={footerNote}
        secondary={
          <button
            type="button"
            className="bco-secondary"
            onClick={() => setStep('address')}
            disabled={submitting}
          >
            {c.back}
          </button>
        }
        primary={
          railConfirmed ? (
            <Button type="button" className="bco-primary" onClick={submitPayment} disabled={submitting}>
              {submitting ? (
                <>
                  <LoaderCircle className="bco-loading__spin" size={17} aria-hidden="true" />
                  {c.submitting}
                </>
              ) : (
                <>
                  {c.submit}
                  <ArrowLeft size={17} aria-hidden="true" />
                </>
              )}
            </Button>
          ) : null
        }
      />
    );
  }

  return (
    <div ref={rootRef} className="bco" data-step={step}>
      <StepBar current={currentStop} />
      <div className="bco__scroll">
        <div className={cn('bco__layout', withSummary && 'bco__layout--split')}>
          <div className="bco__main">{main}</div>
          {withSummary ? summary : null}
        </div>
      </div>
      {footer}
    </div>
  );
}

/** «١ الطلب · ٢ العنوان · ٣ الدفع». `current` is 2, 3, or 4 (all done). */
function StepBar({ current }: { current: number }) {
  const stops = [c.stepCart, c.stepAddress, c.stepPayment];
  return (
    <ol className="bco-steps" aria-label={c.stepsLabel}>
      {stops.map((label, index) => {
        const n = index + 1;
        const state = n < current ? 'done' : n === current ? 'current' : 'next';
        return (
          <li
            key={label}
            className="bco-steps__item"
            data-state={state}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span className="bco-steps__dot" aria-hidden="true">
              {state === 'done' ? <Check size={14} strokeWidth={3} /> : n}
            </span>
            <span className="bco-steps__label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The ONE order summary. Lines, then «الكتب» and «الشحن — {zone}» (and a
 * discount when the admin gave one). No «الإجمالي» row: the total lives in the
 * footer, once — a second copy of it here is how two different totals ended up
 * stacked in this dialog before.
 *
 * On a phone it folds to its header row (`data-open`); on a wide layout the
 * stylesheet shows the body regardless and hides the toggle.
 */
function OrderSummary({
  lines,
  subtotalCents,
  shippingCents,
  zone,
  discountCents,
  open,
  onToggle,
}: {
  lines: readonly { title: string; quantity: number; cents: number }[];
  subtotalCents: number;
  /** `null` — no governorate yet: the rule, not a number. */
  shippingCents: number | null;
  zone: string | null;
  discountCents: number;
  open: boolean;
  onToggle: () => void;
}) {
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  return (
    <aside className="bco-sum" data-open={open ? 'true' : 'false'} aria-label={c.summaryTitle}>
      <button type="button" className="bco-sum__head" aria-expanded={open} onClick={onToggle}>
        <span className="bco-sum__icon" aria-hidden="true">
          <ShoppingBag size={16} />
        </span>
        <span className="bco-sum__title">{c.summaryTitle}</span>
        {count > 0 ? (
          <span className="bco-sum__count">{formatCopy(copy.books.shelfCount, { n: count })}</span>
        ) : null}
        <span className="bco-sum__toggle">
          {c.summaryDetails}
          <ChevronDown size={16} aria-hidden="true" />
        </span>
      </button>

      <div className="bco-sum__body">
        {lines.length > 0 ? (
          <ul className="bco-sum__lines">
            {lines.map((line, index) => (
              <li key={`${line.title}-${index}`} className="bco-sum__line">
                <span className="bco-sum__line-title">{line.title}</span>
                <bdi dir="ltr" className="bco-sum__qty">
                  ×{line.quantity}
                </bdi>
                <span className="bco-sum__line-price">
                  <Money cents={line.cents} />
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <dl className="bco-sum__rows">
          <div className="bco-sum__row">
            <dt>{copy.books.subtotal}</dt>
            <dd>
              <Money cents={subtotalCents} />
            </dd>
          </div>
          <div className="bco-sum__row">
            <dt>
              {copy.books.shipping}
              {zone ? <span className="bco-sum__zone">{zone}</span> : null}
            </dt>
            <dd>
              {shippingCents === null ? (
                <span className="bco-sum__pending">{copy.books.shippingByGovernorate}</span>
              ) : shippingCents === 0 ? (
                copy.books.shippingFree
              ) : (
                <Money cents={shippingCents} />
              )}
            </dd>
          </div>
          {discountCents > 0 ? (
            <div className="bco-sum__row bco-sum__row--discount">
              <dt>{copy.books.discount}</dt>
              <dd>
                <bdi dir="ltr">{formatCopy(copy.books.discountValue, { price: formatEGP(discountCents) })}</bdi>
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    </aside>
  );
}

/** A labelled field with its own message line. */
function Field({
  id,
  label,
  error,
  hint,
  full,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  /** Spans both columns of the form grid. */
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn('bco-field', full && 'bco-field--full')}>
      <Label htmlFor={id} className="bco-field__label">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="bco-field__error">
          <TriangleAlert size={14} aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p className="bco-field__hint">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * The footer: the total on one side, the action on the other, and a request
 * error — the one kind of message that is about no single field — above both.
 */
function FooterBar({
  error,
  total,
  note,
  secondary,
  primary,
}: {
  error?: string | null;
  total?: ReactNode;
  note?: string;
  secondary?: ReactNode;
  primary?: ReactNode;
}) {
  return (
    <div className="bco__foot">
      {error ? (
        <p role="alert" className="bco__alert">
          <TriangleAlert size={16} aria-hidden="true" />
          {error}
        </p>
      ) : null}
      <div className={cn('bco__bar', !total && 'bco__bar--bare')}>
        {total ? (
          <div className="bco-total">
            <span className="bco-total__label">{copy.books.total}</span>
            <span className="bco-total__value">{total}</span>
            {note ? <span className="bco-total__note">{note}</span> : null}
          </div>
        ) : null}
        <div className="bco__actions">
          {secondary}
          {primary}
        </div>
      </div>
    </div>
  );
}
