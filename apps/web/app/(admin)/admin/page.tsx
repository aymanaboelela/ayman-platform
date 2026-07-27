import Link from 'next/link';
import { Card, CardBody } from '@ayman/ui';
import { copy } from '@ayman/contracts';
import { getSession } from '@/lib/session';
import { ADMIN_NAV } from '@/components/admin/nav-items';

export const metadata = { title: copy.admin.title };

/**
 * The overview: a permission-filtered grid of every section the caller can
 * reach. No widgets that need their own endpoint yet — those land with each
 * section's own task. `/admin` itself only needs `admin:access`, which the
 * layout already asserted, so this page trusts the session it re-reads.
 */
export default async function AdminOverviewPage() {
  const session = await getSession();
  const permissions = session?.permissions ?? [];
  const sections = ADMIN_NAV.filter(
    (item) => item.href !== '/admin' && permissions.includes(item.permission),
  );

  return (
    <>
      <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">{copy.admin.title}</h1>
      <p className="mt-4 max-w-[var(--w-prose)] text-fg-muted">{copy.admin.overviewLead}</p>

      <div className="mt-24 grid grid-cols-1 gap-16 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="block">
              <Card className="h-full transition-colors duration-150 hover:border-line-strong">
                <CardBody className="flex items-center gap-12">
                  <Icon className="size-5 shrink-0 text-fg-muted" aria-hidden="true" />
                  <span className="font-[var(--fw-medium)] text-fg">{item.labelAr}</span>
                </CardBody>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
