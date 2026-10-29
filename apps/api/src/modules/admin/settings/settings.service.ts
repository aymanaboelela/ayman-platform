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
import {
  SOCIAL_COUNT_NETWORKS,
  SocialCountsInputSchema,
  isAutoSynced,
  type SocialCountNetwork,
  type SocialCounts,
} from '@ayman/contracts/admin/social-counts';
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
   *
   * While a network is kept by the automatic sync (`isAutoSynced`), the
   * stored figure wins over whatever the form sent for it: the admin card
   * shows that field read-only, and this is the same rule enforced where it
   * cannot be bypassed. Once its sync has gone quiet past
   * `AUTO_SYNC_FRESH_MS` the field is the admin's again, and saving it marks
   * it manual.
   */
  async updateSocialCounts(payload: unknown): Promise<SocialCounts> {
    const result = SocialCountsInputSchema.safeParse(payload);
    if (!result.success) {
      throw new BadRequestException({
        message: 'invalid social counts payload',
        issues: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      });
    }
    const input = result.data;

    const next = await this.persist('socialCounts', (current: SiteSettings): SocialCounts => {
      const stored = current.socialCounts;
      const kept = SOCIAL_COUNT_NETWORKS.filter((network) => isAutoSynced(stored, network));
      const merged: SocialCounts = { ...input, updatedAt: new Date().toISOString() };
      for (const network of kept) merged[network] = stored[network];
      // Every network the admin just saved is manual; only a live sync keeps its own.
      if (kept.length > 0) merged.sources = Object.fromEntries(kept.map((network) => [network, 'auto' as const]));
      if (stored.syncedAt !== undefined) merged.syncedAt = stored.syncedAt;
      return merged;
    });

    await this.audit.record({
      action: 'settings:update',
      resourceType: AUDIT_RESOURCES.siteSettings,
      resourceId: String(SITE_SETTINGS_ID),
      outcome: 'success',
      metadata: { section: 'socialCounts', value: next.socialCounts },
    });

    return next.socialCounts;
  }

  /**
   * An automatic sync's write (`SocialCountsSyncService`): figures read from
   * the networks themselves — YouTube from the Data API, Facebook and
   * Instagram from the Meta Graph API. Networks absent from `figures` are not
   * touched at all.
   *
   * A number — the figure, marked `auto`, with that network's `syncedAt` and
   * `updatedAt` now.
   * `null` — the network withholds the figure (a YouTube owner hid the count),
   * so this site must not publish it either: a figure a sync wrote is
   * cleared and the field handed back to the admin. A figure the admin typed
   * is left alone — showing it is their call, not the sync's.
   *
   * Audited only when a figure or its source changed; a daily "still
   * 120,000" is not a settings change anybody needs a trail of. Returns the
   * networks whose shown figure (or source) actually moved.
   */
  async applyAutoCounts(
    by: 'youtube-sync' | 'meta-sync',
    figures: Partial<Record<SocialCountNetwork, number | null>>,
  ): Promise<{ changed: SocialCountNetwork[]; counts: SocialCounts }> {
    const now = new Date().toISOString();
    const networks = SOCIAL_COUNT_NETWORKS.filter((network) => figures[network] !== undefined);
    // Filled inside the transaction; an object so the closure's writes are visible here.
    const seen: { before?: SocialCounts } = {};

    const next = await this.persist('socialCounts', (current: SiteSettings): SocialCounts => {
      const before = current.socialCounts;
      seen.before = before;
      let after = before;
      for (const network of networks) {
        const figure = figures[network];
        if (typeof figure === 'number') {
          after = {
            ...after,
            [network]: figure,
            sources: { ...after.sources, [network]: 'auto' },
            syncedAt: { ...after.syncedAt, [network]: now },
            updatedAt: now,
          };
        } else if (after.sources?.[network] === 'auto') {
          after = { ...after, [network]: null, sources: { ...after.sources, [network]: 'manual' }, updatedAt: now };
        }
      }
      return after;
    });

    const before = seen.before!;
    const after = next.socialCounts;
    const changed = networks.filter(
      (network) => before[network] !== after[network] || before.sources?.[network] !== after.sources?.[network],
    );
    if (changed.length > 0) {
      await this.audit.record({
        action: 'settings:update',
        resourceType: AUDIT_RESOURCES.siteSettings,
        resourceId: String(SITE_SETTINGS_ID),
        outcome: 'success',
        // No actor: nobody pressed anything. Said in the metadata so the row
        // does not read as a write with its actor missing.
        metadata: {
          section: 'socialCounts',
          by,
          ...Object.fromEntries(
            changed.map((network) => [
              network,
              { from: before[network], to: after[network], withheld: figures[network] === null },
            ]),
          ),
        },
      });
    }

    return { changed, counts: next.socialCounts };
  }

  /**
   * Replace one top-level key of the singleton and leave the rest untouched.
   * Callers validate first; this re-parses the whole blob so a stored row can
   * never hold a shape `read()` would refuse.
   *
   * `value` may be a function of the current settings, evaluated inside the
   * transaction — for the writes that merge with what is stored rather than
   * replace it (the social counts' manual save and automatic sync).
   */
  private async persist(
    key: keyof SiteSettings,
    value: unknown | ((current: SiteSettings) => unknown),
  ): Promise<SiteSettings> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.siteSetting.findUniqueOrThrow({
        where: { id: SITE_SETTINGS_ID },
        select: { data: true },
      });

      const current = SiteSettingsSchema.parse(row.data ?? {});
      const resolved = typeof value === 'function' ? (value as (c: SiteSettings) => unknown)(current) : value;
      const merged = SiteSettingsSchema.parse({ ...current, [key]: resolved });

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
