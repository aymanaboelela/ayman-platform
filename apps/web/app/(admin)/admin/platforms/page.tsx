import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { FEATURE_DECLARATIONS } from '@ayman/contracts/admin/entitlements';
import { copy } from '@ayman/contracts/copy/admin';
import { Card, CardBody, SkeletonCardGrid } from '@ayman/ui';
import { dokployConfigured } from '@/lib/provisioning/dokploy';
import { tenantList } from '@/lib/provisioning/tenants';
import { IS_AYMAN } from '@/lib/tenant';
import { PlatformsForm } from './platforms-form';
import { NewTeacherLink, TenantsSection } from './tenants-section';
import { VideoUsage } from './video-usage';

export const metadata = { title: copy.admin.platforms.title };

/**
 * «منصات المدرّسين» — the control plane.
 *
 * Every other admin screen configures the stack it is running on. This one
 * configures somebody ELSE's — three ways now:
 *
 *   · «المدرّسين»: every instructor stack on the server, read off Dokploy,
 *     with a redeploy and a hand-over button each; «مدرّس جديد» creates one.
 *   · «الصلاحيات»: an entitlements document signed with a key only this
 *     stack holds, which the instructor's stack verifies with a compiled-in
 *     public key — pasted by hand, or written straight into the stack.
 *   · the video bill, from Cloudflare's own numbers.
 *
 * What it still never does is talk to another STACK's application: every
 * request goes to Dokploy or Cloudflare, so an instructor's platform being
 * down cannot break this screen, and this screen being down cannot break
 * theirs (CLAUDE.md §2). The one exception is the first-deploy probe on
 * «مدرّس جديد», which loads the new site's public health URL exactly as a
 * visitor would.
 *
 * ## `notFound()`, and why it is the third gate rather than the first
 *
 * `visibleNavItems` hides the sidebar link and the `/admin` tile, but neither
 * of those is a lock — a typed URL reaches this file regardless. `notFound()`
 * rather than a 403 for the same reason `(admin)/layout.tsx` uses it: a 403
 * confirms the screen exists, and an instructor poking at their own admin
 * should not learn that a control plane is a thing. Every action behind the
 * buttons re-checks on its own (`lib/provisioning/gate.ts`).
 */
export default function PlatformsPage() {
  if (!IS_AYMAN) notFound();

  const c = copy.admin.platforms;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
          <p className="max-w-[var(--w-prose)] text-fg-muted">{c.lead}</p>
        </div>
        <Suspense fallback={null}>
          <NewTeacherButton />
        </Suspense>
      </div>

      {/* Streamed: Dokploy answers per stack, and the header must not wait for it. */}
      <Suspense fallback={<SkeletonCardGrid count={2} columns={2} />}>
        <PlatformsBody />
      </Suspense>
    </>
  );
}

async function NewTeacherButton() {
  // The env is read per request — a key pasted into the panel is a restart,
  // not a rebuild, away from this button appearing.
  await connection();
  return dokployConfigured() ? <NewTeacherLink /> : null;
}

async function PlatformsBody() {
  // Request-time: the list is "what is building right now", and the expiry
  // lines compare against today.
  await connection();
  const list = await tenantList();
  const c = copy.admin.platforms;
  const signable = list.tenants.map((tenant) => ({ key: tenant.key, name: tenant.name }));
  // A tenant Dokploy holds can take a document straight into its environment.
  const appliable = list.tenants.filter((tenant) => tenant.composeId !== null).map((tenant) => tenant.key);

  return (
    <>
      <TenantsSection list={list} now={list.readAt} />

      <section className="mb-8">
        <div className="group-head">
          <span className="group-head__mark" aria-hidden="true" />
          <h2 className="group-head__title">{c.signTitle}</h2>
          <span className="group-head__note">{c.signLead}</span>
        </div>

        {signable.length === 0 ? (
          /*
           * The empty state carries the variable name and the line format,
           * because without Dokploy there is nowhere else to look it up:
           * `deploy/tenants/` is gitignored and the runbook tells you to
           * delete the env file once the stack is up.
           */
          <Card>
            <CardBody>
              <p className="text-fg">{c.noTenants}</p>
              <p className="mt-2 text-[length:var(--fs-text-sm)] text-fg-muted">{c.noTenantsHint}</p>
              <p
                className="mt-3 font-mono text-[length:var(--fs-mono-label)] text-fg-muted"
                // A Latin variable name and a slug inside an Arabic paragraph
                // reverse without these two (CLAUDE.md §7).
                dir="ltr"
                style={{ unicodeBidi: 'isolate' }}
              >
                CONTROL_PLANE_TENANTS=mohamed-sabry=م. محمد صبري
              </p>
            </CardBody>
          </Card>
        ) : (
          <PlatformsForm tenants={signable} features={FEATURE_DECLARATIONS} appliable={appliable} />
        )}
      </section>

      {/* Streamed: Cloudflare can take a second, and the signing form above must not wait for it. */}
      <Suspense fallback={null}>
        <VideoUsage tenants={signable} />
      </Suspense>
    </>
  );
}
