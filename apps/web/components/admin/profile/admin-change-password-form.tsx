'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { Check, Eye, EyeOff, KeyRound, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { AdminChangePasswordSchema } from '@ayman/contracts/admin/profile';
import { adminAccount } from '@ayman/contracts/copy/admin-account';
import { Button } from '@ayman/ui/components/button';
import { Card, CardBody, CardHeader, CardTitle } from '@ayman/ui/components/card';
import { Checkbox } from '@ayman/ui/components/checkbox';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { changeAdminPasswordAction } from '@/app/(admin)/admin/profile/actions';
import { PASSWORD_FIELD_ID, PASSWORD_SECTION_ID } from '@/components/admin/admin-account-menu';

const p = adminAccount.password;

type Field = 'current' | 'next' | 'confirm';

/**
 * Which field a value fails on, and in what words — checked against the SAME
 * schema the server action parses with (`AdminChangePasswordSchema`), so the
 * bounds live in one place and only the sentences live here.
 */
function validate(current: string, next: string, confirm: string): { field: Field; message: string } | null {
  if (current === '') return { field: 'current', message: p.errors.currentRequired };
  const parsed = AdminChangePasswordSchema.shape.newPassword.safeParse(next);
  if (!parsed.success) {
    return { field: 'next', message: next.length > 128 ? p.errors.tooLong : p.errors.tooShort };
  }
  if (next === current) return { field: 'next', message: p.errors.sameAsCurrent };
  if (next !== confirm) return { field: 'confirm', message: p.errors.mismatch };
  return null;
}

/**
 * «تغيير كلمة السر» — the signed-in admin's own password.
 *
 * ## What changed, and why
 *
 * The form shipped on 2026-10-15 and worked, but:
 *
 *   · «تسجيل الخروج من جميع الأجهزة» started TICKED (and the contract defaulted
 *     it to true), so saving a new password signed him out of his phone and
 *     every other browser without being asked. It starts unticked now, says
 *     that THIS device always stays signed in, and the server keeps the
 *     current session in every branch.
 *   · Errors were the API's Modern Standard Arabic printed verbatim, or a
 *     ZodError's JSON; they are now one sentence per refusal, against the
 *     field it is about (`aria-invalid` + `aria-describedby`), and focus moves
 *     to that field.
 *   · It lived at the bottom of the page behind an unlabelled icon; it now has
 *     its own anchor (`#password`), is reached from «حسابي» in the header, and
 *     takes focus when the page is opened on it.
 */
export function AdminChangePasswordForm() {
  const ids = useId();
  const [isPending, startTransition] = useTransition();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [revokeOtherSessions, setRevokeOtherSessions] = useState(false);
  const [error, setError] = useState<{ field: Field | null; message: string } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const currentRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  // Opened ON the section (`/admin/profile#password`, the header's «تغيير كلمة
  // السر»): the first field takes focus. Focus only — no state is set here.
  useEffect(() => {
    if (window.location.hash === `#${PASSWORD_SECTION_ID}`) currentRef.current?.focus();
  }, []);

  function fail(field: Field | null, message: string) {
    setError({ field, message });
    setDone(null);
    const target = field === 'current' ? currentRef : field === 'next' ? nextRef : field === 'confirm' ? confirmRef : null;
    target?.current?.focus();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalid = validate(current, next, confirm);
    if (invalid) {
      fail(invalid.field, invalid.message);
      return;
    }
    setError(null);

    startTransition(async () => {
      const result = await changeAdminPasswordAction({ currentPassword: current, newPassword: next, revokeOtherSessions });
      if (!result.ok) {
        fail(result.field, result.message);
        toast.error(result.message, { id: 'admin-password' });
        return;
      }
      const message = result.revokedSessions > 0 ? p.doneRevoked : p.done;
      setCurrent('');
      setNext('');
      setConfirm('');
      setRevokeOtherSessions(false);
      setDone(message);
      toast.success(message, { id: 'admin-password' });
    });
  }

  const errorId = `${ids}-error`;
  const describe = (field: Field) => (error?.field === field ? errorId : undefined);

  return (
    <Card
      id={PASSWORD_SECTION_ID}
      // The header is sticky: without the margin, the anchor lands the
      // section's title underneath it.
      className="scroll-mt-[calc(var(--admin-header-h)+1rem)] border-line bg-surface-2"
    >
      <CardHeader className="flex flex-row items-center gap-2">
        <KeyRound className="size-5 text-accent-text" aria-hidden="true" />
        <CardTitle>{p.title}</CardTitle>
      </CardHeader>
      <CardBody>
        <p className="mb-4 text-[length:var(--fs-text-sm)] text-fg-muted">{p.lead}</p>
        <form method="post" onSubmit={handleSubmit} className="space-y-4" noValidate>
          <PasswordField
            id={PASSWORD_FIELD_ID}
            inputRef={currentRef}
            label={p.current}
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
            disabled={isPending}
            invalid={error?.field === 'current'}
            describedBy={describe('current')}
          />
          <PasswordField
            id={`${ids}-next`}
            inputRef={nextRef}
            label={p.next}
            hint={p.nextHint}
            value={next}
            onChange={setNext}
            autoComplete="new-password"
            disabled={isPending}
            invalid={error?.field === 'next'}
            describedBy={describe('next')}
          />
          <PasswordField
            id={`${ids}-confirm`}
            inputRef={confirmRef}
            label={p.confirm}
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            disabled={isPending}
            invalid={error?.field === 'confirm'}
            describedBy={describe('confirm')}
          />

          <div className="flex items-start gap-3 rounded-[var(--r-md)] border border-line bg-surface-1 p-3">
            <Checkbox
              id={`${ids}-revoke`}
              checked={revokeOtherSessions}
              onCheckedChange={(checked) => setRevokeOtherSessions(checked === true)}
              disabled={isPending}
              className="mt-0.5"
              aria-describedby={`${ids}-revoke-hint`}
            />
            <div className="space-y-0.5">
              <label htmlFor={`${ids}-revoke`} className="cursor-pointer text-[length:var(--fs-text-sm)] font-medium text-fg">
                {p.revoke}
              </label>
              <p id={`${ids}-revoke-hint`} className="text-[length:var(--fs-text-xs)] text-fg-muted">
                {p.revokeHint}
              </p>
            </div>
          </div>

          {error ? (
            <p
              id={errorId}
              role="alert"
              className="flex items-center gap-2 rounded-[var(--r-md)] border border-[color-mix(in_oklch,var(--err),transparent_65%)] bg-[color-mix(in_oklab,var(--err)_8%,var(--n-2))] p-2.5 text-[length:var(--fs-text-sm)] text-[color:var(--err)]"
            >
              <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
              {error.message}
            </p>
          ) : null}

          {done ? (
            <p role="status" className="flex items-center gap-2 text-[length:var(--fs-text-sm)] font-medium text-ok">
              <Check className="size-4 shrink-0" aria-hidden="true" />
              {done}
            </p>
          ) : null}

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={isPending} aria-busy={isPending}>
              {isPending ? p.submitting : p.submit}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function PasswordField({
  id,
  inputRef,
  label,
  hint,
  value,
  onChange,
  autoComplete,
  disabled,
  invalid,
  describedBy,
}: {
  id: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  disabled: boolean;
  invalid: boolean;
  describedBy?: string;
}) {
  const [shown, setShown] = useState(false);
  const hintId = hint ? `${id}-hint` : undefined;
  const describedByIds = [hintId, describedBy].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      <Label htmlFor={id} className="mb-1.5 block">
        {label}
      </Label>
      <div className="relative">
        <Input
          ref={inputRef}
          id={id}
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          disabled={disabled}
          invalid={invalid}
          aria-describedby={describedByIds}
          dir="ltr"
          className="pe-11"
        />
        {/* A real button, in the tab order: a keyboard user who cannot see
            what they typed is the one this control exists for. */}
        <button
          type="button"
          onClick={() => setShown((previous) => !previous)}
          className="absolute inset-y-0 end-0 flex w-11 items-center justify-center text-fg-muted transition-colors hover:text-fg"
          // One name in both states — `aria-pressed` says which, and a
          // toggle whose name flips is announced as its opposite.
          aria-label={p.show}
          aria-pressed={shown}
          aria-controls={id}
        >
          {shown ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
      </div>
      {hint ? (
        <p id={hintId} className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
