'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoginSchema, type Login } from '@ayman/contracts/auth';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { AuthRequestError, BANNED_ACCOUNT_CODE, signInWithEmail } from '@/lib/auth-client';
import { resolvePostLoginDestination } from '@/lib/onboarding-redirect';
import { FormField } from './form-field';
import { AuthProviders } from './auth-providers';

/**
 * `next` arrives as a prop from the page's Server Component rather than from
 * `useSearchParams()` here. Reading it on the server keeps this component out
 * of the Suspense/`cacheComponents` dance a client-side search-params read
 * would require, and means the value is validated by `safeNext` once, before it
 * is ever rendered into a link.
 */
export function LoginForm({ next }: { next?: string | null }) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Login>({ resolver: zodResolver(LoginSchema) });

  async function onSubmit(values: Login) {
    setFormError(null);
    try {
      await signInWithEmail(values);
    } catch (error) {
      /*
       * حظر is the ONE failure this form distinguishes, and the exception is
       * narrow by construction rather than by discipline.
       *
       * The API emits `ACCOUNT_BANNED` only after the submitted password has
       * VERIFIED (`login-security.hook.ts`), so reaching this branch already
       * required holding the account's credentials. It therefore leaks nothing
       * — which is the specific property that makes it safe, and the reason
       * the rule below is otherwise untouched.
       *
       * Everything else — unknown email, wrong password, the progressive-delay
       * soft lock, a network error — still renders one identical copy-sourced
       * string. The server returns byte-identical responses across those (S1),
       * and this UI must not become a second place that pulls them apart, so
       * the caught error's status/message are still never inspected for them.
       */
      if (error instanceof AuthRequestError && error.code === BANNED_ACCOUNT_CODE) {
        setFormError(
          [
            copy.auth.errors.loginBanned,
            error.reason
              ? formatCopy(copy.auth.errors.loginBannedReason, { reason: error.reason })
              : null,
            copy.auth.errors.loginBannedContact,
          ]
            .filter(Boolean)
            .join(' '),
        );
        return;
      }

      setFormError(copy.auth.errors.login);
      return;
    }
    const destination = await resolvePostLoginDestination(next);

    // A FULL page navigation, not `router.replace` — the mirror image of the
    // rule `auth-client.ts`'s `signOut` already documents, and for the same
    // reason: Next's client router cache holds Server Component payloads that
    // were fetched under the PREVIOUS session state, and a soft navigation
    // reuses them.
    //
    // It only became visible once `next` existed. Landing on `/dashboard` was
    // always safe by luck — an anonymous visitor can never have rendered it, so
    // there was nothing stale to serve. `next` points at a page the visitor was
    // looking at SECONDS AGO while signed out, which is precisely the page
    // guaranteed to be in that cache. Observed end-to-end: the course page came
    // back with the signed-out header ("تسجيل الدخول / حساب جديد") and a start
    // button still frozen in the pending state it had when it redirected here.
    window.location.assign(destination);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <FormField
        label={copy.auth.fields.email}
        type="email"
        autoComplete="email"
        errorMessage={errors.email?.message}
        {...register('email')}
      />
      <FormField
        label={copy.auth.fields.password}
        type="password"
        autoComplete="current-password"
        errorMessage={errors.password?.message}
        {...register('password')}
      />

      {formError && (
        <p role="alert" className="text-[length:var(--fs-text-sm)] text-[color:var(--err)]">
          {formError}
        </p>
      )}

      {/* Disabled while the request is in flight — this is also what keeps
          the user from hammering submit during Task 3's progressive delay
          (up to 30s from the 4th attempt onward on one account). No
          client-side fetch timeout is set anywhere in `lib/auth-client.ts`:
          `fetch` has no default timeout, so that wait is handled gracefully
          rather than erroring out early. */}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? copy.auth.actions.loginPending : copy.auth.actions.login}
      </Button>

      <AuthProviders next={next} />
    </form>
  );
}
