import { Card, CardBody, CardHeader, CardTitle } from '@ayman/ui';
import { listResponse } from '@ayman/contracts/admin/list';
import { MediaAssetSchema } from '@ayman/contracts/admin/media';
import { SiteSettingsSchema } from '@ayman/contracts/admin/settings';
import { copy } from '@ayman/contracts/copy/admin';
import { adminGet } from '@/lib/admin-api';
import { getEntitlements } from '@/lib/entitlements';
import { BrandingForm } from '../branding-form';
import { SeoForm } from '../seo-form';
import { ContactForm } from '../contact-form';
import { ShippingForm } from '../shipping-form';
import { builtInBrandImages, offeredBrandImages } from '../brand-image-defaults';

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
 * an asset picker (every picture slot, light and dark, and the OG image) —
 * one round trip instead of one per picker.
 */
export default async function SettingsPage() {
  const [settings, media, features] = await Promise.all([
    adminGet('/api/admin/settings', SiteSettingsSchema),
    adminGet('/api/admin/media?page=1&perPage=100&includeArchived=false', MediaListSchema),
    getEntitlements(),
  ]);

  /*
   * The jump row. Five sections on one page, the first of which is now two
   * long cards, so the contact form was several screens below the fold with
   * nothing above saying it was there.
   */
  const sections = [
    { id: 'look', label: copy.admin.settings.navLook },
    { id: 'images', label: copy.admin.settings.navImages },
    { id: 'seo', label: copy.admin.settings.navSeo },
    { id: 'contact', label: copy.admin.settings.navContact },
    ...(features.books ? [{ id: 'shipping', label: copy.admin.settings.navShipping }] : []),
  ];

  return (
    <>
      <header className="mb-4 flex flex-col gap-3">
        <h1 className="text-[length:var(--fs-title-2)] font-semibold">{copy.admin.settings.title}</h1>
        <nav aria-label={copy.admin.settings.jumpTo} className="flex flex-wrap gap-2">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="rounded-full border border-line bg-surface-1 px-3 py-1 text-[length:var(--fs-text-sm)] text-fg hover:border-accent hover:text-accent-text"
            >
              {section.label}
            </a>
          ))}
        </nav>
      </header>

      {/* Wide, not `--w-prose`: the picture cards sit two to a row and each
          holds a light and a dark tile side by side. The text-only sections
          below keep a readable measure on their own. */}
      <div className="flex max-w-[72rem] flex-col gap-6">
        <BrandingForm
          defaultValues={settings.branding}
          assets={media.rows}
          builtIn={builtInBrandImages()}
          offered={offeredBrandImages()}
        />

        <div className="grid gap-6 xl:grid-cols-2">
          <Card id="seo" className="scroll-mt-24">
            <CardHeader>
              <CardTitle>{copy.admin.settings.sectionSeo}</CardTitle>
            </CardHeader>
            <CardBody>
              <SeoForm defaultValues={settings.seo} assets={media.rows} />
            </CardBody>
          </Card>

          <Card id="contact" className="scroll-mt-24">
            <CardHeader>
              <CardTitle>{copy.admin.settings.sectionContact}</CardTitle>
            </CardHeader>
            <CardBody>
              <ContactForm defaultValues={settings.contact} />
            </CardBody>
          </Card>

          {/* أسعار شحن الكتاب — كارت كامل بيختفي مع فيتشر الكتب. مدرّس مش
              بيبيع كتب بيبقى عنده حقل بيسأله يوصّل بكام لحد البيت. */}
          {features.books ? (
            <Card id="shipping" className="scroll-mt-24">
              <CardHeader>
                <CardTitle>{copy.admin.settings.sectionShipping}</CardTitle>
              </CardHeader>
              <CardBody>
                <ShippingForm defaultValues={settings.store} />
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
