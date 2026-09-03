import Link from 'next/link';
import {
  BookMarked,
  ChevronLeft,
  FileImage,
  FileText,
  Home,
  Plus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { getSession } from '@/lib/session';
import { getAdminOverviewStats } from '@/lib/admin-overview';
import { ADMIN_NAV, ADMIN_NAV_GROUPS } from '@/components/admin/nav-items';
import { OverviewQueues } from '@/components/admin/overview-queues';

export const metadata = { title: copy.admin.title };

const c = copy.admin.overview;

/** The things an editor starts a session by doing. */
const QUICK_ACTIONS: { href: string; label: string; icon: LucideIcon; permission: string }[] = [
  { href: '/admin/courses/new', label: c.quickNewCourse, icon: Plus, permission: 'course:create' },
  { href: '/admin/home', label: c.quickHomeBlocks, icon: Home, permission: 'home:read' },
  { href: '/admin/media', label: c.quickMedia, icon: FileImage, permission: 'media:read' },
];

/**
 * The overview: the queues that are holding work, the standing counts, and a
 * permission-filtered directory of every section the caller can reach —
 * grouped exactly the way the sidebar groups them, so the two never disagree
 * about what «الموقع» contains.
 *
 * ## Why the tiles carry a sentence now
 *
 * They used to carry an icon and the section's name, which is precisely what
 * the sidebar two columns over already showed. Twenty of those is a menu drawn
 * twice, and the second copy earned its space by being bigger rather than by
 * saying more. Each tile now answers «القسم ده بيعمل إيه» (`copy.admin.navBlurb`),
 * which is the question someone opening `/admin` after a week away actually
 * has.
 *
 * ## Why «محتاج تصرّف» is a client component and sits first
 *
 * The three standing numbers below it do not change in a day. What changes in
 * an hour is how many people are waiting on a decision, and those counts are
 * already being polled for the sidebar badges — `<OverviewQueues>` reads the
 * same contexts and renders nothing at all when every queue is empty.
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
      {/* The quick actions moved ONTO the header row. They were a section of
          their own — a heading, then three small buttons on an otherwise empty
          band — which spent a whole horizontal stripe of the page on three
          links. Beside the title they read as what they are: the toolbar for
          this screen. */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">
            {copy.admin.title}
          </h1>
          <p className="mt-2 max-w-[var(--w-prose)] text-fg-muted">{copy.admin.overviewLead}</p>
        </div>

        {actions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {actions.map((action, index) => {
              const Icon = action.icon;
              // The FIRST action only is solid. «كورس جديد» is the thing this
              // screen exists to start; three equally-weighted buttons is a
              // toolbar with no answer to "which one".
              const solid = index === 0;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className={
                    solid
                      ? 'inline-flex items-center gap-2 rounded-[var(--r-md)] bg-accent px-3 py-2 text-[length:var(--fs-text-sm)] font-medium text-[#1A1206] transition-colors duration-[160ms] hover:bg-accent-hover'
                      : 'inline-flex items-center gap-2 rounded-[var(--r-md)] border border-line bg-surface-2 px-3 py-2 text-[length:var(--fs-text-sm)] text-fg transition-colors duration-[160ms] hover:border-line-strong hover:bg-surface-3'
                  }
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  {action.label}
                </Link>
              );
            })}
          </div>
        ) : null}
      </header>

      <OverviewQueues />

      {stats ? (
        <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatTile value={stats.students} label={c.statStudents} icon={Users} />
          <StatTile value={stats.published} label={c.statPublished} icon={BookMarked} />
          <StatTile value={stats.drafts} label={c.statDrafts} icon={FileText} />
        </section>
      ) : (
        <p className="mb-8 rounded-lg border border-dashed border-line px-4 py-3 text-[length:var(--fs-text-sm)] text-fg-muted">
          {c.statsUnavailable}
        </p>
      )}

      <section>
        <div className="group-head">
          <span className="group-head__mark" aria-hidden="true" />
          <h2 className="group-head__title">{c.sectionsTitle}</h2>
          <span className="group-head__note">{c.sectionsLead}</span>
        </div>

        <div className="space-y-6">
          {ADMIN_NAV_GROUPS.filter((group) => group.labelAr !== null).map((group) => {
            const items = ADMIN_NAV.filter(
              (item) => item.group === group.id && permissions.includes(item.permission),
            );
            if (items.length === 0) return null;

            return (
              <div key={group.id}>
                <p className="nav-group__head mb-2">{group.labelAr}</p>
                {/* `auto-rows-fr` so a tile with a two-line blurb does not
                    leave its row-mates short — a grid of cards that are all
                    different heights is what made the old one read as a list
                    of accidents. */}
                <div className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const note = copy.admin.navBlurb[item.href];
                    return (
                      <Link key={item.href} href={item.href} className="panel section-tile">
                        <span className="section-tile__well" aria-hidden="true">
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="section-tile__title block">{item.labelAr}</span>
                          {note ? <span className="section-tile__note block">{note}</span> : null}
                        </span>
                        {/* Inline-start-pointing: this is an RTL document, so
                            "forward" is to the left. */}
                        <ChevronLeft className="section-tile__go size-4" aria-hidden="true" />
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

function StatTile({
  value,
  label,
  icon: Icon,
}: {
  value: string | number;
  label: string;
  icon: LucideIcon;
}) {
  return (
    <div className="panel stat-tile">
      <span className="stat-tile__well" aria-hidden="true">
        <Icon className="size-5" />
      </span>
      <span>
        <span className="stat-tile__value block">{value}</span>
        <span className="stat-tile__label block">{label}</span>
      </span>
    </div>
  );
}
