import 'server-only';
import { copy } from '@ayman/contracts';
import { mediaUrl } from '@ayman/ui/branding';
import { brandImage } from '@/lib/brand-image';
import { getBranding } from '@/lib/settings';
import { SITE_URL } from '@/lib/seo/site-url';
import { tenantName } from '@/lib/tenant';
import { qrMatrix, type ShareBrand } from './model';

/**
 * Who the images advertise, resolved through the tenant gates.
 *
 * The teacher's name and platform go through `tenantName`, and the host and
 * QR are this deployment's own `SITE_URL`, so a teacher whose `shareCards` is
 * switched on gets cards with THEIR name and THEIR link without any setting.
 * `hero` is the hero picture from «الهوية البصرية» if one was uploaded, else
 * his composite on his stack and `undefined` everywhere else, where the card
 * draws its own fire. The signature is only ever an upload.
 */
export async function shareBrand(): Promise<ShareBrand> {
  const branding = await getBranding();
  return {
    teacher: tenantName(copy.site.instructor),
    platform: tenantName(copy.site.platformName),
    siteHost: new URL(SITE_URL).host,
    heroSrc: brandImage(branding, 'hero')?.light.src,
    signatureSrc: branding.signatureKey ? mediaUrl(branding.signatureKey) : undefined,
    signatureDarkSrc: branding.signatureDarkKey ? mediaUrl(branding.signatureDarkKey) : undefined,
    qr: qrMatrix(SITE_URL),
  };
}
