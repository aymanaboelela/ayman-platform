'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ImagePlus } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { normalizeEgyptianPhone } from '@ayman/contracts/phone';
import { TaxonomySchema, type Taxonomy } from '@ayman/contracts/taxonomy';
import { BookOrderSchema, type BookOrder } from '@ayman/contracts/book-orders';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';
import { Textarea } from '@ayman/ui/components/textarea';
import { apiGet, apiPost } from '@/lib/api';
import { uploadBookOrderScreenshot } from '@/lib/upload-client';
import { formatEGP } from '@/lib/price';
import {
  CART_ORDER_KEY,
  clearInProgressBookOrder,
  readInProgressBookOrder,
  saveInProgressBookOrder,
} from '@/lib/book-order-storage';

const c = copy.bookOrder;

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
 * then the exact same Vodafone Cash payment UI `SubscribePanel` uses. A
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
 */
export function BookOrderPanel({
  courseId,
  items,
  amountCents,
  vodafoneCash,
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
   * What the reader has been quoted, INCLUDING delivery, for the line above the
   * form.
   *
   * Passed in rather than computed here because the two callers know it in
   * different ways — the shop has already totalled a basket, the course page has
   * one price and the shipping fee — and because this panel must never be the
   * thing that decides what an order costs. The server recomputes it from the
   * catalogue regardless; this number is what the person was told.
   */
  amountCents: number;
  /** E.164, or `null` when the admin has not configured one yet. */
  vodafoneCash: string | null;
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

  const [step, setStep] = useState<Step>('checking');
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [order, setOrder] = useState<BookOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Address fields.
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [altPhone, setAltPhone] = useState('');
  const [governorateCode, setGovernorateCode] = useState('');
  const [city, setCity] = useState('');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressBuilding, setAddressBuilding] = useState('');
  const [addressNote, setAddressNote] = useState('');
  const [savingAddress, setSavingAddress] = useState(false);

  // Payment fields — identical shape to `SubscribePanel`.
  const [senderPhone, setSenderPhone] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const numberInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    const storedOrderId = readInProgressBookOrder(storageKey);
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
        setOrder(fetched);
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
          setStep('address');
        } else {
          // Already `paid`/`shipped` — nothing left to resume.
          clearInProgressBookOrder(storageKey);
          setStep('alreadyOrdered');
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
  }, [storageKey]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    setPreviewUrl((prevUrl) => {
      if (prevUrl) URL.revokeObjectURL(prevUrl);
      return next ? URL.createObjectURL(next) : null;
    });
    setFile(next);
  }

  if (!vodafoneCash) {
    return <p className="course-subscribe__error">{c.noNumber}</p>;
  }

  const localNumber = localEgyptianDigits(vodafoneCash);

  async function copyNumber() {
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
      if (document.execCommand('copy')) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Both paths refused — the number is still selected text on screen.
    }
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

  async function submitAddress() {
    const normalizedPhone = normalizeEgyptianPhone(phone);
    const normalizedAltPhone = normalizeEgyptianPhone(altPhone);
    if (!fullName.trim()) {
      setError(c.fullNameRequired);
      return;
    }
    if (!phone.trim()) {
      setError(c.phoneRequired);
      return;
    }
    if (!normalizedPhone) {
      setError(c.phoneInvalid);
      return;
    }
    if (!altPhone.trim()) {
      setError(c.altPhoneRequired);
      return;
    }
    if (!normalizedAltPhone) {
      setError(c.altPhoneInvalid);
      return;
    }
    if (!governorateCode) {
      setError(c.governorateRequired);
      return;
    }
    if (!city.trim()) {
      setError(c.cityRequired);
      return;
    }
    if (!addressStreet.trim()) {
      setError(c.addressStreetRequired);
      return;
    }
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
      const created = await apiPost('/api/book-orders', BookOrderSchema, {
        /* Exactly one of the two reaches the wire — `CreateBookOrderSchema` is
           `.strict()` AND refines on "one, never both", so spreading whichever
           this panel was given is the only spelling that satisfies it. */
        ...(items ? { items } : { courseId }),
        fullName: fullName.trim(),
        phone: normalizedPhone,
        altPhone: normalizedAltPhone,
        governorateCode,
        city: city.trim(),
        addressStreet: addressStreet.trim(),
        addressBuilding: addressBuilding.trim() === '' ? null : addressBuilding.trim(),
        addressNote: addressNote.trim() === '' ? null : addressNote.trim(),
      });
      setOrder(created);
      // Remembered on THIS browser so closing the tab before paying does not
      // lose the order — see the panel's own docblock and
      // `lib/book-order-storage.ts`.
      saveInProgressBookOrder(storageKey, created.id);
      setStep('payment');
    } catch {
      // No `onUnauthorized` branch any more — this endpoint is `@Public()`,
      // so a signed-out visitor's submit never 401s. Anything else thrown
      // here is a genuine failure.
      setError(c.genericError);
    } finally {
      setSavingAddress(false);
    }
  }

  async function submitPayment() {
    if (!order) return;
    const normalizedSenderPhone = normalizeEgyptianPhone(senderPhone);
    if (!senderPhone.trim()) {
      setError(c.senderPhoneRequired);
      return;
    }
    if (!normalizedSenderPhone) {
      setError(c.senderPhoneInvalid);
      return;
    }
    if (!file) {
      setError(c.screenshotRequired);
      return;
    }

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
      setStep('success');
    } catch {
      setError(c.genericError);
      setStep('payment');
    }
  }

  if (step === 'checking') {
    return <p className="course-subscribe__title">{copy.common.loading}</p>;
  }

  if (step === 'alreadyOrdered') {
    return <p className="course-subscribe__success">{c.alreadyOrdered}</p>;
  }

  if (step === 'success') {
    return <p className="course-subscribe__success">{c.success}</p>;
  }

  if (step === 'address') {
    const pinned = (taxonomy?.pinnedGovernorateCodes ?? [])
      .map((code) => taxonomy?.governorates.find((g) => g.code === code))
      .filter((g): g is Taxonomy['governorates'][number] => g !== undefined);
    const rest = (taxonomy?.governorates ?? []).filter(
      (g) => !(taxonomy?.pinnedGovernorateCodes ?? []).includes(g.code),
    );
    const governorateOptions = [...pinned, ...rest];

    return (
      <div className="course-subscribe">
        <p className="course-subscribe__amount">
          {formatCopy(c.priceLine, { price: formatEGP(amountCents) })}
        </p>
        <p className="course-subscribe__title">{c.addressTitle}</p>

        <div>
          <Label htmlFor="book-order-full-name">{c.fullNameLabel}</Label>
          <Input id="book-order-full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>

        <div>
          <Label htmlFor="book-order-phone">{c.phoneLabel}</Label>
          <Input
            id="book-order-phone"
            type="tel"
            inputMode="tel"
            dir="ltr"
            placeholder="01xxxxxxxxx"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="book-order-alt-phone">{c.altPhoneLabel}</Label>
          <Input
            id="book-order-alt-phone"
            type="tel"
            inputMode="tel"
            dir="ltr"
            placeholder="01xxxxxxxxx"
            value={altPhone}
            onChange={(e) => setAltPhone(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="book-order-governorate">{c.governorateLabel}</Label>
          <Select
            id="book-order-governorate"
            value={governorateCode}
            onChange={(e) => setGovernorateCode(e.target.value)}
          >
            <option value="">{c.governoratePlaceholder}</option>
            {governorateOptions.map((g) => (
              <option key={g.code} value={g.code}>
                {g.nameAr}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="book-order-city">{c.cityLabel}</Label>
          <Input id="book-order-city" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>

        <div>
          <Label htmlFor="book-order-street">{c.addressStreetLabel}</Label>
          <Input id="book-order-street" value={addressStreet} onChange={(e) => setAddressStreet(e.target.value)} />
        </div>

        <div>
          <Label htmlFor="book-order-building">{c.addressBuildingLabel}</Label>
          <Input
            id="book-order-building"
            value={addressBuilding}
            onChange={(e) => setAddressBuilding(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="book-order-note">{c.addressNoteLabel}</Label>
          <Textarea
            id="book-order-note"
            rows={2}
            placeholder={c.addressNotePlaceholder}
            value={addressNote}
            onChange={(e) => setAddressNote(e.target.value)}
          />
        </div>

        {error ? (
          <p role="alert" className="course-subscribe__error">
            {error}
          </p>
        ) : null}

        <div className="course-subscribe__actions">
          <Button type="button" onClick={submitAddress} disabled={savingAddress}>
            {savingAddress ? c.addressSubmitting : c.addressSubmit}
          </Button>
          <button type="button" className="course-subscribe__cancel" onClick={onCancel} disabled={savingAddress}>
            {c.back}
          </button>
        </div>
      </div>
    );
  }

  // `payment` / `submitting` — the exact `SubscribePanel` payment UI, priced
  // from the ORDER's own `amountCents` (the book's price at submission time).
  const submitting = step === 'submitting';

  return (
    <div className="course-subscribe">
      <p className="course-subscribe__amount">
        {formatCopy(c.priceLine, { price: formatEGP(order?.amountCents ?? amountCents) })}
      </p>
      {/* The order's own lines once it exists — one book for the course flow, the
          whole basket for the shop. Read off the ORDER rather than the props so
          a resumed one (a tab reopened days later) shows what was actually
          bought, not what happens to be in this session's cart. */}
      <p className="course-subscribe__title">
        {(order?.items ?? []).map((line) => line.titleAr).join(c.itemSeparator)}
      </p>

      <p className="course-subscribe__instructions">
        {formatCopy(c.instructions, { number: localNumber })}
      </p>

      <div className="course-subscribe__number-row">
        <span dir="ltr" className="course-subscribe__number">
          {localNumber}
        </span>
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
        <Label htmlFor="book-order-sender-phone">{copy.subscribe.senderPhoneLabel}</Label>
        <Input
          id="book-order-sender-phone"
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
        <Label htmlFor="book-order-screenshot">{copy.subscribe.screenshotLabel}</Label>
        <input
          ref={fileInputRef}
          id="book-order-screenshot"
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
            <img src={previewUrl} alt="" className="course-subscribe__upload-preview" />
          ) : (
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
        <Button type="button" onClick={submitPayment} disabled={submitting}>
          {submitting ? c.submitting : c.submit}
        </Button>
        <button
          type="button"
          className="course-subscribe__cancel"
          onClick={() => setStep('address')}
          disabled={submitting}
        >
          {c.back}
        </button>
      </div>
    </div>
  );
}
