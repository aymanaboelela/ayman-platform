import { BadRequestException, Body, Controller, Get, Param, Patch } from '@nestjs/common';
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

@Controller()
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Public: the root layout needs branding before any user exists. */
  @Public()
  @Get('settings/branding')
  async branding(): Promise<Branding> {
    return (await this.settings.read()).branding;
  }

  /** Public: SEO metadata and the contact block on the public site. */
  @Public()
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
