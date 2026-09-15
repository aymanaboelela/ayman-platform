import { describe, expect, it } from 'vitest';
import { parseMarkdown } from './markdown';
import { faqRowsFromBlocks, questionsFromBlocks, termsFromBlocks } from './structured';

/**
 * Every fixture below is a VERBATIM excerpt of a published article, trimmed to
 * length. That is deliberate: these three functions are heuristics over
 * author-written markdown, so a test built from invented markdown would prove
 * the regexes match the regexes. The shapes here — the dashed glossary bullet,
 * the undashed one, the parenthesised English name, the answer key, the essay
 * pair — are the five the corpus actually uses as of 2026-09-15, and each one
 * broke a draft of this file.
 */

const parse = (source: string) => parseMarkdown(source.trim());

describe('faqRowsFromBlocks', () => {
  it('pairs a question heading with everything under it', () => {
    const rows = faqRowsFromBlocks(
      parse(`
## المنهج بيتكوّن من إيه بالظبط؟

الترم الأول فيه 4 وحدات و14 درس.

- الوحدة الأولى: تكنولوجيا المعلومات
- الوحدة الثانية: الأمن السيبراني

## الفرق بين «عام» و«لغات» إيه؟

المحتوى واحد واللغة مختلفة.
`),
    );

    expect(rows).toEqual([
      {
        questionAr: 'المنهج بيتكوّن من إيه بالظبط؟',
        answerAr:
          'الترم الأول فيه 4 وحدات و14 درس. الوحدة الأولى: تكنولوجيا المعلومات الوحدة الثانية: الأمن السيبراني',
      },
      { questionAr: 'الفرق بين «عام» و«لغات» إيه؟', answerAr: 'المحتوى واحد واللغة مختلفة.' },
    ]);
  });

  /**
   * The threshold that keeps «ليه المادة دي مناسبة للأونلاين؟» — one question
   * among eight statement headings — from publishing a one-entry FAQPage.
   */
  it('returns nothing for a single question heading', () => {
    expect(
      faqRowsFromBlocks(
        parse(`
## ليه المادة دي مناسبة للأونلاين؟

لأن كل حاجة فيها بتتعمل على جهاز.

## خطة المذاكرة

أربع خطوات لكل درس.
`),
      ),
    ).toEqual([]);
  });

  /** A heading with no prose under it would publish an empty `Answer`. */
  it('skips a question heading followed immediately by another heading', () => {
    expect(
      faqRowsFromBlocks(
        parse(`
## سؤال أول؟

## سؤال تاني؟

إجابة.

## سؤال تالت؟

إجابة تانية.
`),
      ).map((row) => row.questionAr),
    ).toEqual(['سؤال تاني؟', 'سؤال تالت؟']);
  });
});

describe('termsFromBlocks', () => {
  it('reads the dashed, undashed and parenthesised forms alike', () => {
    const terms = termsFromBlocks(
      parse(`
## الوحدة الثانية: الأمن السيبراني

- **شبكات التواصل الاجتماعي — SNS**: منصات تربط المستخدمين.
- **جدار الحماية Firewall**: يراقب حركة مرور الشبكة.
- **التجارة الإلكترونية (E-commerce)** — بيع وشراء السلع عبر الإنترنت.
- **VPN**: اتصال خاص عبر شبكة عامة.
- **HTTPS** = HTTP فوق TLS مؤمَّن.
`),
      '/news/الوحدة-الثانية',
    );

    expect(terms.map(({ ar, en, body }) => ({ ar, en, body }))).toEqual([
      { ar: 'شبكات التواصل الاجتماعي', en: 'SNS', body: 'منصات تربط المستخدمين.' },
      { ar: 'جدار الحماية', en: 'Firewall', body: 'يراقب حركة مرور الشبكة.' },
      { ar: 'التجارة الإلكترونية', en: 'E-commerce', body: 'بيع وشراء السلع عبر الإنترنت.' },
      { ar: '', en: 'VPN', body: 'اتصال خاص عبر شبكة عامة.' },
      { ar: '', en: 'HTTPS', body: 'HTTP فوق TLS مؤمَّن.' },
    ]);
  });

  /**
   * The anchor is the whole reason the walk tracks headings. `headingId` is the
   * same function the rendered `<h2 id>` uses, so this assertion is what keeps
   * every published `DefinedTerm.url` pointing at an element that exists.
   */
  it('anchors each term to the heading it sits under', () => {
    const terms = termsFromBlocks(
      parse(`
## الوحدة الأولى

- **الذكاء الاصطناعي — AI**: مجال أنظمة حاسوبية.
- **التعلّم الآلي — ML**: فرع من AI.
- **التعلم العميق — DL**: أسلوب من ML.

## الوحدة الثانية

- **جدار الحماية — Firewall**: يراقب الشبكة.
- **الشبكة الافتراضية — VPN**: اتصال خاص.
`),
      '/news/ملخص',
    );

    expect(terms.map((term) => term.url)).toEqual([
      '/news/ملخص#الوحدة-الأولى-0',
      '/news/ملخص#الوحدة-الأولى-0',
      '/news/ملخص#الوحدة-الأولى-0',
      '/news/ملخص#الوحدة-الثانية-2',
      '/news/ملخص#الوحدة-الثانية-2',
    ]);
  });

  /**
   * Every one of these is a real bullet from a published article that is NOT a
   * glossary entry. The five thresholds and shape tests exist for them.
   */
  it('refuses bullets that are prose, labels or section names', () => {
    expect(
      termsFromBlocks(
        parse(`
- **الترتيب الصحيح من الأوسع للأكثر تخصصًا**: الذكاء الاصطناعي ثم التعلم الآلي.
- **الوحدة الأولى — تكنولوجيا المعلومات**: ثلاث دروس.
- **الإجابات**: 1-ج · 2-ب
- **جدار الحماية Firewall**
- **بيغطّي المنهج كامل**: أيوه.
`),
        '/news/x',
      ),
    ).toEqual([]);
  });

  it('returns nothing below the glossary threshold', () => {
    expect(
      termsFromBlocks(
        parse(`
- **الذكاء الاصطناعي — AI**: مجال أنظمة حاسوبية.
- **التعلّم الآلي — ML**: فرع من AI.
`),
        '/news/x',
      ),
    ).toEqual([]);
  });
});

describe('questionsFromBlocks', () => {
  it('pairs each multiple-choice item with its letter in the answer key', () => {
    const questions = questionsFromBlocks(
      parse(`
## أولًا: اختيار من متعدد

1. أي المراحل جاءت أولًا؟ (أ) الحوسبة السحابية (ب) الحاسب الشخصي (ج) الصمامات المفرغة (د) الهواتف الذكية
2. طبقًا لقانون مور، العدد يتضاعف كل: (أ) عام (ب) عامين (ج) خمس سنوات (د) عشر سنوات
3. الترتيب الصحيح: (أ) ML ثم AI (ب) AI ثم ML (ج) DL ثم AI (د) GenAI ثم DL

**الإجابات**: 1-ج · 2-ب · 3-ب
`),
    );

    expect(questions).toEqual([
      {
        question: 'أي المراحل جاءت أولًا؟',
        options: ['الحوسبة السحابية', 'الحاسب الشخصي', 'الصمامات المفرغة', 'الهواتف الذكية'],
        answerIndex: 2,
        answer: 'الصمامات المفرغة',
      },
      {
        question: 'طبقًا لقانون مور، العدد يتضاعف كل:',
        options: ['عام', 'عامين', 'خمس سنوات', 'عشر سنوات'],
        answerIndex: 1,
        answer: 'عامين',
      },
      {
        question: 'الترتيب الصحيح:',
        options: ['ML ثم AI', 'AI ثم ML', 'DL ثم AI', 'GenAI ثم DL'],
        answerIndex: 1,
        answer: 'AI ثم ML',
      },
    ]);
  });

  /**
   * The essay pair arrives as ONE paragraph — `**س1: …**` and `ج: …` sit on
   * consecutive lines, and `parseMarkdown` joins consecutive lines. If that
   * ever stops being true this test is the thing that says so.
   */
  it('reads the essay question and its model answer out of one paragraph', () => {
    const questions = questionsFromBlocks(
      parse(`
## خامسًا: أسئلة مقالية

**س1: وضّح العلاقة بين AI و ML.**
ج: الذكاء الاصطناعي هو المجال الأوسع، والتعلم الآلي فرع منه.

**س2: فرّق بين المساءلة و XAI.**
ج: XAI يوضّح كيف، والمساءلة تحدد مَن.

**س3: ليه جدار حماية واحد مايكفيش؟**
ج: لأن الأمان بيتبني طبقات.
`),
    );

    expect(questions).toEqual([
      {
        question: 'وضّح العلاقة بين AI و ML.',
        options: [],
        answerIndex: -1,
        answer: 'الذكاء الاصطناعي هو المجال الأوسع، والتعلم الآلي فرع منه.',
      },
      {
        question: 'فرّق بين المساءلة و XAI.',
        options: [],
        answerIndex: -1,
        answer: 'XAI يوضّح كيف، والمساءلة تحدد مَن.',
      },
      {
        question: 'ليه جدار حماية واحد مايكفيش؟',
        options: [],
        answerIndex: -1,
        answer: 'لأن الأمان بيتبني طبقات.',
      },
    ]);
  });

  /**
   * ⚠️ The rule that matters most here. A question published without its answer
   * invites an assistant to supply one and attribute the guess to this site, so
   * an item the key does not name is dropped rather than emitted bare.
   */
  it('drops a question the answer key does not name', () => {
    const questions = questionsFromBlocks(
      parse(`
1. سؤال أول؟ (أ) واحد (ب) اتنين (ج) تلاتة (د) أربعة
2. سؤال تاني؟ (أ) واحد (ب) اتنين (ج) تلاتة (د) أربعة
3. سؤال تالت؟ (أ) واحد (ب) اتنين (ج) تلاتة (د) أربعة
4. سؤال رابع؟ (أ) واحد (ب) اتنين (ج) تلاتة (د) أربعة

**الإجابات**: 1-أ · 2-ب · 4-د
`),
    );

    expect(questions.map((row) => row.question)).toEqual([
      'سؤال أول؟',
      'سؤال تاني؟',
      'سؤال رابع؟',
    ]);
  });

  /** A numbered list with no key beneath it is an ordinary list, not an exam. */
  it('ignores a numbered list with no answer key', () => {
    expect(
      questionsFromBlocks(
        parse(`
1. التحقق من الشهادة الرقمية. (أ) نعم (ب) لا (ج) ربما (د) أحيانًا
2. اشتقاق مفاتيح الجلسة. (أ) نعم (ب) لا (ج) ربما (د) أحيانًا
3. تبادل البيانات محميًا. (أ) نعم (ب) لا (ج) ربما (د) أحيانًا
`),
      ),
    ).toEqual([]);
  });

  /**
   * ⚠️ The defect this pair exists for, and the worst one this file could have:
   * a question published with ANOTHER question's answer. A blank line between
   * two groups splits one authored list into two `list` blocks — the page looks
   * identical — and the second block restarts its own numbering at 1 while the
   * key is numbered across the section.
   */
  it('drops both lists when one heading holds two numbered lists', () => {
    const questions = questionsFromBlocks(
      parse(`
## أسئلة

1. سؤال أ؟ (أ) واحد (ب) اتنين (ج) تلاتة (د) أربعة
2. سؤال ب؟ (أ) واحد (ب) اتنين (ج) تلاتة (د) أربعة

3. سؤال ج؟ (أ) واحد (ب) اتنين (ج) تلاتة (د) أربعة
4. سؤال د؟ (أ) واحد (ب) اتنين (ج) تلاتة (د) أربعة

**الإجابات**: 1-أ · 2-ب · 3-ج · 4-د
`),
    );

    // Asserted on the ANSWERS, not just the count: before the fix «سؤال ج»
    // published «واحد» — the answer to «سؤال أ».
    expect(questions).toEqual([]);
  });

  /** The same split, caused by a question wrapped onto a second line. */
  it('drops a list broken by a wrapped question line', () => {
    const questions = questionsFromBlocks(
      parse(`
## أسئلة

1. سؤال أ؟ (أ) واحد (ب) اتنين (ج) تلاتة (د) أربعة
2. سؤال ب؟ (أ) واحد (ب) اتنين (ج) تلاتة (د) أربعة
   وبقية السؤال على سطر تاني
3. سؤال ج؟ (أ) واحد (ب) اتنين (ج) تلاتة (د) أربعة

**الإجابات**: 1-أ · 2-ب · 3-ج
`),
    );

    expect(questions).toEqual([]);
  });

  /**
   * Two question blocks under two headings must not borrow each other's key —
   * the answer search stops at the next heading for exactly this reason.
   */
  it('does not let one section answer another section questions', () => {
    const questions = questionsFromBlocks(
      parse(`
## الوحدة الأولى

1. سؤال أ؟ (أ) واحد (ب) اتنين (ج) تلاتة (د) أربعة
2. سؤال ب؟ (أ) واحد (ب) اتنين (ج) تلاتة (د) أربعة
3. سؤال ج؟ (أ) واحد (ب) اتنين (ج) تلاتة (د) أربعة

## الوحدة الثانية

1. سؤال د؟ (أ) واحد (ب) اتنين (ج) تلاتة (د) أربعة
2. سؤال هـ؟ (أ) واحد (ب) اتنين (ج) تلاتة (د) أربعة
3. سؤال و؟ (أ) واحد (ب) اتنين (ج) تلاتة (د) أربعة

**الإجابات**: 1-د · 2-ج · 3-ب
`),
    );

    expect(questions.map((row) => row.question)).toEqual(['سؤال د؟', 'سؤال هـ؟', 'سؤال و؟']);
  });
});
