'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CircleMinus, Gift, Loader2, PlusCircle, Wallet } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { cn } from '@ayman/ui/lib/cn';
import { newIdempotencyKey } from '@/lib/idempotency-key';
import { parsePounds } from '@/lib/pounds';
import { formatEGPExact } from '@/lib/price';
import { creditWalletAction, debitWalletAction, type WalletActionResult } from '../actions';

const c = copy.admin.wallet;

const QUICK = [50, 100, 200, 500, 1000] as const;

const egp = (cents: number) => `${formatEGPExact(cents)} ج`;

/**
 * «اشحن» and «خصم» for one wallet.
 *
 * Each form mints ONE idempotency key when it appears and again only after a
 * success — so a double press, or a retry after the response was lost, is the
 * same movement and the server answers it once. Nothing here decides a
 * balance: the API answers with the wallet as it now stands.
 *
 * «مدفوعة» or «هدية» has NO default. It is the one question the money screens
 * care about — income today, or not income at all — and a preselected answer
 * is an answer nobody gave.
 */
export function WalletAdjust({ userId, balanceCents }: { userId: string; balanceCents: number }) {
  const [debitOpen, setDebitOpen] = useState(false);
  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start">
      <CreditForm userId={userId} />
      {debitOpen ? (
        <DebitForm userId={userId} balanceCents={balanceCents} onClose={() => setDebitOpen(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setDebitOpen(true)}
          className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[color-mix(in_oklab,var(--err)_35%,var(--border))] bg-surface-1 p-4 text-[length:var(--fs-text-sm)] font-semibold text-fg-muted transition-colors hover:text-fg"
        >
          <CircleMinus className="size-5 text-[color:var(--err)]" aria-hidden="true" />
          {c.debitToggle}
        </button>
      )}
    </div>
  );
}

function Choice({
  on,
  hue,
  icon: Icon,
  title,
  hint,
  onPick,
}: {
  on: boolean;
  hue: string;
  icon: typeof Wallet;
  title: string;
  hint: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onPick}
      style={{ '--hue': hue } as React.CSSProperties}
      className={cn(
        'flex items-start gap-2.5 rounded-lg border-2 p-3 text-start transition-colors duration-200',
        on
          ? 'border-[color:var(--hue)] bg-[color-mix(in_oklab,var(--hue)_12%,var(--n-2))]'
          : 'border-line bg-surface-1 hover:border-[color-mix(in_oklab,var(--hue)_45%,var(--border))]',
      )}
    >
      <Icon className="mt-0.5 size-5 shrink-0 text-[color:var(--hue)]" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block font-semibold text-fg">{title}</span>
        <span className="block text-[length:var(--fs-text-xs)] leading-snug text-fg-muted">{hint}</span>
      </span>
    </button>
  );
}

function failureMessage(result: Extract<WalletActionResult, { ok: false }>): string {
  if (result.reason === 'insufficient') {
    return formatCopy(c.insufficient, { balance: egp(result.balanceCents ?? 0) });
  }
  return c.failed;
}

function CreditForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [amountText, setAmountText] = useState('');
  const [paid, setPaid] = useState<boolean | null>(null);
  const [note, setNote] = useState('');
  const [key, setKey] = useState(newIdempotencyKey);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parsePounds(amountText);
  const cents = parsed.kind === 'valid' ? parsed.cents : 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (cents < 100) return setError(c.amountRequired);
    if (paid === null) return setError(c.kindRequired);
    setError(null);
    setPending(true);
    const result = await creditWalletAction(userId, {
      amountCents: cents,
      paid,
      note: note.trim() || null,
      idempotencyKey: key,
    });
    setPending(false);
    if (!result.ok) {
      setError(failureMessage(result));
      return;
    }
    toast.success(formatCopy(c.creditDone, { amount: egp(cents), balance: egp(result.wallet.balanceCents) }));
    setAmountText('');
    setPaid(null);
    setNote('');
    setKey(newIdempotencyKey());
    router.refresh();
  }

  return (
    <form
      method="post"
      onSubmit={submit}
      noValidate
      className="rounded-xl border-2 border-[color-mix(in_oklab,var(--viz-6)_40%,var(--border))] bg-[color-mix(in_oklab,var(--viz-6)_5%,var(--n-2))] p-4 sm:p-5"
    >
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-full bg-[color:var(--viz-6)] text-[color:var(--n-1)]" aria-hidden="true">
          <PlusCircle className="size-6" />
        </span>
        <div>
          <h2 className="text-[length:var(--fs-title-3)] font-semibold text-fg">{c.creditTitle}</h2>
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.creditLead}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        <div>
          <Label htmlFor="wallet-credit-amount">{c.amount}</Label>
          <Input
            id="wallet-credit-amount"
            inputMode="decimal"
            dir="ltr"
            autoComplete="off"
            value={amountText}
            invalid={parsed.kind === 'invalid'}
            onChange={(event) => setAmountText(event.target.value)}
            disabled={pending}
            className="h-12 rounded-lg bg-surface-1 text-center text-[1.25rem] font-bold tabular-nums [unicode-bidi:isolate]"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUICK.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={amountText === String(value)}
                onClick={() => setAmountText(String(value))}
                disabled={pending}
                className={cn(
                  'h-9 rounded-full px-3.5 text-[length:var(--fs-text-sm)] font-semibold tabular-nums transition-colors',
                  amountText === String(value)
                    ? 'bg-[color:var(--viz-6)] text-[color:var(--n-1)]'
                    : 'border border-[color-mix(in_oklab,var(--viz-6)_35%,var(--border))] bg-surface-1 text-fg',
                )}
              >
                {value} ج
              </button>
            ))}
          </div>
        </div>

        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-1.5 text-[length:var(--fs-text-sm)] font-medium text-fg">{c.kindLabel}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <Choice on={paid === true} hue="var(--ok)" icon={Wallet} title={c.paid} hint={c.paidHint} onPick={() => setPaid(true)} />
            <Choice on={paid === false} hue="var(--viz-4)" icon={Gift} title={c.gift} hint={c.giftHint} onPick={() => setPaid(false)} />
          </div>
        </fieldset>

        <div>
          <Label htmlFor="wallet-credit-note">{c.note}</Label>
          <Input
            id="wallet-credit-note"
            value={note}
            maxLength={300}
            placeholder={c.notePlaceholder}
            onChange={(event) => setNote(event.target.value)}
            disabled={pending}
            className="h-11 rounded-lg bg-surface-1"
          />
        </div>

        {error ? (
          <p role="alert" className="text-[length:var(--fs-text-sm)] text-err">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={pending} className="h-12 text-[length:var(--fs-text-base)] font-semibold">
          {pending ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <PlusCircle className="size-5" aria-hidden="true" />}
          {pending ? c.crediting : cents >= 100 ? formatCopy(c.creditSubmit, { amount: egp(cents) }) : c.creditSubmitEmpty}
        </Button>
      </div>
    </form>
  );
}

function DebitForm({
  userId,
  balanceCents,
  onClose,
}: {
  userId: string;
  balanceCents: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [amountText, setAmountText] = useState('');
  const [reducesIncome, setReducesIncome] = useState<boolean | null>(null);
  const [reason, setReason] = useState('');
  const [key, setKey] = useState(newIdempotencyKey);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parsePounds(amountText);
  const cents = parsed.kind === 'valid' ? parsed.cents : 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (cents < 100) return setError(c.amountRequired);
    if (cents > balanceCents) return setError(formatCopy(c.insufficient, { balance: egp(balanceCents) }));
    if (reducesIncome === null) return setError(c.kindRequired);
    if (reason.trim().length < 3) return setError(c.reasonRequired);
    setError(null);
    setPending(true);
    const result = await debitWalletAction(userId, {
      amountCents: cents,
      reducesIncome,
      note: reason.trim(),
      idempotencyKey: key,
    });
    setPending(false);
    if (!result.ok) {
      setError(failureMessage(result));
      return;
    }
    toast.success(formatCopy(c.debitDone, { amount: egp(cents), balance: egp(result.wallet.balanceCents) }));
    setKey(newIdempotencyKey());
    router.refresh();
    onClose();
  }

  return (
    <form
      method="post"
      onSubmit={submit}
      noValidate
      className="rounded-xl border-2 border-[color-mix(in_oklab,var(--err)_35%,var(--border))] bg-[color-mix(in_oklab,var(--err)_4%,var(--n-2))] p-4 sm:p-5"
    >
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-full bg-[color-mix(in_oklab,var(--err)_16%,var(--n-2))] text-[color:var(--err)]" aria-hidden="true">
          <CircleMinus className="size-6" />
        </span>
        <div>
          <h2 className="text-[length:var(--fs-title-3)] font-semibold text-fg">{c.debitTitle}</h2>
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.debitLead}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        <div>
          <Label htmlFor="wallet-debit-amount">{c.amount}</Label>
          <Input
            id="wallet-debit-amount"
            inputMode="decimal"
            dir="ltr"
            autoComplete="off"
            value={amountText}
            invalid={parsed.kind === 'invalid'}
            onChange={(event) => setAmountText(event.target.value)}
            disabled={pending}
            className="h-11 rounded-lg bg-surface-1 text-center font-bold tabular-nums [unicode-bidi:isolate]"
          />
        </div>
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-1.5 text-[length:var(--fs-text-sm)] font-medium text-fg">{c.kindLabel}</legend>
          <div className="grid gap-2">
            <Choice
              on={reducesIncome === true}
              hue="var(--err)"
              icon={CircleMinus}
              title={c.reducesIncome}
              hint={c.reducesIncomeHint}
              onPick={() => setReducesIncome(true)}
            />
            <Choice
              on={reducesIncome === false}
              hue="var(--viz-4)"
              icon={Gift}
              title={c.keepsIncome}
              hint={c.keepsIncomeHint}
              onPick={() => setReducesIncome(false)}
            />
          </div>
        </fieldset>
        <div>
          <Label htmlFor="wallet-debit-reason">{c.reason}</Label>
          <Input
            id="wallet-debit-reason"
            value={reason}
            maxLength={300}
            placeholder={c.reasonPlaceholder}
            onChange={(event) => setReason(event.target.value)}
            disabled={pending}
            className="h-11 rounded-lg bg-surface-1"
          />
        </div>
        {error ? (
          <p role="alert" className="text-[length:var(--fs-text-sm)] text-err">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="danger" disabled={pending} className="h-11 flex-1">
            {pending ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : null}
            {pending ? c.debiting : cents >= 100 ? formatCopy(c.debitSubmit, { amount: egp(cents) }) : c.debitSubmitEmpty}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending} className="h-11 border border-line">
            {c.cancel}
          </Button>
        </div>
      </div>
    </form>
  );
}
