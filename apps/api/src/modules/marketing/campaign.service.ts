import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  Audience,
  AudiencePreview,
  CampaignCounts,
  CampaignCreate,
  CampaignDetail,
  CampaignPatch,
  CampaignRow,
  CampaignStatus,
  OptOutRow,
  RecipientRow,
  RecipientStatus,
} from '@ayman/contracts/marketing/campaign';
import { AudienceSchema } from '@ayman/contracts/marketing/campaign';
import {
  DEFAULT_PACING,
  estimateMinutes,
  withinWindow,
  type Pacing,
} from '@ayman/contracts/marketing/pacing';
import { renderCampaignBody } from '@ayman/contracts/marketing/render';
import { normalizeEgyptianPhone } from '@ayman/contracts/phone';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { InjectMediaUrl, type MediaUrlResolver } from '../../common/media/media-url';
import { AudienceService } from './audience.service';
import type { MarketingCampaign, Prisma } from '../../generated/prisma/client';

/**
 * Everything a person does to a campaign. The runner does the sending; this
 * class owns creating, editing, starting, stopping and reading.
 *
 * ## `draft` is the only editable state, and that is a safety property
 *
 * Once a campaign is running, thousands of messages have been promised and
 * some number of them have already landed. Editing the audience at that point
 * would mean the sent half and the unsent half went to different lists, with
 * no record of where the boundary was. Editing the BODY is allowed while
 * paused — a typo caught after forty messages should be fixable — and that is
 * deliberately the only exception, because the body is rendered per recipient
 * at send time and the sent messages are already gone regardless.
 *
 * ## Nothing here is ever deleted mid-flight
 *
 * `cancel` marks the remaining recipients `skipped` rather than removing
 * them. «الحملة دي راحت لمين» has to keep an answer after somebody changes
 * their mind, and a row that vanished cannot distinguish "never queued" from
 * "queued and abandoned".
 */

/** Statuses whose recipient list and audience may still change. */
const EDITABLE: readonly CampaignStatus[] = ['draft'];

const EMPTY_COUNTS: CampaignCounts = { total: 0, pending: 0, sent: 0, failed: 0, skipped: 0 };

@Injectable()
export class CampaignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audience: AudienceService,
    private readonly audit: AuditService,
    @InjectMediaUrl() private readonly mediaUrl: MediaUrlResolver,
  ) {}

  // ── reads ──────────────────────────────────────────────────────────────

  async list(): Promise<CampaignRow[]> {
    const campaigns = await this.prisma.marketingCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const counts = await this.countsFor(campaigns.map((c) => c.id));
    return campaigns.map((campaign) => this.row(campaign, counts.get(campaign.id) ?? EMPTY_COUNTS));
  }

  async detail(id: string): Promise<CampaignDetail> {
    const campaign = await this.prisma.marketingCampaign.findUnique({
      where: { id },
      include: { image: { select: { storageKey: true } } },
    });
    if (!campaign) throw new NotFoundException();

    const counts = (await this.countsFor([id])).get(id) ?? EMPTY_COUNTS;

    // The next person in the queue, so the preview is a real message and not
    // a rendering of the template against a made-up name.
    const next = await this.prisma.marketingRecipient.findFirst({
      where: { campaignId: id, status: 'pending' },
      orderBy: { position: 'asc' },
      select: { name: true },
    });

    return {
      ...this.row(campaign, counts),
      body: campaign.body,
      imageAssetId: campaign.imageAssetId,
      imageUrl: campaign.image ? this.mediaUrl.resolve(campaign.image.storageKey) : null,
      linkUrl: campaign.linkUrl,
      audience: AudienceSchema.parse(campaign.audience),
      pacing: pacingOf(campaign),
      sentToday: campaign.sentToday,
      estimateMinutes: estimateMinutes(counts.pending, pacingOf(campaign)),
      preview: renderCampaignBody({
        body: campaign.body,
        name: next?.name ?? null,
        linkUrl: campaign.linkUrl,
      }),
    };
  }

  async recipients(id: string, status: RecipientStatus | 'all', take = 200): Promise<RecipientRow[]> {
    const rows = await this.prisma.marketingRecipient.findMany({
      where: { campaignId: id, ...(status === 'all' ? {} : { status }) },
      orderBy: { position: 'asc' },
      take,
    });
    return rows.map((row) => ({
      id: row.id,
      phone: row.phone,
      name: row.name,
      userId: row.userId,
      status: row.status,
      attempts: row.attempts,
      sentAt: row.sentAt?.toISOString() ?? null,
      error: row.error,
    }));
  }

  /** What the audience picker shows before anything exists. */
  async preview(audience: Audience, pacing: Pacing): Promise<AudiencePreview> {
    const resolved = await this.audience.resolve(audience);
    return {
      recipients: resolved.recipients.length,
      unreachable: resolved.unreachable,
      optedOut: resolved.optedOut,
      estimateMinutes: estimateMinutes(resolved.recipients.length, pacing),
    };
  }

  // ── writes ─────────────────────────────────────────────────────────────

  async create(input: CampaignCreate, actorId: string): Promise<CampaignRow> {
    const resolved = await this.audience.resolve(input.audience);
    if (resolved.recipients.length === 0) {
      throw new BadRequestException('مفيش حد في الجمهور ده — راجع الفلاتر');
    }

    const campaign = await this.prisma.$transaction(async (tx) => {
      const created = await tx.marketingCampaign.create({
        data: {
          name: input.name,
          body: input.body,
          imageAssetId: input.imageAssetId,
          linkUrl: input.linkUrl,
          audience: input.audience as unknown as Prisma.InputJsonValue,
          createdById: actorId,
          ...input.pacing,
        },
      });

      // `createMany` in one statement: four thousand individual inserts would
      // hold a transaction open for minutes on the same small pool every other
      // request shares (see `BroadcastService`'s note on that ceiling).
      await tx.marketingRecipient.createMany({
        data: resolved.recipients.map((recipient, index) => ({
          campaignId: created.id,
          phone: recipient.phone,
          name: recipient.name,
          userId: recipient.userId,
          position: index,
        })),
      });

      return created;
    });

    await this.audit.record({
      action: 'campaign:create',
      resourceType: 'marketing_campaign',
      resourceId: campaign.id,
      outcome: 'success',
      metadata: {
        name: campaign.name,
        recipients: resolved.recipients.length,
        unreachable: resolved.unreachable,
        optedOut: resolved.optedOut,
        audience: input.audience,
      },
    });

    return this.row(campaign, {
      ...EMPTY_COUNTS,
      total: resolved.recipients.length,
      pending: resolved.recipients.length,
    });
  }

  /**
   * Edit a draft, or fix the wording of a paused campaign.
   *
   * The audience is deliberately absent from `CampaignPatchSchema`: changing
   * who a campaign is for after its rows exist is not an edit, it is a
   * different campaign, and the honest way to do it is to make one.
   */
  async patch(id: string, input: CampaignPatch): Promise<CampaignDetail> {
    const campaign = await this.require(id);
    if (campaign.status === 'running') {
      throw new BadRequestException('وقّف الحملة الأول عشان تعدّلها');
    }
    if (!EDITABLE.includes(campaign.status) && campaign.status !== 'paused') {
      throw new BadRequestException('الحملة دي خلصت — مينفعش تتعدّل');
    }

    await this.prisma.marketingCampaign.update({
      where: { id },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.body === undefined ? {} : { body: input.body }),
        ...(input.imageAssetId === undefined ? {} : { imageAssetId: input.imageAssetId }),
        ...(input.linkUrl === undefined ? {} : { linkUrl: input.linkUrl }),
        ...(input.pacing ?? {}),
      },
    });

    await this.audit.record({
      action: 'campaign:update',
      resourceType: 'marketing_campaign',
      resourceId: id,
      outcome: 'success',
      metadata: { fields: Object.keys(input) },
    });

    return this.detail(id);
  }

  /**
   * «ابدأ» / «كمّل».
   *
   * `nextSendAt` is set to the next moment inside the sending window rather
   * than to `now`: pressing start at midnight must not send anything at
   * midnight, and the screen then shows «هيبدأ ١٠ الصبح» instead of appearing
   * to have done nothing.
   */
  async start(id: string): Promise<CampaignRow> {
    const campaign = await this.require(id);
    if (campaign.status === 'running') return this.rowWithCounts(campaign);
    if (campaign.status === 'done' || campaign.status === 'cancelled') {
      throw new BadRequestException('الحملة دي خلصت');
    }

    const pending = await this.prisma.marketingRecipient.count({
      where: { campaignId: id, status: 'pending' },
    });
    if (pending === 0) throw new BadRequestException('مفيش حد فاضل في الحملة دي');

    const updated = await this.prisma.marketingCampaign.update({
      where: { id },
      data: {
        status: 'running',
        nextSendAt: withinWindow(new Date(), pacingOf(campaign)),
        startedAt: campaign.startedAt ?? new Date(),
        finishedAt: null,
      },
    });

    await this.audit.record({
      action: 'campaign:start',
      resourceType: 'marketing_campaign',
      resourceId: id,
      outcome: 'success',
      // The pacing is recorded HERE and not only at creation because a draft
      // can be re-paced right up to the moment somebody presses start, and
      // this entry is the one that answers "what was it allowed to do".
      metadata: { pending, pacing: pacingOf(campaign), resumed: campaign.startedAt !== null },
    });

    return this.rowWithCounts(updated);
  }

  async pause(id: string): Promise<CampaignRow> {
    const campaign = await this.require(id);
    if (campaign.status !== 'running') return this.rowWithCounts(campaign);

    const updated = await this.prisma.marketingCampaign.update({
      where: { id },
      // `nextSendAt: null` rather than leaving it in the past: the runner
      // filters on `status`, but a stale due-date on a paused row is a trap
      // for the next person who writes a query against this table.
      data: { status: 'paused', nextSendAt: null },
    });

    await this.audit.record({
      action: 'campaign:pause',
      resourceType: 'marketing_campaign',
      resourceId: id,
      outcome: 'success',
      metadata: null,
    });

    return this.rowWithCounts(updated);
  }

  async cancel(id: string): Promise<CampaignRow> {
    const campaign = await this.require(id);
    if (campaign.status === 'cancelled') return this.rowWithCounts(campaign);

    const updated = await this.prisma.$transaction(async (tx) => {
      const skipped = await tx.marketingRecipient.updateMany({
        where: { campaignId: id, status: 'pending' },
        data: { status: 'skipped', error: 'الحملة اتلغت' },
      });
      const row = await tx.marketingCampaign.update({
        where: { id },
        data: { status: 'cancelled', nextSendAt: null, finishedAt: new Date() },
      });
      return { row, skipped: skipped.count };
    });

    await this.audit.record({
      action: 'campaign:cancel',
      resourceType: 'marketing_campaign',
      resourceId: id,
      outcome: 'success',
      metadata: { skipped: updated.skipped },
    });

    return this.rowWithCounts(updated.row);
  }

  /** Only a campaign that never sent anything. Everything else is a record. */
  async remove(id: string): Promise<void> {
    const campaign = await this.require(id);
    const sent = await this.prisma.marketingRecipient.count({
      where: { campaignId: id, status: 'sent' },
    });
    if (sent > 0) {
      throw new BadRequestException('الحملة دي بعتت رسايل — مينفعش تتمسح، بس تتلغي');
    }
    if (campaign.status === 'running') throw new BadRequestException('وقّف الحملة الأول');

    await this.prisma.marketingCampaign.delete({ where: { id } });
    await this.audit.record({
      action: 'campaign:delete',
      resourceType: 'marketing_campaign',
      resourceId: id,
      outcome: 'success',
      metadata: { name: campaign.name },
    });
  }

  // ── opt-outs ───────────────────────────────────────────────────────────

  async listOptOuts(): Promise<OptOutRow[]> {
    const rows = await this.prisma.marketingOptOut.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rows.map((row) => ({
      phone: row.phone,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /**
   * Add a number by hand — someone who asked to be removed by any channel
   * other than replying «قف».
   *
   * Idempotent, and it also skips that number in every campaign already
   * queued. Honouring an opt-out only for FUTURE campaigns would leave the
   * complainant receiving the rest of the current one, which is the worst
   * possible outcome of asking to be left alone.
   */
  async addOptOut(rawPhone: string, reason: string | null): Promise<OptOutRow> {
    const phone = normalizeEgyptianPhone(rawPhone);
    if (!phone) throw new BadRequestException('الرقم مش صحيح');

    const row = await this.prisma.marketingOptOut.upsert({
      where: { phone },
      create: { phone, reason },
      update: {},
    });
    await this.prisma.marketingRecipient.updateMany({
      where: { phone, status: 'pending' },
      data: { status: 'skipped', error: 'طلب إيقاف' },
    });

    return { phone: row.phone, reason: row.reason, createdAt: row.createdAt.toISOString() };
  }

  async removeOptOut(phone: string): Promise<void> {
    await this.prisma.marketingOptOut.deleteMany({ where: { phone } });
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private async require(id: string): Promise<MarketingCampaign> {
    const campaign = await this.prisma.marketingCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException();
    return campaign;
  }

  private async rowWithCounts(campaign: MarketingCampaign): Promise<CampaignRow> {
    const counts = (await this.countsFor([campaign.id])).get(campaign.id) ?? EMPTY_COUNTS;
    return this.row(campaign, counts);
  }

  /**
   * One `groupBy` for the whole list, never a count per row — the campaigns
   * screen would otherwise issue five queries per campaign and the recipient
   * table is the biggest one this feature has.
   */
  private async countsFor(ids: string[]): Promise<Map<string, CampaignCounts>> {
    const out = new Map<string, CampaignCounts>();
    if (ids.length === 0) return out;

    const grouped = await this.prisma.marketingRecipient.groupBy({
      by: ['campaignId', 'status'],
      where: { campaignId: { in: ids } },
      _count: { _all: true },
    });

    for (const group of grouped) {
      const counts = out.get(group.campaignId) ?? { ...EMPTY_COUNTS };
      const n = group._count._all;
      counts[group.status] += n;
      counts.total += n;
      out.set(group.campaignId, counts);
    }
    return out;
  }

  private row(campaign: MarketingCampaign, counts: CampaignCounts): CampaignRow {
    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      counts,
      createdAt: campaign.createdAt.toISOString(),
      startedAt: campaign.startedAt?.toISOString() ?? null,
      finishedAt: campaign.finishedAt?.toISOString() ?? null,
      nextSendAt: campaign.nextSendAt?.toISOString() ?? null,
    };
  }
}

/** The seven pacing columns, as the shape the contract functions take. */
export function pacingOf(campaign: MarketingCampaign): Pacing {
  return {
    minDelaySeconds: campaign.minDelaySeconds ?? DEFAULT_PACING.minDelaySeconds,
    maxDelaySeconds: campaign.maxDelaySeconds ?? DEFAULT_PACING.maxDelaySeconds,
    batchSize: campaign.batchSize ?? DEFAULT_PACING.batchSize,
    batchPauseMinutes: campaign.batchPauseMinutes ?? DEFAULT_PACING.batchPauseMinutes,
    dailyCap: campaign.dailyCap ?? DEFAULT_PACING.dailyCap,
    windowStartHour: campaign.windowStartHour ?? DEFAULT_PACING.windowStartHour,
    windowEndHour: campaign.windowEndHour ?? DEFAULT_PACING.windowEndHour,
  };
}
