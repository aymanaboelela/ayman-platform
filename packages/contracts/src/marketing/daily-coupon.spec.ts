import { describe, expect, it } from 'vitest';
import {
  AudienceSchema,
  CampaignCreateSchema,
  CampaignDetailSchema,
  EMPTY_AUDIENCE,
  isCourseAware,
} from '@ayman/contracts/marketing/campaign';
import {
  DailyCouponSchema,
  addCairoDays,
  dailyCouponCode,
  dailyCouponLastDay,
  formatArabicDay,
} from '@ayman/contracts/marketing/daily-coupon';
import { missingMonthsPhrase } from '@ayman/contracts/marketing/missing-months';
import { renderCampaignBody } from '@ayman/contracts/marketing/render';
import { DEFAULT_PACING } from '@ayman/contracts/marketing/pacing';

const COURSE = '0190a0a0-0000-7000-8000-000000000001';
const PLAN_AMOUNTS = { monthly: 5_100, quarterly: null, term: 15_000, yearly: null };

describe('the day code', () => {
  it('is the prefix plus DDMM of the Cairo send day', () => {
    expect(dailyCouponCode('welcome', '2026-11-03')).toBe('WELCOME0311');
    expect(dailyCouponCode('WELCOME', '2027-01-09')).toBe('WELCOME0901');
  });

  it('works for N days after the day it reached the student, across a month end', () => {
    expect(dailyCouponLastDay('2026-11-03', 3)).toBe('2026-11-06');
    expect(dailyCouponLastDay('2026-11-29', 3)).toBe('2026-12-02');
    expect(addCairoDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('names the last day in Arabic, on the calendar day given', () => {
    const label = formatArabicDay('2026-11-06');
    expect(label).toMatch(/الجمعة/u);
    expect(label).toMatch(/نوفمبر/u);
  });

  it('refuses a prefix that would not fit the stored code pattern, and an empty amount set', () => {
    const base = { prefix: 'WELCOME', validDays: 3, courseIds: [COURSE], planAmounts: PLAN_AMOUNTS };
    expect(DailyCouponSchema.parse(base).prefix).toBe('WELCOME');
    expect(DailyCouponSchema.safeParse({ ...base, prefix: 'WEL-COME' }).success).toBe(false);
    expect(DailyCouponSchema.safeParse({ ...base, prefix: 'X'.repeat(29) }).success).toBe(false);
    expect(DailyCouponSchema.safeParse({ ...base, courseIds: [] }).success).toBe(false);
    expect(
      DailyCouponSchema.safeParse({
        ...base,
        planAmounts: { monthly: null, quarterly: null, term: null, yearly: null },
      }).success,
    ).toBe(false);
  });
});

describe('«الشهور الناقصة» in words', () => {
  it('names some missing months by their spoken ordinals, joined with و', () => {
    expect(missingMonthsPhrase([2], 3)).toBe('الشهر التاني');
    expect(missingMonthsPhrase([3, 2], 3)).toBe('الشهر التاني والتالت');
    expect(missingMonthsPhrase([2, 3, 4], 5)).toBe('الشهر التاني والتالت والرابع');
  });

  it('says «all of them» when every open month is missing', () => {
    expect(missingMonthsPhrase([1], 1)).toBe('الشهر الأول');
    expect(missingMonthsPhrase([1, 2], 2)).toBe('الشهرين');
    expect(missingMonthsPhrase([1, 2, 3], 3)).toBe('الشهور التلاتة');
  });

  it('is empty when nothing is missing', () => {
    expect(missingMonthsPhrase([], 3)).toBe('');
  });
});

describe('the campaign shapes', () => {
  const valid = {
    name: 'عرض تانية',
    body: 'أهلاً {{الاسم}} — كود {{الكود}} لحد {{آخر_يوم}}: {{اللينك}}',
    imageAssetId: null,
    linkUrl: null,
    audience: { ...EMPTY_AUDIENCE, courseIds: [COURSE], missingMonths: true },
    pacing: DEFAULT_PACING,
  };

  it('parses a campaign row written before the new fields existed', () => {
    const { missingMonths: _drop, ...old } = EMPTY_AUDIENCE;
    expect(AudienceSchema.parse(old).missingMonths).toBe(false);
    const parsed = CampaignCreateSchema.parse({ ...valid, audience: EMPTY_AUDIENCE });
    expect(parsed.dailyCoupon).toBeNull();
    expect(parsed.bodyPartial).toBeNull();
  });

  it('refuses a hand-typed link on a campaign whose link is built per student', () => {
    expect(CampaignCreateSchema.safeParse(valid).success).toBe(true);
    expect(CampaignCreateSchema.safeParse({ ...valid, linkUrl: 'https://x.test' }).success).toBe(false);
  });

  it('refuses «ناقصهم شهور» with no course to be missing months of', () => {
    expect(
      CampaignCreateSchema.safeParse({ ...valid, audience: { ...valid.audience, courseIds: [] } }).success,
    ).toBe(false);
  });

  it('is course-aware with either half', () => {
    expect(isCourseAware({ audience: { missingMonths: false }, dailyCoupon: null })).toBe(false);
    expect(isCourseAware({ audience: { missingMonths: true }, dailyCoupon: null })).toBe(true);
    expect(isCourseAware({ audience: { missingMonths: false }, dailyCoupon: {} })).toBe(true);
  });

  it('a detail response from the previous API build still parses', () => {
    const detail = CampaignDetailSchema.safeParse({
      id: COURSE,
      name: 'x',
      status: 'draft',
      counts: { total: 0, pending: 0, sent: 0, failed: 0, skipped: 0, delivered: 0 },
      createdAt: '2026-11-03T08:00:00.000Z',
      startedAt: null,
      finishedAt: null,
      nextSendAt: null,
      pausedReason: null,
      body: 'x',
      imageAssetId: null,
      imageUrl: null,
      linkUrl: null,
      audience: EMPTY_AUDIENCE,
      pacing: DEFAULT_PACING,
      channel: 'whatsapp',
      sentToday: 0,
      estimateMinutes: 0,
      preview: 'x',
    });
    expect(detail.success).toBe(true);
  });
});

describe('rendering the offer tokens', () => {
  it('fills the code, the last day and the months', () => {
    expect(
      renderCampaignBody({
        body: 'ناقصك {{الشهور_الناقصة}} — الكود {{الكود}} لحد {{آخر_يوم}}',
        name: null,
        linkUrl: null,
        coupon: { code: 'WELCOME0311', lastDay: 'الجمعة ٦ نوفمبر' },
        missingMonths: 'الشهر التاني والتالت',
      }),
    ).toBe('ناقصك الشهر التاني والتالت — الكود WELCOME0311 لحد الجمعة ٦ نوفمبر');
  });

  it('never sends a literal token when there is no code or no months', () => {
    const out = renderCampaignBody({ body: 'أهلاً {{الكود}} {{آخر_يوم}} {{الشهور_الناقصة}}', name: null, linkUrl: null });
    expect(out).toBe('أهلاً');
    expect(out).not.toContain('{{');
  });
});
