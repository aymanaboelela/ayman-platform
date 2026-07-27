import { BadRequestException, Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import {
  SettingsSectionSchema,
  type Branding,
  type PublicSettings,
  type SettingsSection,
  type SiteSettings,
} from '@ayman/contracts/admin/settings';
import { Public } from '../../../auth/decorators/public.decorator';
import { RequirePermission } from '../../../auth/decorators/require-permission.decorator';
import { SettingsService } from './settings.service';

/**
 * Same reasoning as `CatalogController`'s identical constant: `getBranding()`
 * is called from the ROOT layout, so `next build` fires it once per
 * statically generated page (53 pages in this repo today) concurrently from
 * one caller -- the default `short: 10/1s` throttle fails the build the
 * moment page count exceeds ~10. `getPublicSettings()` is read just as
 * widely for SEO metadata. Both are `@Public()` reads of already-public
 * config with no auth and no write; rate-limiting them at the login/write
 * budget protects nothing.
 */
const PUBLIC_CONFIG_THROTTLE = {
  short: { limit: 300, ttl: seconds(1) },
  medium: { limit: 3000, ttl: seconds(60) },
  long: { limit: 30_000, ttl: seconds(3600) },
};

@Controller()
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Public: the root layout needs branding before any user exists. */
  @Public()
  @Throttle(PUBLIC_CONFIG_THROTTLE)
  @Get('settings/branding')
  async branding(): Promise<Branding> {
    return (await this.settings.read()).branding;
  }

  /** Public: SEO metadata and the contact block on the public site. */
  @Public()
  @Throttle(PUBLIC_CONFIG_THROTTLE)
  @Get('settings/public')
  publicSettings(): Promise<PublicSettings> {
    return this.settings.readPublic();
  }

  @RequirePermission('settings:read')
  @Get('admin/settings')
  all(): Promise<SiteSettings> {
    return this.settings.read();
  }

  /**
   * The section name is validated against the enum before it ever indexes into
   * SECTION_SCHEMAS — an unvalidated path parameter used as an object key is a
   * prototype-pollution shaped bug waiting to happen.
   *
   * The body is deliberately `unknown` rather than a DTO: which schema applies
   * depends on `:section`, so validation happens inside the service against
   * `SECTION_SCHEMAS[section]`. A single wide DTO would have to be the union of
   * all three, which is exactly the "one field rides along" shape A4 forbids.
   */
  @RequirePermission('settings:write')
  @Patch('admin/settings/:section')
  update(@Param('section') rawSection: string, @Body() body: unknown): Promise<SiteSettings> {
    const parsedSection = SettingsSectionSchema.safeParse(rawSection);
    if (!parsedSection.success) {
      throw new BadRequestException(`unknown settings section: ${rawSection}`);
    }
    const section: SettingsSection = parsedSection.data;
    return this.settings.updateSection(section, body);
  }
}
