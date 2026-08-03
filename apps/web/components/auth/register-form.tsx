'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RegisterSchema, type Register, copy } from '@ayman/contracts';
import { Button } from '@ayman/ui';
import { signUpWithEmail } from '@/lib/auth-client';
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
      await signUpWithEmail({
        name: values.name,
        email: values.email,
        password: values.password,
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
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <FormField
        label={copy.auth.fields.name}
        type="text"
        autoComplete="name"
        errorMessage={errors.name?.message}
        {...register('name')}
      />
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
    </form>
  );
}
