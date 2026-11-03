import { ForbiddenException } from '@nestjs/common';
import { EMPTY_AUDIENCE, type CampaignCreate } from '@ayman/contracts/marketing/campaign';
import { DEFAULT_PACING } from '@ayman/contracts/marketing/pacing';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { roleHasPermission, setUserPermissionOverrides } from '../../auth/permissions';
import type { AuditService } from '../../audit/audit.service';
import type { CampaignService } from './campaign.service';
import { MarketingController } from './marketing.controller';
import type { WhatsappDeviceService } from './whatsapp-device.service';

/**
 * A campaign with a «كود خصم لكل يوم» mints a coupon every day it sends, and a
 * coupon made by hand needs `payment:review`. The route's own guard asks only
 * for `marketing:write`, so the BODY decides the second permission — through
 * `userHasPermission`, the override-aware check, so a per-user «اقفل» wins.
 *
 * The effect asserted is the one that matters: the service — which is what
 * would store the campaign and later mint the codes — is never reached.
 */
describe('MarketingController — a daily coupon needs payment:review', () => {
  const create = jest.fn().mockResolvedValue({ id: 'c1' });
  const controller = new MarketingController(
    { create } as unknown as CampaignService,
    {} as unknown as WhatsappDeviceService,
    {} as unknown as AuditService,
  );

  const plain: CampaignCreate = {
    name: 'عرض',
    body: 'أهلاً {{الاسم}}',
    bodyPartial: null,
    imageAssetId: null,
    linkUrl: null,
    audience: EMPTY_AUDIENCE,
    pacing: DEFAULT_PACING,
    channel: 'whatsapp',
    dailyCoupon: null,
  };
  const withCoupon: CampaignCreate = {
    ...plain,
    dailyCoupon: {
      prefix: 'WELCOME',
      validDays: 3,
      courseIds: ['0190a0a0-0000-7000-8000-000000000001'],
      planAmounts: { monthly: 5_100, quarterly: null, term: 15_000, yearly: null },
    },
  };
  const user = (id: string, role: string) => ({ id, role, name: 'x', email: 'x@t.test' }) as AuthenticatedUser;
  const overrides = (entries: Record<string, { allow?: string[]; deny?: string[] }>) =>
    setUserPermissionOverrides(
      new Map(
        Object.entries(entries).map(([id, e]) => [id, { allow: new Set(e.allow ?? []), deny: new Set(e.deny ?? []) }]),
      ),
    );

  beforeEach(() => {
    create.mockClear();
    overrides({});
  });
  afterAll(() => overrides({}));

  it('refuses a staff account with marketing:write but not payment:review', async () => {
    expect(roleHasPermission('designer', 'payment:review')).toBe(false);
    overrides({ d1: { allow: ['marketing:write'] } });
    await expect(controller.create(withCoupon, user('d1', 'designer'))).rejects.toBeInstanceOf(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });

  it('a campaign WITHOUT a code still needs only marketing:write', async () => {
    overrides({ d1: { allow: ['marketing:write'] } });
    await controller.create(plain, user('d1', 'designer'));
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('honours a per-user grant of payment:review', async () => {
    overrides({ d1: { allow: ['marketing:write', 'payment:review'] } });
    await controller.create(withCoupon, user('d1', 'designer'));
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('honours a per-user lock on payment:review over the role', async () => {
    expect(roleHasPermission('owner', 'payment:review')).toBe(true);
    overrides({ o1: { deny: ['payment:review'] } });
    await expect(controller.create(withCoupon, user('o1', 'owner'))).rejects.toBeInstanceOf(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });

  it('lets the instructor (admin) through', async () => {
    await controller.create(withCoupon, user('a1', 'admin'));
    expect(create).toHaveBeenCalledTimes(1);
  });
});
