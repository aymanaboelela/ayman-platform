'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoginSchema, type Login, copy } from '@ayman/contracts';
import { Button } from '@ayman/ui';
import { signInWithEmail } from '@/lib/auth-client';
import { resolvePostLoginDestination } from '@/lib/onboarding-redirect';
import { FormField } from './form-field';
import { AuthProviders } from './auth-providers';

export function LoginForm() {
  const router = useRouter();
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
    const destination = await resolvePostLoginDestination();
    router.replace(destination);
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

      <AuthProviders />
    </form>
  );
}
