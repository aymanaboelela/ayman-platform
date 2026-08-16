'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoginSchema, resolveLoginIdentifier, type Login } from '@ayman/contracts/auth';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import {
  AuthRequestError,
  BANNED_ACCOUNT_CODE,
  signInWithEmail,
  signInWithPhone,
} from '@/lib/auth-client';
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
      /**
       * One field in, two endpoints out. The student is never asked which kind
       * of account they have — see `resolveLoginIdentifier`, which also hands
       * back the E.164 form, since `/sign-in/phone-number` matches the stored
       * number by exact string.
       *
       * Unparseable input deliberately goes to the EMAIL endpoint rather than
       * being rejected here: a typo then earns the same generic 401 as any
       * other wrong credential, instead of a client-side branch that "wrong
       * password" does not have (S1).
       */
      const identifier = resolveLoginIdentifier(values.identifier);
      await (identifier.kind === 'phone'
        ? signInWithPhone({ phoneNumber: identifier.value, password: values.password })
        : signInWithEmail({ email: identifier.value, password: values.password }));
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
    /*
     * `method="post"` — on a form that never intends to submit natively.
     *
     * This is a CREDENTIAL LEAK guard, not a routing decision. A form with no
     * `method` submits as GET, and the markup is in the SSR'd HTML long before
     * React attaches `onSubmit`. Press «دخول» in that window — a slow phone, a
     * cold cache, a bad connection, or simply typing fast — and the browser
     * submits the form itself: the page reloads as
     * `/login?email=…&password=…`, with the password in plain text in the URL.
     *
     * From there it is in the browser's history, in the `Referer` of the next
     * request, and in every access log between the student and the origin.
     * Caught for real on production while signing in with Playwright, which
     * clicks the instant the button is visible — exactly what a fast finger on
     * a slow page does.
     *
     * POST puts the fields in the request BODY. Next has no POST handler for
     * this page route, so a pre-hydration press now costs a re-render of the
     * login page and leaks nothing. Once hydrated, `handleSubmit` calls
     * `preventDefault()` and no native submit happens at all.
     *
     * `register-form.tsx` carries the same guard for the same reason — and it
     * has a name and a phone number to lose as well as a password.
     */
    <form method="post" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {/*
        `type="text"`, NOT `type="email"` — the field now legitimately holds a
        phone number, and a browser that validates it as an address would
        block the submit before React ever sees it. `autoComplete="username"`
        is the correct token for an identifier that may be either; `email`
        would stop password managers offering a phone-registered account.
      */}
      <FormField
        label={copy.auth.fields.identifier}
        type="text"
        autoComplete="username"
        dir="ltr"
        errorMessage={errors.identifier?.message}
        {...register('identifier')}
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
