import { describe, expect, it } from 'vitest';
import {
  BOT_INTENTS,
  DEFAULT_KEYWORDS,
  classify,
  looksAutomated,
  parseYear,
  type YearOption,
} from '@ayman/contracts/wa-bot/intents';
import { normalizeArabic, tokenVariants } from '@ayman/contracts/wa-bot/normalize';

describe('normalizeArabic', () => {
  it.each([
    ['الكورس بكاااام؟؟', 'الكورس بكام'],
    ['أشترك إزاي', 'اشترك ازاي'],
    ['آخر موعد', 'اخر موعد'],
    ['الحصة التجريبية', 'الحصه التجريبيه'],
    ['مستشفى', 'مستشفي'],
    ['بـــكام', 'بكام'],
    ['مُحَاضَرَة', 'محاضره'],
    ['السنة ٢', 'السنه 2'],
    ['شيء', 'شي'],
    ['مسؤول', 'مسوول'.replace(/وو/u, 'و')],
    ['Ezaaay A4TARK', 'ezay a4tark'],
    ['🙏🙏 تمام!!', 'تمام'],
    ['کتاب', 'كتاب'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeArabic(input)).toBe(expected);
  });

  it('never collapses a repeated DIGIT — «100» is a value', () => {
    expect(normalizeArabic('100 جنيه')).toBe('100 جنيه');
  });

  it('peels the proclitics Egyptian Arabic glues on, keeping the word itself', () => {
    expect(tokenVariants('والكورس')).toEqual(expect.arrayContaining(['والكورس', 'كورس']));
    expect(tokenVariants('بالكتاب')).toEqual(expect.arrayContaining(['كتاب']));
    // Two letters must survive: «بس» is not «س».
    expect(tokenVariants('بس')).toEqual(['بس']);
  });
});

/**
 * The real phrasings. Every line is something a student or a parent actually
 * types — Egyptian, Franco-Arabic, misspelt — and the intent the bot must
 * read in it. A new phrasing that reads wrong is a new line here first.
 */
const TABLE: readonly (readonly [string, string])[] = [
  // price
  ['الكورس بكام', 'price'],
  ['الكورس بكاااام؟', 'price'],
  ['ألكورس بكم', 'price'],
  ['هو الاشتراك كام؟', 'price'],
  ['سعر الكورس كام', 'price'],
  ['ممكن أعرف الأسعار', 'price'],
  ['الشهر بكام يا مستر', 'price'],
  ['التيرم بكام', 'price'],
  ['تمن الكورس', 'price'],
  ['el course bkam', 'price'],
  ['bkaaam', 'price'],
  ['how much is the course', 'price'],
  ['kam geneh el shahr', 'price'],
  ['السلام عليكم الكورس بكام؟', 'price'],
  ['بيتكلف كام', 'price'],
  // subscribe
  ['أشترك إزاي', 'subscribe'],
  ['ازاي اشترك', 'subscribe'],
  ['عايز اشترك', 'subscribe'],
  ['عايزة أشترك في الكورس', 'subscribe'],
  ['طريقة الاشتراك ايه', 'subscribe'],
  ['ازاي اسجل', 'subscribe'],
  ['ezay a4tark', 'subscribe'],
  ['ashtrek ezay', 'subscribe'],
  ['how to subscribe', 'subscribe'],
  ['عاوز أحجز', 'subscribe'],
  // payment
  ['ادفع ازاي', 'payment'],
  ['ينفع ادفع انستاباي', 'payment'],
  ['رقم فودافون كاش', 'payment'],
  ['المحفظة كام', 'payment'],
  ['instapay', 'payment'],
  ['حولت الفلوس خلاص', 'payment'],
  ['اورانج كاش ينفع؟', 'payment'],
  ['fawry', 'payment'],
  // trial
  ['فيه حصة تجريبية', 'trial'],
  ['في حصه تجريبيه؟', 'trial'],
  ['ينفع أجرب الأول', 'trial'],
  ['فيه حاجة مجانية', 'trial'],
  ['درس مجاني', 'trial'],
  ['ببلاش؟', 'trial'],
  ['free trial', 'trial'],
  ['fe 7essa tagrebya', 'trial'],
  ['عايز أشوف الشرح الأول', 'trial'],
  // which course
  ['انهي كورس يناسبني', 'whichCourse'],
  ['أنا في تانية بكالوريا آخد أنهي كورس', 'whichCourse'],
  ['ايه الكورسات اللي عندك', 'whichCourse'],
  ['المنهج فيه ايه', 'whichCourse'],
  ['which course is for me', 'whichCourse'],
  // books
  ['الكتاب بيوصل البيت؟', 'books'],
  ['عايز الكتاب', 'books'],
  ['الشحن بيوصل إسكندرية؟', 'books'],
  ['الملزمة فين', 'books'],
  ['ketab el tanya', 'books'],
  ['delivery', 'books'],
  // schedule
  ['الحصص بتنزل امتى', 'schedule'],
  ['امتى الحصة الجاية', 'schedule'],
  ['مواعيد الحصص', 'schedule'],
  ['فيه لايف؟', 'schedule'],
  ['emta el 7essa', 'schedule'],
  ['السنتر فين', 'schedule'],
  // human
  ['عاوز أكلم حد', 'human'],
  ['عايزة اكلم حد من فضلك', 'human'],
  ['ممكن حد يكلمني', 'human'],
  ['كلموني', 'human'],
  ['الفيديو مش شغال', 'human'],
  ['مش عارف ادخل على حسابي', 'human'],
  ['نسيت الباسورد', 'human'],
  ['عندي مشكلة', 'human'],
  ['kalemny', 'human'],
  ['i need support', 'human'],
];

describe('classify — the phrasings people actually send', () => {
  it.each(TABLE)('«%s» → %s', (text, intent) => {
    expect(classify(text).intents[0]).toBe(intent);
  });

  it('answers a price-and-course question once — the price answer already lists the courses', () => {
    expect(classify('الكورس بكام وانهي كورس يناسبني').intents).toEqual(['price']);
  });

  it('«الكتاب بكام» is a book price — the course price stays out unless a course is named', () => {
    expect(classify('الكتاب بكام').intents).toEqual(['books']);
    expect(classify('الكورس والكتاب بكام').intents).toEqual(expect.arrayContaining(['price', 'books']));
  });

  it('carries two different questions in one message, at most two', () => {
    const { intents } = classify('أشترك إزاي وادفع انستاباي ولا فودافون كاش والكتاب بكام');
    expect(intents).toHaveLength(2);
  });

  it('puts «a person, please» first whatever else was said', () => {
    expect(classify('الكورس بكام؟ وعايز اكلم حد').intents[0]).toBe('human');
  });

  it('reads a greeting as riding on top of the question, not as the question', () => {
    const result = classify('السلام عليكم ورحمة الله، فيه حصة تجريبية؟');
    expect(result.intents).toEqual(['trial']);
    expect(result.greeting).toBe(true);
  });

  it.each(['السلام عليكم', 'اهلا', 'hi', 'صباح الخير'])('«%s» alone is a greeting and nothing else', (text) => {
    const result = classify(text);
    expect(result.intents).toEqual([]);
    expect(result.greeting).toBe(true);
  });

  it.each(['شكرا', 'تمام', 'ok', 'متشكر جدا', 'ماشي'])('«%s» is a thanks — no question in it', (text) => {
    const result = classify(text);
    expect(result.intents).toEqual([]);
    expect(result.thanks).toBe(true);
  });

  it.each(['انا في سنة كام؟', 'كام حصة في الشهر', 'عندي سؤال في الدرس التالت'])(
    '«%s» is NOT a price question — bare «كام» is not money',
    (text) => {
      expect(classify(text).intents).not.toContain('price');
    },
  );

  it('reads nothing into a message with no known word', () => {
    expect(classify('ممكن تشرحلي الـ recursion؟').intents).toEqual([]);
  });

  it('adds the admin’s own keywords to a built-in intent', () => {
    expect(classify('الاوفر كام').intents).not.toContain('price');
    expect(classify('الاوفر كام', { extraKeywords: { price: ['الأوفر'] } }).intents).toEqual(['price']);
  });

  it('never reports a built-in the admin switched off', () => {
    expect(classify('الكورس بكام', { disabled: ['price'] }).intents).not.toContain('price');
  });

  it('matches an admin-written rule, and prefers it over the generic answer at an equal score', () => {
    const custom = [{ key: 'custom:11111111-1111-1111-1111-111111111111', keywords: ['اونلاين'] }];
    expect(classify('الحصص اونلاين؟', { custom }).intents[0]).toBe(custom[0]!.key);
  });

  it('has a vocabulary for every built-in intent', () => {
    for (const intent of BOT_INTENTS) expect(DEFAULT_KEYWORDS[intent].length).toBeGreaterThan(5);
  });
});

describe('parseYear', () => {
  const BAC: YearOption[] = [
    { system: 'bacalorya', year: 1, label: 'الصف الأول بكالوريا' },
    { system: 'bacalorya', year: 2, label: 'الصف الثاني بكالوريا' },
    { system: 'bacalorya', year: 3, label: 'الصف الثالث بكالوريا' },
  ];
  const MIXED: YearOption[] = [
    ...BAC,
    { system: 'thanaweya_amma', year: 3, label: 'الصف الثالث الثانوي' },
  ];

  it.each([
    ['2', 2],
    ['٢', 2],
    ['رقم 3', 3],
    ['تانية', 2],
    ['تالته', 3],
    ['اولى', 1],
    ['tanya', 2],
  ])('after the question, «%s» is option %i', (text, year) => {
    expect(parseYear(text, BAC, true)?.year).toBe(year);
  });

  it('reads a bare number as the OPTION, which is not the year when two systems are offered', () => {
    expect(parseYear('4', MIXED, true)).toEqual(MIXED[3]);
  });

  it('tells two systems apart by the stage word', () => {
    expect(parseYear('تالتة ثانوي', MIXED, true)).toEqual(MIXED[3]);
    expect(parseYear('تالتة بكالوريا', MIXED, true)).toEqual(BAC[2]);
  });

  it('refuses to guess between two systems with only a year word', () => {
    expect(parseYear('تالتة', MIXED, true)).toBeNull();
  });

  it.each(['أنا في تانية بكالوريا', 'انا سنة تالتة', 'الصف الأول'])(
    'unasked, «%s» still names a year — a year word next to a stage or «سنة»',
    (text) => {
      expect(parseYear(text, BAC, false)).not.toBeNull();
    },
  );

  it.each(['عندي 2 سؤال', 'تاني حاجة', 'الحصة الاولى'])('unasked, «%s» is NOT a year', (text) => {
    expect(parseYear(text, BAC, false)).toBeNull();
  });

  it('a number past the options is no answer', () => {
    expect(parseYear('7', BAC, true)).toBeNull();
  });
});

describe('looksAutomated — other bots are never answered', () => {
  it.each([
    'This is an automated message',
    'رد تلقائي: شكرا لتواصلك',
    'رسالة آلية — سنرد عليك في أقرب وقت',
    'Auto-reply: out of office',
  ])('«%s»', (text) => {
    expect(looksAutomated(text)).toBe(true);
  });

  it.each(['الكورس بكام', 'عايز اكلم حد', 'تمام شكرا'])('a person: «%s»', (text) => {
    expect(looksAutomated(text)).toBe(false);
  });
});
