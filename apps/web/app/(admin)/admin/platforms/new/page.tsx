import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { ArrowRight, PlugZap } from 'lucide-react';
import { FEATURE_DECLARATIONS } from '@ayman/contracts/admin/entitlements';
import { copy } from '@ayman/contracts/copy/admin';
import { Card, CardBody } from '@ayman/ui';
import { cloudflareConfigured } from '@/lib/provisioning/cloudflare';
import { dokployConfigured } from '@/lib/provisioning/dokploy';
import { IS_AYMAN } from '@/lib/tenant';
import { NewTeacherForm } from './new-teacher-form';

export const metadata = { title: copy.admin.tenants.newTitle };

/**
 * «مدرّس جديد» — the form that replaces `docs/runbooks/new-tenant.md` §1–§7.
 *
 * Gated three ways like its parent (`../page.tsx` has the reasoning): hidden
 * from the nav off the owner's stack, `notFound()` here, and the action
 * re-checking for itself. Without Dokploy connected the page explains how to
 * connect it rather than rendering a form whose button can only fail.
 */
export default async function NewTeacherPage() {
  if (!IS_AYMAN) notFound();
  // The two keys are read per request: pasting one into the panel is a
  // restart away from this form, not a rebuild.
  await connection();

  const c = copy.admin.tenants;
  const connected = dokployConfigured();

  return (
    <>
      <Link
        href="/admin/platforms"
        className="mb-4 inline-flex items-center gap-1 text-[length:var(--fs-text-sm)] text-fg-muted hover:text-fg"
      >
        <ArrowRight aria-hidden="true" className="size-4" />
        {c.back}
      </Link>
      <h1 className="mb-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.newTitle}</h1>
      <p className="mb-6 max-w-[var(--w-prose)] text-fg-muted">{c.newLead}</p>

      {connected ? (
        <NewTeacherForm features={FEATURE_DECLARATIONS} cloudflare={cloudflareConfigured()} />
      ) : (
        <Card>
          <CardBody className="flex items-start gap-3">
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent-text">
              <PlugZap className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-fg">{c.notConnectedNew}</p>
              <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.notConnectedHint}</p>
              <p dir="ltr" className="mono mt-2 text-start text-[length:var(--fs-mono-label)] text-fg-muted" style={{ unicodeBidi: 'isolate' }}>
                CONTROL_PLANE_DOKPLOY_KEY=…
              </p>
            </div>
          </CardBody>
        </Card>
      )}
    </>
  );
}
