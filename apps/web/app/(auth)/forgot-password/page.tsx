import Link from 'next/link';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { copy } from '@ayman/contracts/copy';
import { passwordResetCopy } from '@ayman/contracts/copy/password-reset';
import { waMeHref } from '@ayman/contracts/whatsapp';
import { PasswordResetForm } from '@/components/auth/password-reset-form';
import { featureEnabled } from '@/lib/entitlements';
import { getPublicSettingsOrDefaults } from '@/lib/settings';
import { TENANT_CONTACT_FALLBACK } from '@/lib/tenant-contact';

export const metadata: Metadata = { title: passwordResetCopy.title };

/**
 * «نسيت كلمة السر» — `/forgot-password`, beside `/login` in the same shell.
 *
 * `notFound()` where `passwordReset` is off: the API 404s both routes there,
 * and a page whose only button can only fail is worse than no page. The same
 * entitlement decides whether `/login` links here at all.
 *
 * `connection()` first: the Turnstile key is per stack and read per request
 * (`register/page.tsx` reads it the same way, for the same reason), and that
 * read must not be baked into a prerender. The sibling `loading.tsx` is the
 * Suspense boundary it needs.
 *
 * The support link is resolved exactly as `/login` resolves it —
 * `contact.whatsapp`, then `TENANT_CONTACT_FALLBACK`, which is gated on
 * `TENANT_KEY` — so another stack falls back to ITS number or to none.
 */
export default async function ForgotPasswordPage() {
  await connection();
  if (!(await featureEnabled('passwordReset'))) notFound();

  const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY?.trim() || null;
  const settings = await getPublicSettingsOrDefaults();
  const supportHref = waMeHref(settings.contact.whatsapp ?? TENANT_CONTACT_FALLBACK.whatsapp);

  return (
    <>
      <header className="auth-head">
        <h1 className="auth-head__title">{passwordResetCopy.title}</h1>
        <p className="auth-head__sub">{passwordResetCopy.subtitle}</p>
      </header>

      <PasswordResetForm turnstileSiteKey={turnstileSiteKey} supportHref={supportHref} />

      <p className="auth-switch">
        <Link href="/login">{copy.auth.switch.login}</Link>
      </p>
    </>
  );
}
