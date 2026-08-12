'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoginSchema, type Login } from '@ayman/contracts/auth';
import { copy } from '@ayman/contracts/copy';
import { Button } from '@ayman/ui/components/button';
import { signInWithEmail } from '@/lib/auth-client';
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
    } catch {
      // Every login failure — unknown email, wrong password, a locked
      // account (Task 3's progressive-delay soft lock), or a genuine
      // network error — renders this exact same copy-sourced string. The
      // server itself already returns byte-identical responses across the
      // first three (S1); this UI must not become a second place that
      // distinguishes them, so the caught error's status/code/message are
      // deliberately never inspected here.
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
