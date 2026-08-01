import Link from 'next/link';
import { FileImage, Home, Plus, Scale, type LucideIcon } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { getSession } from '@/lib/session';
import { getAdminOverviewStats, APPEALS_CAP } from '@/lib/admin-overview';
import { ADMIN_NAV, ADMIN_NAV_GROUPS } from '@/components/admin/nav-items';

export const metadata = { title: copy.admin.title };

const c = copy.admin.overview;

/** The four things an editor starts a session by doing. */
const QUICK_ACTIONS: { href: string; label: string; icon: LucideIcon; permission: string }[] = [
  { href: '/admin/courses/new', label: c.quickNewCourse, icon: Plus, permission: 'course:create' },
  { href: '/admin/home', label: c.quickHomeBlocks, icon: Home, permission: 'home:read' },
  { href: '/admin/media', label: c.quickMedia, icon: FileImage, permission: 'media:read' },
  { href: '/admin/appeals', label: c.quickAppeals, icon: Scale, permission: 'appeal:read' },
];

/**
 * The overview: four counts, the quick actions, then a permission-filtered
 * grid of every section the caller can reach — grouped exactly the way the
 * sidebar groups them, so the two never disagree about what "the site
 * section" contains.
 *
 * `/admin` itself only needs `admin:access`, which the layout already
 * asserted, so this page trusts the session it re-reads. `getAdminOverviewStats`
 * never throws; a `null` return renders the fallback line instead of the strip.
 */
export default async function AdminOverviewPage() {
  const session = await getSession();
  const permissions = session?.permissions ?? [];

  const stats = await getAdminOverviewStats();
  const actions = QUICK_ACTIONS.filter((action) => permissions.includes(action.permission));

  return (
    <div className="mx-auto w-full max-w-[76rem]">
      <header className="mb-6">
        <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">
          {copy.admin.title}
        </h1>
        <p className="mt-2 max-w-[var(--w-prose)] text-fg-muted">{copy.admin.overviewLead}</p>
      </header>

      {stats ? (
        <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard value={stats.students} label={c.statStudents} />
          <StatCard value={stats.published} label={c.statPublished} />
          <StatCard value={stats.drafts} label={c.statDrafts} />
          <StatCard
            value={stats.appealsCapped ? `${APPEALS_CAP}+` : stats.appeals}
            label={c.statAppeals}
            alert={stats.appeals > 0}
          />
        </section>
      ) : (
        <p className="mb-6 rounded-lg border border-dashed border-line px-4 py-3 text-[length:var(--fs-text-sm)] text-fg-muted">
          {c.statsUnavailable}
        </p>
      )}

      {actions.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-[length:var(--fs-title-4)] font-medium text-fg">
            {c.quickTitle}
          </h2>
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-2',
                    'text-[length:var(--fs-text-sm)] text-fg',
                    'transition-colors duration-[160ms] ease-out hover:border-line-strong hover:bg-surface-3',
                  )}
                >
                  <Icon className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                  {action.label}
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="text-[length:var(--fs-title-4)] font-medium text-fg">{c.sectionsTitle}</h2>
        <p className="mt-1 mb-4 text-[length:var(--fs-text-sm)] text-fg-muted">{c.sectionsLead}</p>

        <div className="space-y-6">
          {ADMIN_NAV_GROUPS.filter((group) => group.labelAr !== null).map((group) => {
            const items = ADMIN_NAV.filter(
              (item) => item.group === group.id && permissions.includes(item.permission),
            );
            if (items.length === 0) return null;

            return (
              <div key={group.id}>
                <p className="mb-2 text-[length:var(--fs-text-xs)] font-medium text-fg-muted">
                  {group.labelAr}
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 rounded-lg border border-line bg-surface-2 p-4',
                          'transition-colors duration-[160ms] ease-out',
                          'hover:border-line-strong hover:bg-surface-3',
                        )}
                      >
                        <span
                          className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_oklch,var(--a-9),transparent_88%)] text-accent-text"
                          aria-hidden="true"
                        >
                          <Icon className="size-4" />
                        </span>
                        <span className="font-medium text-fg">{item.labelAr}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/**
 * `alert` tints only the appeals tile, and only when the queue is non-empty:
 * a warning colour that is always on is a decoration nobody reads. `--warn`
 * rather than `--err` — a pending appeal is work waiting, not a failure.
 */
function StatCard({
  value,
  label,
  alert = false,
}: {
  value: string | number;
  label: string;
  alert?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        alert
          ? 'border-[color-mix(in_oklch,var(--warn),transparent_66%)] bg-[color-mix(in_oklch,var(--warn),transparent_94%)]'
          : 'border-line bg-surface-2',
      )}
    >
      <p
        className={cn(
          'tabular text-[length:var(--fs-title-2)] font-semibold leading-none',
          alert ? 'text-[color:var(--warn)]' : 'text-fg',
        )}
      >
        {value}
      </p>
      <p className="mt-2 text-[length:var(--fs-text-sm)] text-fg-muted">{label}</p>
    </div>
  );
}
