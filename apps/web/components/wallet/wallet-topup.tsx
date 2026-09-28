'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Check,
  CircleCheck,
  Copy,
  ImagePlus,
  Landmark,
  Loader2,
  Smartphone,
  Ticket,
  TriangleAlert,
  Wallet,
} from 'lucide-react';
// Subpaths, never the root barrel — see `lib/client-barrel.test.ts`.
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { normalizeEgyptianPhone, toAsciiDigits } from '@ayman/contracts/phone';
import {
  WalletTopupSchema,
  WALLET_MAX_TOPUP_CENTS,
  WALLET_MIN_TOPUP_CENTS,
  type WalletTopupMethod,
} from '@ayman/contracts/wallet';
import { cn } from '@ayman/ui/lib/cn';
import { RedeemForm } from '@/components/unlock-codes/redeem-form';
import { PaymentBrand } from '@/components/site/payment-brand';
import { ApiRequestError, apiPost } from '@/lib/api';
import { uploadPaymentScreenshot } from '@/lib/upload-client';

const c = copy.wallet;

type Method = 'code' | WalletTopupMethod;

/** Round numbers a parent actually sends — tapped, not typed. */
const QUICK_POUNDS = [100, 200, 500, 1000] as const;

/** `+201021196367` → `01021196367`, what a transfer screen asks to be dialled. */
function localDigits(e164: string): string {
  return e164.replace(/^\+20/, '0');
}

const METHOD_ICON = { code: Ticket, instapay: Landmark, vodafone_cash: Smartphone } as const;

/**
 * «شحن المحفظة» — the three ways in, as three coloured objects, and the one
 * form behind whichever is pressed.
 *
 * The code path is the SAME form `/codes` uses: a wallet code and a course
 * code are one six-character field, and the server decides which it is. Two
 * fields for «أنهي كود ده؟» is a question the student cannot answer.
 *
 * The transfer path is the course checkout's shape — the number for the rail
 * that was picked (never the other one), the sender, the screenshot — plus an
 * amount, which here is the student's to type: there is no price to derive
 * it from. The admin credits what actually arrived.
 */
export function WalletTopup({
  instapay,
  vodafone,
  initialAmountCents,
  backHref,
}: {
  instapay: string | null;
  vodafone: string | null;
  /** From `?amount=` — the checkout's «ناقص كام» — so the form opens filled. */
  initialAmountCents: number | null;
  /** From `?back=` — the checkout the student came from. */
  backHref: string | null;
}) {
  const router = useRouter();
  const numbers: Record<WalletTopupMethod, string | null> = { instapay, vodafone_cash: vodafone };
  const firstRail: WalletTopupMethod | null = instapay ? 'instapay' : vodafone ? 'vodafone_cash' : null;

  const [method, setMethod] = useState<Method | null>(initialAmountCents ? firstRail : null);
  const [pounds, setPounds] = useState(
    initialAmountCents ? String(Math.ceil(initialAmountCents / 100)) : '',
  );
  const [sender, setSender] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const numberRef = useRef<HTMLInputElement>(null);

  // The local preview's object URL is released when it is replaced or the
  // form goes away — a phone keeps a dozen screenshots in memory otherwise.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const amountCents = Number(pounds || '0') * 100;
  const amountValid =
    Number.isFinite(amountCents) && amountCents >= WALLET_MIN_TOPUP_CENTS && amountCents <= WALLET_MAX_TOPUP_CENTS;

  function choose(next: Method) {
    setMethod(next);
    setError(null);
    setSent(false);
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0] ?? null;
    setFile(picked);
    setPreviewUrl(picked ? URL.createObjectURL(picked) : null);
    setError(null);
  }

  async function copyNumber(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // The async clipboard can be refused (an old WebView); a selected,
      // focused input still copies through the legacy path.
      const input = numberRef.current;
      if (!input) return;
      input.focus();
      input.select();
      if (!document.execCommand('copy')) return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || method === null || method === 'code') return;
    if (!amountValid) return setError(c.errors.amount);
    if (sender.trim().length < 3) return setError(c.errors.sender);
    if (!file) return setError(c.errors.screenshot);

    setPending(true);
    setError(null);
    const uploaded = await uploadPaymentScreenshot(file);
    if (!uploaded.ok) {
      setPending(false);
      setError(c.errors.upload);
      return;
    }
    try {
      await apiPost('/api/wallet/topups', WalletTopupSchema, {
        method,
        amountCents,
        // A Vodafone number is normalised the way every phone on the platform
        // is; an InstaPay address is kept exactly as typed.
        sender:
          method === 'vodafone_cash' ? (normalizeEgyptianPhone(sender) ?? sender.trim()) : sender.trim(),
        note: note.trim() || null,
        screenshotKey: uploaded.value.screenshotKey,
      });
      setSent(true);
      setFile(null);
      setPreviewUrl(null);
      setSender('');
      setNote('');
      // The request list and the «في الطريق» chip are server-rendered.
      router.refresh();
    } catch (caught) {
      const code =
        caught instanceof ApiRequestError ? (caught.payload as { code?: unknown } | undefined)?.code : undefined;
      setError(code === 'wallet_too_many_pending' ? c.errors.tooMany : c.errors.generic);
    } finally {
      setPending(false);
    }
  }

  const railNumber = method === 'instapay' || method === 'vodafone_cash' ? numbers[method] : null;
  const local = railNumber ? localDigits(railNumber) : '';
  const railName = method === 'vodafone_cash' ? c.methods.vodafone_cash : c.methods.instapay;

  return (
    <div>
      {backHref && initialAmountCents ? (
        <p className="wl-note mb-4">
          <Wallet className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{formatCopy(c.missingNote, { amount: Math.ceil(initialAmountCents / 100) })}</span>
        </p>
      ) : null}

      <div className="wl-methods" role="group" aria-label={c.topupTitle}>
        {(['code', 'instapay', 'vodafone_cash'] as const).map((key) => {
          const Icon = METHOD_ICON[key];
          const unavailable = key !== 'code' && !numbers[key];
          const selected = method === key;
          return (
            <button
              key={key}
              type="button"
              className={cn('wl-method', `wl-method--${key}`)}
              aria-pressed={selected}
              disabled={unavailable}
              onClick={() => choose(key)}
            >
              <span className="wl-method__icon" aria-hidden="true">
                <Icon className="size-5" />
              </span>
              <span className="wl-method__body">
                <span className="wl-method__name">{c.methods[key]}</span>
                <span className="wl-method__hint">{unavailable ? c.methodUnavailable : c.methodHints[key]}</span>
              </span>
              {selected ? <CircleCheck className="wl-method__check size-5" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>

      {method === 'code' ? (
        <div className="wl-panel">
          <p className="wl-panel__title">
            <Ticket className="size-5 text-[var(--viz-1)]" aria-hidden="true" />
            {c.codeTitle}
          </p>
          <p className="wl-panel__lead">{c.codeLead}</p>
          <RedeemForm compact />
        </div>
      ) : null}

      {method === 'instapay' || method === 'vodafone_cash' ? (
        <div className="wl-panel">
          {sent ? (
            <div className="wl-sent" role="status">
              <span className="wl-sent__badge">
                <Check className="size-8" strokeWidth={3} aria-hidden="true" />
              </span>
              <p className="wl-sent__title">{c.sentTitle}</p>
              <p className="wl-sent__lead">{c.sentLead}</p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {backHref ? (
                  <Link href={backHref} className="wl-btn wl-btn--primary">
                    <ArrowRight className="size-5" aria-hidden="true" />
                    {c.backToCheckout}
                  </Link>
                ) : null}
                <button type="button" className="wl-btn wl-btn--ghost" onClick={() => setSent(false)}>
                  {c.sentAnother}
                </button>
              </div>
            </div>
          ) : (
            <form method="post" className="wl-form" onSubmit={submit} noValidate>
              <div className="wl-field">
                <label className="wl-field__label" htmlFor="wl-amount">
                  {c.amountLabel}
                </label>
                <input
                  id="wl-amount"
                  className="wl-input wl-input--amount"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="0"
                  value={pounds}
                  onChange={(event) => {
                    // Arabic-Indic digits from a phone keyboard are the same
                    // number; everything that is not a digit goes.
                    setPounds(toAsciiDigits(event.target.value).replace(/\D/g, '').slice(0, 6));
                    setError(null);
                  }}
                  disabled={pending}
                />
                <div className="wl-chips" role="group" aria-label={c.amountQuick}>
                  {QUICK_POUNDS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className="wl-chip"
                      aria-pressed={pounds === String(value)}
                      onClick={() => setPounds(String(value))}
                      disabled={pending}
                    >
                      <span dir="ltr">{value}</span> {c.currency}
                    </button>
                  ))}
                </div>
              </div>

              <p className="wl-instructions">
                {amountValid
                  ? formatCopy(c.instructions, { amount: Math.round(amountCents / 100), rail: railName })
                  : formatCopy(c.instructionsNoAmount, { rail: railName })}
              </p>

              <div className="wl-number">
                <PaymentBrand
                  rail={method === 'vodafone_cash' ? 'vodafoneCash' : 'instapay'}
                  className="wl-number__brand"
                />
                <span className="wl-number__digits">{local}</span>
                <input
                  ref={numberRef}
                  readOnly
                  dir="ltr"
                  value={local}
                  aria-hidden="true"
                  tabIndex={-1}
                  className="sr-only"
                />
                <button type="button" className="wl-chip" onClick={() => copyNumber(local)}>
                  <Copy className="inline size-4" aria-hidden="true" /> {copied ? c.copied : c.copyNumber}
                </button>
              </div>

              <div className="wl-field">
                <label className="wl-field__label" htmlFor="wl-sender">
                  {c.senderLabel[method]}
                </label>
                <input
                  id="wl-sender"
                  className="wl-input"
                  dir="ltr"
                  inputMode={method === 'vodafone_cash' ? 'tel' : 'text'}
                  autoComplete="off"
                  placeholder={c.senderPlaceholder[method]}
                  value={sender}
                  onChange={(event) => {
                    setSender(event.target.value);
                    setError(null);
                  }}
                  disabled={pending}
                />
              </div>

              <div className="wl-field">
                <span className="wl-field__label">{c.screenshotLabel}</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={onFile}
                  disabled={pending}
                  aria-label={c.screenshotLabel}
                />
                <button
                  type="button"
                  className="wl-upload"
                  onClick={() => fileRef.current?.click()}
                  disabled={pending}
                >
                  {previewUrl ? (
                    // A local `blob:` preview of the student's own pick — no
                    // remote asset for `next/image` to optimise.
                    <img src={previewUrl} alt="" className="wl-upload__preview" />
                  ) : (
                    <span className="wl-upload__icon" aria-hidden="true">
                      <ImagePlus className="size-6" />
                    </span>
                  )}
                  <span className="wl-upload__text">{file ? file.name : c.screenshotPick}</span>
                  {file ? <span className="wl-upload__change">{c.screenshotChange}</span> : null}
                </button>
              </div>

              <div className="wl-field">
                <label className="wl-field__label" htmlFor="wl-note">
                  {c.noteLabel}
                </label>
                <input
                  id="wl-note"
                  className="wl-input"
                  maxLength={300}
                  placeholder={c.notePlaceholder}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  disabled={pending}
                />
              </div>

              {error ? (
                <p className="wl-error" role="alert">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {error}
                </p>
              ) : null}

              <button type="submit" className="wl-btn wl-btn--primary wl-btn--block" disabled={pending}>
                {pending ? (
                  <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                ) : (
                  <Wallet className="size-5" aria-hidden="true" />
                )}
                {pending ? c.submitting : c.submit}
              </button>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
