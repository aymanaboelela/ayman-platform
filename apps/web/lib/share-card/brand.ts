import 'server-only';
import { copy } from '@ayman/contracts';
import { getBrandAsset } from '@/lib/brand-assets';
import { SITE_URL } from '@/lib/seo/site-url';
import { tenantName } from '@/lib/tenant';
import { qrMatrix, type ShareBrand } from './model';

/**
 * Who the images advertise, resolved through the tenant gates.
 *
 * The teacher's name and platform go through `tenantName`, and the host and
 * QR are this deployment's own `SITE_URL`, so a teacher whose `shareCards` is
 * switched on gets cards with THEIR name and THEIR link without any setting.
 * `hero` is `getBrandAsset('hero')` — his composite, `undefined` everywhere
 * else, where the card draws its own fire.
 */
export function shareBrand(): ShareBrand {
  return {
    teacher: tenantName(copy.site.instructor),
    platform: tenantName(copy.site.platformName),
    siteHost: new URL(SITE_URL).host,
    heroSrc: getBrandAsset('hero')?.src,
    qr: qrMatrix(SITE_URL),
  };
}
