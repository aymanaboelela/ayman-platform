import { copy as bot } from '@ayman/contracts/copy/wa-bot';
import { egp, localPhone, planLine, renderTemplate, type CourseFact } from './render';

const COURSE: CourseFact = {
  slug: 'c',
  title: 'كورس',
  system: 'bacalorya',
  year: 2,
  requiresGrant: true,
  monthlyPriceCents: 15000,
  monthlyOnSale: true,
  yearlyPriceCents: 95000,
  terms: [],
  freeLessons: 0,
  scheduleNote: null,
};

describe('renderTemplate', () => {
  it('fills placeholders with live values', () => {
    expect(renderTemplate('السعر: {{الأسعار}}', { الأسعار: '150 جنيه' })).toBe('السعر: 150 جنيه');
  });

  it('drops a whole line whose placeholder resolved to nothing — never «القناة: » with no link', () => {
    expect(renderTemplate('أول سطر\nالقناة: {{القناة}}\nآخر سطر', { القناة: null })).toBe('أول سطر\nآخر سطر');
  });

  it('leaves an unknown placeholder visible, so a typo shows up in the dry run', () => {
    expect(renderTemplate('{{السعرر}}', {})).toBe('{{السعرر}}');
  });

  it('never leaves three blank lines behind', () => {
    expect(renderTemplate('أ\n\n{{x}}\n\nب', { x: '' })).toBe('أ\n\nب');
  });
});

describe('prices', () => {
  it('formats piastres as whole pounds with Latin digits', () => {
    expect(egp(120000)).toBe('1,200 جنيه');
    expect(egp(15000)).toBe('150 جنيه');
  });

  it('lists the plans actually on sale', () => {
    expect(planLine(COURSE)).toBe('الشهر 150 جنيه · السنة كاملة 950 جنيه');
  });

  it('says the monthly plan is closed rather than quoting a price nobody can pay', () => {
    expect(planLine({ ...COURSE, monthlyOnSale: false, yearlyPriceCents: null })).toBe(bot.reply.coursePlansAsk);
  });

  it('is «مفتوح من غير اشتراك» for a course that needs no grant, whatever its columns hold', () => {
    expect(planLine({ ...COURSE, requiresGrant: false })).toBe(bot.reply.coursePlansFree);
  });
});

it('writes a transfer number the way a student types it', () => {
  expect(localPhone('+201012345678')).toBe('01012345678');
  expect(localPhone('+966501234567')).toBe('+966501234567');
});
