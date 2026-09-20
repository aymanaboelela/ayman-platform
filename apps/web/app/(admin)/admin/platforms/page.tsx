import { notFound } from 'next/navigation';
import { FEATURE_DECLARATIONS } from '@ayman/contracts/admin/entitlements';
import { copy } from '@ayman/contracts/copy/admin';
import { Card, CardBody } from '@ayman/ui';
import { controlPlaneTenants } from '@/lib/control-plane';
import { IS_AYMAN } from '@/lib/tenant';
import { PlatformsForm } from './platforms-form';

export const metadata = { title: copy.admin.platforms.title };

/**
 * «منصات المدرّسين» — the control plane.
 *
 * Every other admin screen configures the stack it is running on. This one
 * configures somebody ELSE's, by signing a document that their stack verifies
 * with a compiled-in public key and then reads at boot. There is no request
 * between the two stacks in either direction, and there is not going to be:
 * that is what keeps an outage here from taking three platforms down with it
 * (CLAUDE.md §٢).
 *
 * ## `notFound()`, and why it is the third gate rather than the first
 *
 * `visibleNavItems` hides the sidebar link and the `/admin` tile, but neither
 * of those is a lock — a typed URL reaches this file regardless. `notFound()`
 * rather than a 403 for the same reason `(admin)/layout.tsx` uses it: a 403
 * confirms the screen exists, and an instructor poking at their own admin
 * should not learn that a control plane is a thing. The action behind the sign
 * button re-checks on its own; see its header for why it cannot rely on this.
 *
 * ## Uncached
 *
 * `IS_AYMAN` is a build-time constant and the tenant list is read from the
 * environment per request, so there is nothing here worth a `'use cache'` —
 * and the admin subtree is forced dynamic by `getSession()` in the layout
 * anyway.
 */
export default function PlatformsPage() {
  if (!IS_AYMAN) notFound();

  const tenants = controlPlaneTenants();
  const c = copy.admin.platforms;

  return (
    <>
      <h1 className="mb-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
      <p className="mb-6 max-w-[var(--w-prose)] text-fg-muted">{c.lead}</p>

      {tenants.length === 0 ? (
        /*
         * The empty state carries the variable name and the line format,
         * because there is nowhere else to look it up: `deploy/tenants/` is
         * gitignored and the runbook tells you to delete the env file once the
         * stack is up. An empty picker with no instructions is a screen that
         * cannot be fixed from itself.
         */
        <Card>
          <CardBody>
            <p className="text-fg">{c.noTenants}</p>
            <p className="mt-2 text-[length:var(--fs-text-sm)] text-fg-muted">{c.noTenantsHint}</p>
            <p
              className="mt-3 font-mono text-[length:var(--fs-mono-label)] text-fg-muted"
              // A Latin variable name and a slug inside an Arabic paragraph
              // reverse without these two (CLAUDE.md §٧).
              dir="ltr"
              style={{ unicodeBidi: 'isolate' }}
            >
              CONTROL_PLANE_TENANTS=mohamed-sabry=م. محمد صبري
            </p>
          </CardBody>
        </Card>
      ) : (
        <PlatformsForm tenants={tenants} features={FEATURE_DECLARATIONS} />
      )}
    </>
  );
}
