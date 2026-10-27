import type { BrandImageSlot } from '@ayman/contracts/admin/brand-images';
import { BRAND_IMAGE_SLOT_IDS } from '@ayman/contracts/admin/brand-images';
import { getBrandAsset } from '@/lib/brand-assets';
import { IS_AYMAN, aymanOnly } from '@/lib/tenant';
import { TEACHES_CODE } from '@/lib/tenant-subject';

/**
 * What each picture slot on «الهوية البصرية» is showing on the site while
 * nothing is uploaded into it — the file shipped in the code.
 *
 * Read through the SAME gates the site reads them through (`getBrandAsset`,
 * `aymanOnly`), so another teacher's settings screen never displays Ayman's
 * photographs as «their current picture»: on their stack every entry here is
 * `undefined` and the tile honestly says there is none.
 *
 * `login` and `favicon` are not in the `brandAssets` registry — the login
 * photograph is named in `auth-showcase.tsx` and the icon is a Next file
 * convention (`app/icon.png`) — so they are spelled out here.
 */
export function builtInBrandImages(): Partial<Record<BrandImageSlot, string>> {
  return {
    logo: getBrandAsset('logo')?.src,
    mark: getBrandAsset('mark')?.src,
    favicon: aymanOnly('/icon.png'),
    hero: getBrandAsset('hero')?.src,
    portrait: getBrandAsset('portrait')?.src,
    trackEssentials: getBrandAsset('trackEssentials')?.src,
    trackYear1: getBrandAsset('trackYear1')?.src,
    trackYear2: getBrandAsset('trackYear2')?.src,
    login: aymanOnly('/brand/auth-library.webp'),
    honorHost: getBrandAsset('honorHost')?.src,
    practiceGuide: getBrandAsset('practiceGuide')?.src,
  };
}

/**
 * The slots this stack actually renders somewhere — a card for anything else
 * would be a control that changes nothing a visitor can see.
 *
 *   · the three posters sit on `<CodeYearTracks>` (a programming stack's
 *     landing) and on the practice pages (his stack only);
 *   · the practice photograph only exists where `/practice` does.
 */
export function offeredBrandImages(): readonly BrandImageSlot[] {
  return BRAND_IMAGE_SLOT_IDS.filter((slot) => {
    if (slot === 'trackEssentials') return TEACHES_CODE;
    if (slot === 'trackYear1' || slot === 'trackYear2') return TEACHES_CODE || IS_AYMAN;
    if (slot === 'practiceGuide') return IS_AYMAN;
    return true;
  });
}
