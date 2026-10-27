import { describe, expect, it } from 'vitest';
import { captionCopy, socialPostsCopy } from '@ayman/contracts/copy/social-posts';
import { composeCaption, hashtags, type CaptionContext } from './caption';
import { SOCIAL_CAPTION_MAX, type SocialFacts } from './posts';
import { shortStudentName } from './names';

const context: CaptionContext = {
  platform: 'المنصة',
  siteUrl: 'https://example.com',
  link: 'https://example.com/news/x',
  extraHashtags: '',
  teachesCode: false,
};

const person = (name: string, score: number | null = null, total: number | null = null) => ({
  name,
  photoKey: null,
  score,
  total,
  rank: null,
});

const ALL_KINDS: SocialFacts[] = [
  { kind: 'honor', day: '2026-10-20', title: 'امتحان الشهر الأول', people: [person('أحمد م.', 50, 50), person('سارة ع.', 49, 50)] },
  {
    kind: 'results',
    examTitle: 'امتحان الوحدة الأولى',
    courseTitle: 'تانية بكالوريا',
    takers: 132,
    averagePercent: 78.4,
    passRate: 91,
    fullMarks: 7,
    top: [person('أحمد م.', 20, 20), person('سارة ع.', 19.5, 20), person('عبد الله ك.', 19, 20)],
  },
  { kind: 'certificates', weekStart: '2026-10-17', total: 23, units: [{ title: 'الوحدة الأولى', count: 15 }], people: [person('أحمد م.')] },
  { kind: 'course', title: 'كورس المراجعة النهائية', subtitle: 'كل المنهج في شهر', coverKey: null },
  { kind: 'lecture', title: 'المتغيرات', courseTitle: 'تانية بكالوريا', sectionTitle: 'الوحدة الأولى', coverKey: null },
  { kind: 'news', title: 'مواعيد الامتحانات', excerpt: 'جدول الشهر ده نزل.', coverKey: null },
];

describe('composeCaption', () => {
  it('lists the top scorers with medals and Arabic-Indic marks', () => {
    const text = composeCaption(ALL_KINDS[1]!, context);
    expect(text).toContain('🥇 أحمد م. — ٢٠ من ٢٠');
    expect(text).toContain('🥉 عبد الله ك. — ١٩ من ٢٠');
    expect(text).toContain('١٣٢ طالب وطالبة');
    expect(text).toContain('٧٨٫٤٪');
    expect(text).toContain('⭐ ٧ قفلوا الدرجة النهائية!');
  });

  it('ends the content kinds on their own link, and the others on the site', () => {
    const news = composeCaption(ALL_KINDS[5]!, context);
    expect(news).toContain(`${captionCopy.news.cta} ${context.link}`);
    expect(news).not.toContain(captionCopy.follow(context.platform, context.siteUrl));

    const honor = composeCaption(ALL_KINDS[0]!, context);
    expect(honor).toContain(captionCopy.follow(context.platform, context.siteUrl));
  });

  it('prints the platform it is given, never a name of its own', () => {
    const text = composeCaption(ALL_KINDS[3]!, { ...context, platform: 'منصة الاختبار' });
    expect(text).toContain('منصة الاختبار');
  });

  it('skips the full-marks line when nobody got full marks', () => {
    const facts = { ...ALL_KINDS[1]!, fullMarks: 0 } as SocialFacts;
    expect(composeCaption(facts, context)).not.toContain('⭐');
  });

  it('clips to the Instagram limit instead of failing the publish', () => {
    const long: SocialFacts = { kind: 'news', title: 'خبر', excerpt: 'كلام '.repeat(1000), coverKey: null };
    const text = composeCaption(long, context);
    expect(text.length).toBeLessThanOrEqual(SOCIAL_CAPTION_MAX);
    expect(text.endsWith('…')).toBe(true);
  });

  it('never leaves three blank lines in a row', () => {
    for (const facts of ALL_KINDS) expect(composeCaption(facts, context)).not.toMatch(/\n{3,}/);
  });
});

describe('hashtags', () => {
  it('normalises the admin tags and drops duplicates', () => {
    const tags = hashtags(['#تفوق'], { ...context, extraHashtags: 'تفوق, #مذاكرة  ##نجاح' });
    expect(tags.split(' ')).toEqual(['#تفوق', '#مذاكرة', '#نجاح']);
  });

  it('adds the subject tag only on a programming stack', () => {
    expect(hashtags([], { ...context, teachesCode: true })).toContain('#برمجة');
    expect(hashtags([], context)).not.toContain('#برمجة');
  });
});

describe('shortStudentName', () => {
  it.each([
    ['أحمد محمد علي', 'أحمد م.'],
    ['عبد الله محمود سيد', 'عبد الله م.'],
    ['سارة السيد', 'سارة س.'],
    ['منى', 'منى'],
    ['  يوسف   خالد ', 'يوسف خ.'],
    ['', ''],
  ])('%s → %s', (full, short) => {
    expect(shortStudentName(full)).toBe(short);
  });
});

/**
 * The same tripwire `outreach/compose.spec.ts` carries. A caption is read by
 * every follower of the page; half of them are girls, and the platform never
 * asks which.
 */
const MASCULINE_ONLY = new Set([
  'راجع', 'ارجع', 'خد', 'روح', 'دوس', 'كمّل', 'اشترك', 'افتكر', 'شوف', 'ركّز', 'ادخل', 'ذاكر', 'حاول', 'جرّب',
  'احفظ', 'اعمل', 'انشر', 'اكتب', 'افتح', 'نزّل', 'انسخ', 'امسح', 'استخدم', 'خلّي', 'سيب', 'حط', 'عدّل',
  'متخافش', 'متقلقش', 'متنساش', 'مشترك', 'فاهم', 'حابب', 'فاكر', 'عامل',
  'بتذاكر', 'تقدر', 'تستاهله', 'جبت', 'ذاكرت', 'غلطت', 'نجحت', 'دخلت', 'خلصت',
  'معاك', 'وراك', 'بيك', 'ليك', 'فيك', 'متأكد',
]);

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (typeof value === 'function') {
    const fn = value as (...args: unknown[]) => unknown;
    strings(fn('س', 'ص', 'ع'), out);
  } else if (Array.isArray(value)) value.forEach((item) => strings(item, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => strings(item, out));
  return out;
}

describe('the voice', () => {
  const lines = [
    ...strings(captionCopy),
    ...strings(socialPostsCopy),
    ...ALL_KINDS.map((facts) => composeCaption(facts, context)),
  ];

  it('never addresses one reader in the masculine', () => {
    for (const line of lines) {
      for (const token of line.split(/[\s،.:؟!—«»…()٪,\n]+/u)) {
        expect(MASCULINE_ONLY.has(token), `«${token}» only works on a male reader: ${line}`).toBe(false);
      }
    }
  });
});
