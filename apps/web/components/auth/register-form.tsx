'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RegisterSchema, type Register } from '@ayman/contracts/auth';
import { copy } from '@ayman/contracts/copy';
import { Button } from '@ayman/ui/components/button';
import { signUpWithPhone } from '@/lib/auth-client';
import { withNext } from '@/lib/safe-next';
import { FormField } from './form-field';
import { AuthProviders } from './auth-providers';

/** `next` comes from the page's Server Component — see `LoginForm`'s note. */
export function RegisterForm({ next }: { next?: string | null }) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Register>({ resolver: zodResolver(RegisterSchema) });

  async function onSubmit(values: Register) {
    setFormError(null);
    try {
      // `confirmPassword` exists only to drive the client-side match check
      // in `RegisterSchema` — Better Auth's `/sign-up/email` route has no
      // such field, so it is dropped here rather than sent.
      //
      // `values.phone` is already E.164: `RegisterSchema` transforms it. The
      // server normalises again in `createAuthBeforeHook`, since a form is
      // never the guarantee.
      await signUpWithPhone({
        name: values.name,
        /**
         * Omitted entirely when the student left it blank — no invented
         * address leaves this form. `users.email` is genuinely nullable, and
         * the one place a throwaway value is still needed (Better Auth's
         * `/sign-up/email` validates its body with `z.email()` before any hook
         * runs) is handled server-side in `createAuthBeforeHook`, which mints
         * it and `databaseHooks.user.create.before` strips it again.
         */
        ...(values.email ? { email: values.email } : {}),
        password: values.password,
        phoneNumber: values.phone,
      });
    } catch {
      // One generic message for every registration failure (duplicate
      // email, a rejected password, a network error) — the same principle
      // Task 3 applies to login (S1): no raw API error text reaches the
      // user, and the UI never becomes the place that spells out which
      // specific thing was wrong.
      setFormError(copy.auth.errors.register);
      return;
    }
    // A brand-new account has never completed onboarding — no need to ask
    // the server first, unlike LoginForm, which genuinely doesn't know.
    //
    // `next` rides along rather than being followed: a visitor who clicked a
    // course, had no account, and registered here still owes us a profile
    // before they reach it. `OnboardingForm` takes them there once they do.
    //
    // Full page navigation for the same reason as `LoginForm` — a session now
    // exists that did not a moment ago, and every cached Server Component
    // payload in the client router was fetched without one.
    window.location.assign(withNext('/onboarding', next));
  }

  return (
    /*
     * `method="post"`, and see `login-form.tsx` for the whole reasoning.
     *
     * A form with no `method` submits as GET, and the markup exists before
     * React attaches `onSubmit` — so a press in that window reloads the page as
     * `/register?name=…&email=…&password=…`. This one has MORE to lose than the
     * login form: a real name and, once onboarding runs, a phone number, all of
     * them landing in browser history and every access log on the way.
     *
     * POST keeps them in the body. After hydration `handleSubmit` prevents the
     * native submit entirely and this attribute never comes into play.
     */
    <form method="post" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <FormField
        label={copy.auth.fields.name}
        type="text"
        autoComplete="name"
        errorMessage={errors.name?.message}
        {...register('name')}
      />
      {/*
        `dir="ltr"` and `inputMode="numeric"`: an Egyptian number is typed
        left-to-right even inside an RTL page, and without the direction
        override the leading `0` and any `+` land on the wrong end visually
        while the value underneath is fine — which is worse than a plain bug,
        because the student retypes a number that was already correct.
      */}
      <FormField
        label={copy.auth.fields.phone}
        type="tel"
        autoComplete="tel"
        inputMode="numeric"
        dir="ltr"
        placeholder={copy.auth.fields.phonePlaceholder}
        errorMessage={errors.phone?.message}
        {...register('phone')}
      />
      <FormField
        label={copy.auth.fields.emailOptional}
        type="email"
        autoComplete="email"
        dir="ltr"
        hint={copy.auth.fields.emailOptionalHint}
        errorMessage={errors.email?.message}
        {...register('email')}
      />
      <FormField
        label={copy.auth.fields.password}
        type="password"
        autoComplete="new-password"
        errorMessage={errors.password?.message}
        {...register('password')}
      />
      <FormField
        label={copy.auth.fields.confirmPassword}
        type="password"
        autoComplete="new-password"
        errorMessage={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />

      {formError && (
        <p role="alert" className="text-[length:var(--fs-text-sm)] text-[color:var(--err)]">
          {formError}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? copy.auth.actions.registerPending : copy.auth.actions.register}
      </Button>

      <AuthProviders next={next} />

      {/*
        `/register` is PUBLIC and not disallowed in robots.txt, so it is the
        account-creation page a crawler — and Google's social-engineering
        classifier — actually reaches. It had no link to a privacy policy or
        terms because neither page existed until 2026-08-06. Both do now, and
        this is the sentence that connects them to the moment of consent.
      */}
      <p className="text-center text-[length:var(--fs-text-sm)] text-fg-muted">
        {copy.auth.legalBefore}{' '}
        <Link href="/terms" className="underline underline-offset-2">
          {copy.legal.termsTitle}
        </Link>{' '}
        {copy.auth.legalAnd}{' '}
        <Link href="/privacy" className="underline underline-offset-2">
          {copy.legal.privacyTitle}
        </Link>
        .
      </p>
    </form>
  );
}
