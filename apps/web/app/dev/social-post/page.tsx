import '../../(admin)/admin/marketing/posts/posts.css';
import { copy } from '@ayman/contracts/copy';
import { SITE_URL } from '@/lib/seo/site-url';
import { tenantName } from '@/lib/tenant';
import { SocialPostPreview } from './preview';

/**
 * `/dev/social-post` — every «استوديو البوستات» picture, both formats, with
 * fixed sample facts. For designing the canvas without waiting for an exam to
 * settle. 404 in production (`isDevOnlyRoute`).
 */
export default function SocialPostDevPage() {
  return <SocialPostPreview brand={{ platform: tenantName(copy.site.platformName), siteHost: new URL(SITE_URL).host }} />;
}
