'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthPasswordSchema } from '@ayman/contracts/auth';
import { copy } from '@ayman/contracts/copy';
import { passwordResetCopy as c } from '@ayman/contracts/copy/password-reset';
import { formatCopy } from '@ayman/contracts/format';
import {
  PASSWORD_RESET_LIMITS,
  PasswordResetCodeSchema,
  PasswordResetRequestSchema,
} from '@ayman/contracts/password-reset';
import { egyptianPhoneForLabel } from '@ayman/contracts/phone';
import { Button } from '@ayman/ui/components/button';
import { confirmReset, requestResetCode } from '@/lib/password-reset-client';
import { useTurnstile } from '@/lib/turnstile';
import { FormField } from './form-field';
import { PhoneField } from './phone-field';

/**
 * «نسيت كلمة السر» — the number, then the code and the new password.
 *
 * ## What this page can and cannot know
 *
 * After «إرسال الكود» the server says the same thing for every number:
 * `accepted`. It does not know yet whether an account owns the number — it
 * finds out after answering — and this page never finds out at all. So the
 * code step is worded as a conditional («لو الرقم متسجّل…») and carries the
 * way out (the support WhatsApp link) from the start, not only after a
 * failure: a send that fails after the response is, by design, invisible
 * here.
 *
 * `unavailable` and the limits ARE said, because they are facts about the
 * stack and the caller, identical for every number.
 *
 * `supportHref` is the stack's own WhatsApp link, resolved on the server the
 * way `/login` resolves it — never a literal here (`tenant-identity-leak`).
 */

type Step = 'phone' | 'code' | 'done' | 'google';

interface Refusal {
  message: string;
  contactTeam: boolean;
}

export function PasswordResetForm({
  turnstileSiteKey,
  supportHref,
}: {
  turnstileSiteKey: string | null;
  supportHref: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('phone');
  const [typedPhone, setTypedPhone] = useState('');
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldError, setFieldError] = useState<{ phone?: string; code?: string; password?: string; confirm?: string }>({});
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const { setContainer: setTurnstileBox, getToken, reset: resetTurnstile } = useTurnstile(turnstileSiteKey);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  /** Both «إرسال الكود» and «إرسال كود جديد» — one request, one set of answers. */
  async function sendCode(number: string) {
    setRefusal(null);
    setPending(true);
    let token: string | null;
    try {
      token = await getToken();
    } catch {
      resetTurnstile();
      setPending(false);
      setRefusal({ message: c.errors.humanCheck, contactTeam: false });
      return;
    }
    const result = await requestResetCode(number, token);
    // A Turnstile token is single-use whatever the answer was.
    resetTurnstile();
    setPending(false);

    if (result.kind === 'accepted') {
      setPhone(number);
      setCode('');
      setStep('code');
      setCooldown(PASSWORD_RESET_LIMITS.resendCooldownSeconds);
      return;
    }
    if (result.kind === 'limited') {
      setCooldown(Math.min(result.retryAfterSeconds, 24 * 60 * 60));
      setRefusal({ message: c.errors.limited, contactTeam: true });
      return;
    }
    if (result.kind === 'unavailable') {
      setRefusal({ message: c.errors.unavailable, contactTeam: true });
      return;
    }
    setRefusal({
      message: result.kind === 'human_check' ? c.errors.humanCheck : c.errors.failed,
      contactTeam: false,
    });
  }

  async function onPhoneSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = PasswordResetRequestSchema.safeParse({ phoneNumber: typedPhone });
    if (!parsed.success) {
      setFieldError({ phone: parsed.error.issues[0]?.message });
      return;
    }
    setFieldError({});
    await sendCode(parsed.data.phoneNumber);
  }

  async function onCodeSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!phone) return;
    const errors: typeof fieldError = {};
    const parsedCode = PasswordResetCodeSchema.safeParse(code);
    if (!parsedCode.success) errors.code = parsedCode.error.issues[0]?.message;
    const parsedPassword = AuthPasswordSchema.safeParse(password);
    if (!parsedPassword.success) errors.password = parsedPassword.error.issues[0]?.message;
    else if (password !== confirm) errors.confirm = c.errors.mismatch;
    setFieldError(errors);
    if (Object.keys(errors).length > 0 || !parsedCode.success) return;

    setRefusal(null);
    setPending(true);
    const result = await confirmReset({ phoneNumber: phone, code: parsedCode.data, newPassword: password });
    setPending(false);

    if (result.kind === 'reset') {
      setStep('done');
      return;
    }
    if (result.kind === 'google') {
      setStep('google');
      return;
    }
    setRefusal({
      message:
        result.kind === 'invalid'
          ? c.errors.invalidCode
          : result.kind === 'limited'
            ? c.errors.limited
            : c.errors.failed,
      contactTeam: result.kind !== 'failed',
    });
  }

  const refusalBlock = refusal ? (
    // One alert for the sentence and the link it ends with, so a screen
    // reader announces them as one message — same shape as the login form.
    <div role="alert" className="space-y-1 text-[length:var(--fs-text-sm)] text-[color:var(--err)]">
      <p>{refusal.message}</p>
      {refusal.contactTeam && supportHref ? (
        <a className="inline-block underline" href={supportHref} target="_blank" rel="noopener noreferrer">
          {c.contactTeam}
        </a>
      ) : null}
    </div>
  ) : null;

  if (step === 'done' || step === 'google') {
    const text = step === 'done' ? c.done : c.google;
    return (
      <div className="space-y-5" role="status">
        <div className="auth-notice password-reset-result">
          <p className="password-reset-result__title">{text.title}</p>
          <p>{text.body}</p>
        </div>
        <Button type="button" className="w-full" onClick={() => router.push('/login')}>
          {text.action}
        </Button>
      </div>
    );
  }

  if (step === 'code' && phone) {
    return (
      // `method="post"` for the reason `login-form.tsx` gives: a press before
      // hydration must not put a password in the URL.
      <form method="post" onSubmit={(event) => void onCodeSubmit(event)} noValidate className="space-y-5">
        <p className="auth-notice" role="status">
          {formatCopy(c.codeStep.sent, { phone: egyptianPhoneForLabel(phone) })}
        </p>

        <FormField
          label={c.codeStep.codeLabel}
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          dir="ltr"
          maxLength={PASSWORD_RESET_LIMITS.codeLength + 4}
          hint={c.codeStep.codeHint}
          errorMessage={fieldError.code}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          className="password-reset-code mono"
        />
        <FormField
          label={c.codeStep.newPassword}
          name="newPassword"
          type="password"
          autoComplete="new-password"
          errorMessage={fieldError.password}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <FormField
          label={c.codeStep.confirmPassword}
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          errorMessage={fieldError.confirm}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />

        {refusalBlock}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? c.codeStep.submitting : c.codeStep.submit}
        </Button>

        {/* The widget's box for the RESEND — empty unless Cloudflare wants a click. */}
        {turnstileSiteKey && <div ref={setTurnstileBox} className="flex justify-center" />}

        <div className="password-reset-actions">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending || cooldown > 0}
            onClick={() => void sendCode(phone)}
          >
            {cooldown > 0 ? formatCopy(c.codeStep.resendIn, { seconds: cooldown }) : c.codeStep.resend}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              setStep('phone');
              setRefusal(null);
              setFieldError({});
            }}
          >
            {c.codeStep.changeNumber}
          </Button>
        </div>

        <p className="password-reset-hint">
          {c.codeStep.notArrived}{' '}
          {supportHref ? (
            <a href={supportHref} target="_blank" rel="noopener noreferrer">
              {c.contactTeam}
            </a>
          ) : null}
        </p>
      </form>
    );
  }

  return (
    <form method="post" onSubmit={(event) => void onPhoneSubmit(event)} noValidate className="space-y-5">
      <PhoneField
        label={copy.auth.fields.phone}
        name="phoneNumber"
        autoComplete="tel"
        placeholder={copy.auth.fields.phonePlaceholder}
        errorMessage={fieldError.phone}
        value={typedPhone}
        onChange={(event) => setTypedPhone(event.target.value)}
      />

      {refusalBlock}

      {turnstileSiteKey && <div ref={setTurnstileBox} className="flex justify-center" />}

      <Button type="submit" className="w-full" disabled={pending || cooldown > 0}>
        {pending
          ? c.phoneStep.sending
          : cooldown > 0
            ? formatCopy(c.codeStep.resendIn, { seconds: cooldown })
            : c.phoneStep.send}
      </Button>
    </form>
  );
}
