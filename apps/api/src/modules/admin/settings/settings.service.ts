import { BadRequestException, Injectable } from '@nestjs/common';
import {
  SECTION_SCHEMAS,
  SiteSettingsSchema,
  type BrandingRead,
  type PublicSettings,
  type PublicSettingsRead,
  type SettingsSection,
  type SiteSettings,
} from '@ayman/contracts/admin/settings';
import { currentActor } from '../../../audit/audit-context';
import { AuditService } from '../../../audit/audit.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AUDIT_RESOURCES, SITE_SETTINGS_ID } from '../admin.constants';

/**
 * One lookup, expressed once. `null` covers both "no asset chosen" and "the
 * asset it pointed at is gone" — indistinguishable to every consumer, and
 * both correctly mean "render nothing here".
 */
function key(keys: Map<string, string>, id: string | null): string | null {
  return id === null ? null : (keys.get(id) ?? null);
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Reads the singleton and parses it through the schema, which fills in every
   * default. A key that was never written therefore reads as its default, not
   * as `undefined` — that is the whole reason jsonb is acceptable here.
   */
  async read(): Promise<SiteSettings> {
    const row = await this.prisma.siteSetting.findUniqueOrThrow({
      where: { id: SITE_SETTINGS_ID },
      select: { data: true },
    });
    return SiteSettingsSchema.parse(row.data ?? {});
  }

  async readPublic(): Promise<PublicSettings> {
    const settings = await this.read();
    // Explicit projection, not a delete-the-private-keys pass: a new private
    // field added to SiteSettings must never leak by default.
    return { seo: settings.seo, contact: settings.contact };
  }

  /**
   * Asset id -> storage key, for the ids a settings blob points at.
   *
   * One query for the whole set rather than one per slot: branding alone holds
   * three, and this sits on the root layout's path for every page.
   *
   * An id that resolves to nothing maps to `null`, which is the correct answer
   * for an asset that has since been permanently deleted — the caller renders
   * no `<link rel="icon">` at all rather than one pointing at a 404.
   */
  private async resolveAssetKeys(
    ids: readonly (string | null)[],
  ): Promise<Map<string, string>> {
    const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
    if (wanted.length === 0) return new Map();

    const rows = await this.prisma.mediaAsset.findMany({
      where: { id: { in: wanted } },
      select: { id: true, storageKey: true },
    });
    return new Map(rows.map((row) => [row.id, row.storageKey]));
  }

  /**
   * Branding PLUS the storage key behind each of its three asset slots.
   *
   * The root layout needs a URL and holds an id, and `mediaUrl()` takes a
   * storage key — see `BrandingReadSchema` for the 404 that gap produced.
   */
  async readBranding(): Promise<BrandingRead> {
    const { branding } = await this.read();
    const keys = await this.resolveAssetKeys([
      branding.logoLightAssetId,
      branding.logoDarkAssetId,
      branding.faviconAssetId,
    ]);

    return {
      ...branding,
      logoLightKey: key(keys, branding.logoLightAssetId),
      logoDarkKey: key(keys, branding.logoDarkAssetId),
      faviconKey: key(keys, branding.faviconAssetId),
    };
  }

  /** Same resolution for the OG image, on every page's `generateMetadata`. */
  async readPublicResolved(): Promise<PublicSettingsRead> {
    const settings = await this.read();
    const keys = await this.resolveAssetKeys([settings.seo.ogImageAssetId]);

    return {
      seo: { ...settings.seo, ogImageKey: key(keys, settings.seo.ogImageAssetId) },
      contact: settings.contact,
    };
  }

  /**
   * Section-scoped write. The section's own schema validates the payload
   * (`.strict()`, so unknown keys are a 400), the rest of the blob is left
   * untouched, and an audit entry is written for every successful change —
   * a successful settings change with no trail is not possible.
   */
  async updateSection(section: SettingsSection, payload: unknown): Promise<SiteSettings> {
    // `safeParse` + an explicit 400. A bare `.parse()` throws a ZodError, which
    // is not an HttpException, so `AllExceptionsFilter` fails it closed as a
    // generic 500 — "unknown key" and "the database is down" would look
    // identical to the admin form, and the form could not show which field is
    // wrong.
    const result = SECTION_SCHEMAS[section].safeParse(payload);
    if (!result.success) {
      throw new BadRequestException({
        message: 'invalid settings payload',
        issues: result.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      });
    }
    const parsed = result.data;

    const next = await this.prisma.$transaction(async (tx) => {
      const row = await tx.siteSetting.findUniqueOrThrow({
        where: { id: SITE_SETTINGS_ID },
        select: { data: true },
      });

      const current = SiteSettingsSchema.parse(row.data ?? {});
      const merged = SiteSettingsSchema.parse({ ...current, [section]: parsed });

      await tx.siteSetting.update({
        where: { id: SITE_SETTINGS_ID },
        // `updated_by` is a convenience for the settings screen ("last edited
        // by"). It is NOT the audit trail — that is the hash-chained log, and
        // a column an admin's own UPDATE could overwrite is not evidence.
        data: { data: merged as never, updatedBy: currentActor().actorUserId },
      });

      return merged;
    });

    // Issued after the transaction commits, not inside it: `AuditService.record`
    // opens its own transaction to take the advisory lock, and nesting would
    // deadlock against itself. The ordering (change commits, then trail) is the
    // pragmatic choice; the alternative — trail first — logs writes that may
    // never have happened.
    await this.audit.record({
      action: section === 'branding' ? 'branding:update' : 'settings:update',
      resourceType: AUDIT_RESOURCES.siteSettings,
      resourceId: String(SITE_SETTINGS_ID),
      outcome: 'success',
      metadata: { section, value: parsed },
    });

    return next;
  }
}
