import { Card, CardBody, CardHeader, CardTitle } from '@ayman/ui';
import { ACCENT_SLOTS, RADIUS_SLOTS, SiteSettingsSchema } from '@ayman/contracts/admin/settings';
import { copy } from '@ayman/contracts';
import { adminGet } from '@/lib/admin-api';

export const metadata = { title: copy.admin.branding.title };

const ACCENT_LABEL: Record<(typeof ACCENT_SLOTS)[number], string> = {
  amber: copy.admin.branding.accentAmber,
  cyan: copy.admin.branding.accentCyan,
  blue: copy.admin.branding.accentBlue,
  violet: copy.admin.branding.accentViolet,
  magenta: copy.admin.branding.accentMagenta,
  slate: copy.admin.branding.accentSlate,
};

const RADIUS_LABEL: Record<(typeof RADIUS_SLOTS)[number], string> = {
  sharp: copy.admin.branding.radiusSharp,
  default: copy.admin.branding.radiusDefault,
  soft: copy.admin.branding.radiusSoft,
};

/**
 * Read-only for now: the editable form is Plan 6 Task 8's slot in the shell.
 * The page exists here because Task 6 owns the *renderer* and this is what
 * proves, in the product rather than in a test, that the stored slot is what
 * the whole site is painted from.
 *
 * `adminGet`, not a `'use cache'` loader: an admin reading their own settings
 * from a cache is indistinguishable from a lost write.
 */
export default async function BrandingSettingsPage() {
  const settings = await adminGet('/api/admin/settings', SiteSettingsSchema);
  const { accent, radius } = settings.branding;

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[length:var(--fs-title-2)] font-semibold">
          {copy.admin.branding.title}
        </h1>
        <p className="mt-1 text-fg-muted">{copy.admin.branding.lead}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{copy.admin.settings.accent}</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="flex flex-col gap-2">
              {ACCENT_SLOTS.map((slot) => (
                <li key={slot} className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    data-active={slot === accent}
                    className="size-4 rounded-[var(--r-xs)] border border-line bg-surface-3 data-[active=true]:bg-accent"
                  />
                  <span data-active={slot === accent} className="data-[active=true]:text-fg text-fg-muted">
                    {ACCENT_LABEL[slot]}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{copy.admin.settings.radius}</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="flex flex-col gap-2">
              {RADIUS_SLOTS.map((slot) => (
                <li
                  key={slot}
                  data-active={slot === radius}
                  className="text-fg-muted data-[active=true]:text-fg"
                >
                  {RADIUS_LABEL[slot]}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
