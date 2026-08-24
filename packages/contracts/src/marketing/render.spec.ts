import { describe, expect, it } from 'vitest';
import { isOptOutMessage, renderCampaignBody } from '@ayman/contracts/marketing/render';

describe('renderCampaignBody', () => {
  it('substitutes the first name only', () => {
    expect(
      renderCampaignBody({ body: 'أهلاً {{الاسم}}، المحاضرة نزلت', name: 'محمد أحمد علي', linkUrl: null }),
    ).toBe('أهلاً محمد، المحاضرة نزلت');
  });

  it('removes the token and its leftover space when there is no name', () => {
    expect(renderCampaignBody({ body: 'أهلاً {{الاسم}} — المحاضرة نزلت', name: null, linkUrl: null })).toBe(
      'أهلاً — المحاضرة نزلت',
    );
  });

  it('never substitutes a gendered placeholder word', () => {
    const out = renderCampaignBody({ body: 'يا {{الاسم}}', name: null, linkUrl: null });
    expect(out).toBe('يا');
    expect(out).not.toMatch(/طالب|طالبة/u);
  });

  it('appends the link as its own paragraph when the body does not place it', () => {
    expect(
      renderCampaignBody({ body: 'المحاضرة نزلت', name: null, linkUrl: 'https://x.test/l/1' }),
    ).toBe('المحاضرة نزلت\n\nhttps://x.test/l/1');
  });

  it('respects an explicit link token instead of appending', () => {
    expect(
      renderCampaignBody({
        body: 'ادخل من هنا {{اللينك}} وقولي رأيك',
        name: null,
        linkUrl: 'https://x.test/l/1',
      }),
    ).toBe('ادخل من هنا https://x.test/l/1 وقولي رأيك');
  });

  it('drops the link token when no link is attached', () => {
    expect(renderCampaignBody({ body: 'ادخل {{اللينك}} بسرعة', name: null, linkUrl: null })).toBe(
      'ادخل بسرعة',
    );
  });

  it('substitutes every occurrence, not just the first', () => {
    expect(
      renderCampaignBody({ body: '{{الاسم}} يا {{الاسم}}', name: 'سارة', linkUrl: null }),
    ).toBe('سارة يا سارة');
  });

  it('collapses the blank lines a removed token leaves behind', () => {
    expect(renderCampaignBody({ body: 'سطر\n\n\n\nسطر تاني', name: null, linkUrl: null })).toBe(
      'سطر\n\nسطر تاني',
    );
  });
});

describe('isOptOutMessage', () => {
  it.each(['قف', ' قف ', 'وقف', 'إلغاء', 'STOP', 'stop.', 'Unsubscribe'])('treats %s as an opt-out', (text) => {
    expect(isOptOutMessage(text)).toBe(true);
  });

  it.each([
    'مش هقف عن المذاكرة',
    'قف معايا',
    'شكرا يا بشمهندس',
    'stop sending me... actually no, keep going',
  ])('does not treat %s as an opt-out', (text) => {
    expect(isOptOutMessage(text)).toBe(false);
  });
});
