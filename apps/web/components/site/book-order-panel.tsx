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
import { ApiRequestError, apiGet, apiPost } from '@/lib/api';
import { uploadBookOrderScreenshot } from '@/lib/upload-client';
import { formatEGP } from '@/lib/price';

const c = copy.bookOrder;

/** `+201021196367` → `٠١٠٢١١٩٦٣٦٧`-shaped local digits — same helper
 *  `SubscribePanel` uses for the same Vodafone Cash number. */
function localEgyptianDigits(e164: string): string {
  return e164.replace(/^\+20/, '0');
}

type Step = 'address' | 'payment' | 'submitting' | 'success';

/**
 * الكتاب الورقي — ordering the printed textbook of a course that has one.
 *
 * Two steps: an ADDRESS form, saved to the database the moment it is
 * submitted (before any payment exists — see `BookOrdersService.create`),
 * then the exact same Vodafone Cash payment UI `SubscribePanel` uses. A
 * student who abandons after step one already left a real, visible row for
 * an admin — see the `BookOrder` model doc for why that is the point.
 */
export function BookOrderPanel({
  courseId,
  bookTitle,
  bookPriceCents,
  vodafoneCash,
  onCancel,
  onUnauthorized,
}: {
  courseId: string;
  bookTitle: string;
  bookPriceCents: number;
  /** E.164, or `null` when the admin has not configured one yet. */
  vodafoneCash: string | null;
  onCancel: () => void;
  /**
   * Called when the address step's own submit comes back 401 — "no
   * session", not a form mistake. Optional: a caller with nowhere better to
   * send the visitor (there is none today) can omit it and let the generic
   * error message show instead.
   */
  onUnauthorized?: () => void;
}) {
  const [step, setStep] = useState<Step>('address');
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
    if (!addressBuilding.trim()) {
      setError(c.addressBuildingRequired);
      return;
    }

    setError(null);
    setSavingAddress(true);
    try {
      const created = await apiPost('/api/book-orders', BookOrderSchema, {
        courseId,
        fullName: fullName.trim(),
        phone: normalizedPhone,
        altPhone: normalizedAltPhone,
        governorateCode,
        city: city.trim(),
        addressStreet: addressStreet.trim(),
        addressBuilding: addressBuilding.trim(),
        addressNote: addressNote.trim() === '' ? null : addressNote.trim(),
      });
      setOrder(created);
      setStep('payment');
    } catch (caught) {
      // 401 means "no session", not a mistake in what was typed — same
      // distinction `CourseStartButton` draws for its own enroll call.
      if (caught instanceof ApiRequestError && caught.status === 401 && onUnauthorized) {
        onUnauthorized();
        return;
      }
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
      setStep('success');
    } catch {
      setError(c.genericError);
      setStep('payment');
    }
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
          {formatCopy(c.priceLine, { price: formatEGP(bookPriceCents) })}
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
        {formatCopy(c.priceLine, { price: formatEGP(order?.amountCents ?? bookPriceCents) })}
      </p>
      <p className="course-subscribe__title">{bookTitle}</p>

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
