import { Card, CardBody, CardHeader, CardTitle } from '@ayman/ui';
import { listResponse } from '@ayman/contracts/admin/list';
import { MediaAssetSchema } from '@ayman/contracts/admin/media';
import { SiteSettingsSchema } from '@ayman/contracts/admin/settings';
import { copy } from '@ayman/contracts/copy/admin';
import { adminGet } from '@/lib/admin-api';
import { BrandingForm } from '../branding-form';
import { SeoForm } from '../seo-form';
import { ContactForm } from '../contact-form';

export const metadata = { title: copy.admin.settings.title };

const MediaListSchema = listResponse(MediaAssetSchema);

/**
 * The platform owner's dashboard-controls-everything screen. Plan 6 shipped
 * the `PATCH /api/admin/settings` endpoint (Task 5) and the FOUC-safe
 * branding renderer (Task 6), but no task ever built this form — this page
 * used to render the stored branding read-only, as a placeholder proving the
 * renderer worked. It now edits branding, SEO and contact settings, each as
 * its own independently-saved section.
 *
 * `adminGet`, never a `'use cache'` loader: an admin reading their own
 * settings from a cache is indistinguishable from a lost write.
 *
 * The media list is fetched once, here, and handed to every form that needs
 * an asset picker (logo × 2, favicon, OG image) — one round trip instead of
 * four.
 */
export default async function SettingsPage() {
  const [settings, media] = await Promise.all([
    adminGet('/api/admin/settings', SiteSettingsSchema),
    adminGet('/api/admin/media?page=1&perPage=100&includeArchived=false', MediaListSchema),
  ]);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[length:var(--fs-title-2)] font-semibold">{copy.admin.settings.title}</h1>
      </header>

      <div className="flex max-w-[var(--w-prose)] flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{copy.admin.settings.sectionBranding}</CardTitle>
          </CardHeader>
          <CardBody>
            <BrandingForm defaultValues={settings.branding} assets={media.rows} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{copy.admin.settings.sectionSeo}</CardTitle>
          </CardHeader>
          <CardBody>
            <SeoForm defaultValues={settings.seo} assets={media.rows} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{copy.admin.settings.sectionContact}</CardTitle>
          </CardHeader>
          <CardBody>
            <ContactForm defaultValues={settings.contact} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
