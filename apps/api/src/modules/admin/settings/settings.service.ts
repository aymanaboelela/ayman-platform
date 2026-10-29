import { BadRequestException, Injectable } from '@nestjs/common';
import { BRAND_IMAGE_FIELDS, BRAND_IMAGE_SLOTS } from '@ayman/contracts/admin/brand-images';
import { OG_PAGES } from '@ayman/contracts/admin/seo-pages';
import {
  BrandingReadSchema,
  SeoReadSchema,
  SECTION_SCHEMAS,
  SiteSettingsSchema,
  type BrandingRead,
  type PublicSettings,
  type PublicSettingsRead,
  type SettingsSection,
  type SiteSettings,
} from '@ayman/contracts/admin/settings';
import { SocialCountsInputSchema, type SocialCounts } from '@ayman/contracts/admin/social-counts';
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
    return { seo: settings.seo, contact: settings.contact, about: settings.about };
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
   * Branding PLUS the storage key behind each of its picture slots, light and
   * dark.
   *
   * The root layout needs a URL and holds an id, and `mediaUrl()` takes a
   * storage key — see `BrandingReadSchema` for the 404 that gap produced.
   *
   * Walks `BRAND_IMAGE_SLOTS` rather than naming fields: a slot added there is
   * resolved here without anyone remembering this method exists. One query for
   * all of them, however many are set.
   */
  async readBranding(): Promise<BrandingRead> {
    const { branding } = await this.read();
    const keys = await this.resolveAssetKeys(BRAND_IMAGE_FIELDS.map((field) => branding[field]));

    const resolved: Record<string, string | null> = {};
    for (const def of BRAND_IMAGE_SLOTS) {
      resolved[def.lightKey] = key(keys, branding[def.light]);
      if (def.dark && def.darkKey) resolved[def.darkKey] = key(keys, branding[def.dark]);
    }

    return BrandingReadSchema.parse({ ...branding, ...resolved });
  }

  /**
   * Same resolution for the OG images — the site-wide one and each section's
   * (`OG_PAGES`) — on every page's `generateMetadata`. Still one query.
   */
  async readPublicResolved(): Promise<PublicSettingsRead> {
    const settings = await this.read();
    const { seo } = settings;
    const keys = await this.resolveAssetKeys([
      seo.ogImageAssetId,
      ...OG_PAGES.map((def) => seo[def.field]),
    ]);

    const pageKeys: Record<string, string | null> = {};
    for (const def of OG_PAGES) pageKeys[def.key] = key(keys, seo[def.field]);

    return {
      seo: SeoReadSchema.parse({ ...seo, ogImageKey: key(keys, seo.ogImageAssetId), ...pageKeys }),
      contact: settings.contact,
      about: settings.about,
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

    const next = await this.persist(section, parsed);

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

  /** «عدد السوشيال ميديا» for the landing page. Public; the route carries the gate. */
  async readSocialCounts(): Promise<SocialCounts> {
    return (await this.read()).socialCounts;
  }

  /**
   * Same write path as `updateSection` — validated, merged in one
   * transaction, audited as `settings:update` — but on its own route, because the
   * generic one has no entitlement gate (see `SocialCountsSchema`).
   *
   * `updatedAt` is stamped HERE, on every save, so «آخر تحديث» on the admin
   * card is when the numbers were last confirmed rather than something typed.
   */
  async updateSocialCounts(payload: unknown): Promise<SocialCounts> {
    const result = SocialCountsInputSchema.safeParse(payload);
    if (!result.success) {
      throw new BadRequestException({
        message: 'invalid social counts payload',
        issues: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      });
    }
    const value: SocialCounts = { ...result.data, updatedAt: new Date().toISOString() };

    const next = await this.persist('socialCounts', value);

    await this.audit.record({
      action: 'settings:update',
      resourceType: AUDIT_RESOURCES.siteSettings,
      resourceId: String(SITE_SETTINGS_ID),
      outcome: 'success',
      metadata: { section: 'socialCounts', value },
    });

    return next.socialCounts;
  }

  /**
   * Replace one top-level key of the singleton and leave the rest untouched.
   * Callers validate first; this re-parses the whole blob so a stored row can
   * never hold a shape `read()` would refuse.
   */
  private async persist(key: keyof SiteSettings, value: unknown): Promise<SiteSettings> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.siteSetting.findUniqueOrThrow({
        where: { id: SITE_SETTINGS_ID },
        select: { data: true },
      });

      const current = SiteSettingsSchema.parse(row.data ?? {});
      const merged = SiteSettingsSchema.parse({ ...current, [key]: value });

      await tx.siteSetting.update({
        where: { id: SITE_SETTINGS_ID },
        // `updated_by` is a convenience for the settings screen ("last edited
        // by"). It is NOT the audit trail — that is the hash-chained log, and
        // a column an admin's own UPDATE could overwrite is not evidence.
        data: { data: merged as never, updatedBy: currentActor().actorUserId },
      });

      return merged;
    });
  }
}
