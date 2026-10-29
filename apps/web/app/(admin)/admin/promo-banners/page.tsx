import { notFound } from 'next/navigation';
import { GalleryHorizontalEnd } from 'lucide-react';
import {
  PROMO_BANNER_MAX,
  PromoBannerListSchema,
  cairoDayKey,
} from '@ayman/contracts/admin/promo-banners';
import { promoBannersCopy } from '@ayman/contracts/copy/promo-banners';
import { adminGet } from '@/lib/admin-api';
import { getEntitlements } from '@/lib/entitlements';
import { getTaxonomyOrNull } from '@/lib/taxonomy';
import { PromoBannerBoard } from './banner-board';
import { PromoBannerDialog, type YearOption } from './banner-dialog';

const c = promoBannersCopy.admin;

export const metadata = { title: c.title };

/**
 * `/admin/promo-banners` — «البانرات الترويجية»: what goes on top of every
 * student's dashboard, in what order, for whom and until when.
 *
 * ## 404 when the feature is off
 *
 * Like `/admin/honor-board`: on a stack without `promoBanners` this screen
 * does not exist, and the routes behind it answer 404 too — a form that fills
 * and then fails on save is worse than no link at all.
 *
 * ## Uncached
 *
 * An editor must see their own write immediately. The STUDENT read is the
 * cached one, and every action here `updateTag`s it.
 */
export default async function PromoBannersPage() {
  if (!(await getEntitlements()).promoBanners) notFound();

  const [banners, taxonomy] = await Promise.all([
    adminGet('/api/admin/promo-banners', PromoBannerListSchema),
    getTaxonomyOrNull(),
  ]);

  /*
   * The stack's own year names, first system wins — the same rule the
   * students filter (`/admin/students`) labels years by, so «الصف التاني»
   * reads the same on both screens. Generic names only when the taxonomy
   * read failed.
   */
  const labels = new Map<number, string>();
  for (const system of taxonomy?.systems ?? []) {
    for (const year of system.years) {
      if (!labels.has(year.year)) labels.set(year.year, year.labelAr);
    }
  }
  const yearOptions: YearOption[] =
    labels.size > 0
      ? [...labels.entries()].sort(([a], [b]) => a - b).map(([year, label]) => ({ year, label }))
      : c.yearFallback.map((label, index) => ({ year: index + 1, label }));

  const atCap = banners.length >= PROMO_BANNER_MAX;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-[length:var(--fs-title-2)] font-semibold text-fg">
            <GalleryHorizontalEnd className="size-6 text-accent" strokeWidth={1.5} aria-hidden="true" />
            {c.title}
          </h1>
          <p className="mt-1 max-w-2xl text-[length:var(--fs-text-sm)] text-fg-muted">{c.lead}</p>
        </div>
        <PromoBannerDialog banner={null} yearOptions={yearOptions} disabled={atCap} />
      </header>

      <PromoBannerBoard banners={banners} yearOptions={yearOptions} today={cairoDayKey(new Date())} atCap={atCap} />
    </div>
  );
}
