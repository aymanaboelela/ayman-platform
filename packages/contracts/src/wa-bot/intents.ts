import { normalizeArabic, tokenVariants, tokenize } from '@ayman/contracts/wa-bot/normalize';

/**
 * What the WhatsApp auto-reply bot recognises, and how it recognises it.
 *
 * ## Rules, not a model
 *
 * Every reply this bot sends goes out from the instructor's own number to a
 * person who wrote to it, so the questions that make up nearly all of that
 * traffic — «الكورس بكام», «أشترك إزاي», «فيه حصة تجريبية» — are answered by
 * rules whose behaviour can be read in this file and tested line by line. A
 * model is only ever a FALLBACK for what nothing here matched (see the API's
 * `WaBotReplier`), never the first reader.
 *
 * ## How a keyword matches
 *
 * Text and keywords both go through `normalizeArabic`. A keyword is one or
 * more tokens; it matches when its tokens appear consecutively in the message.
 * Each message token is compared in every form `tokenVariants` gives it, so
 * «والكورس» matches «كورس». A token ending in `*` is a PREFIX: «اشترك*»
 * matches «اشتركت» and «اشتراكات» is matched by «اشتراك*».
 *
 * A keyword's weight is its token count, so «حصه تجريبيه» outweighs
 * «تجريبيه» alone, and the most specific reading of a message wins.
 *
 * ## Hard and soft intents
 *
 * A greeting or a «شكرا» rides on top of the real question rather than
 * competing with it: «السلام عليكم، الكورس بكام؟» is a price question that
 * happens to start politely. So `greeting`/`thanks` are only reported as the
 * intent when no HARD intent matched.
 */

export const BOT_INTENTS = [
  'price',
  'subscribe',
  'payment',
  'trial',
  'whichCourse',
  'books',
  'schedule',
  'human',
  'greeting',
  'thanks',
] as const;
export type BotIntent = (typeof BOT_INTENTS)[number];

/** The ones that ride along rather than compete — see the header. */
export const SOFT_INTENTS: readonly BotIntent[] = ['greeting', 'thanks'];

/**
 * The ones whose answer depends on the asker's year: a price, a course link,
 * the free lessons of THEIR course. With the year unknown the bot asks once
 * before answering (`yearQuestion` in `copy/wa-bot.ts`).
 */
export const YEAR_INTENTS: readonly BotIntent[] = ['price', 'whichCourse', 'trial', 'subscribe'];

/**
 * When two intents match, the earlier one is answered first and wins a tie.
 * `human` first: someone who asked for a person and also said «بكام» wants
 * the person.
 */
const PRIORITY: readonly BotIntent[] = [
  'human',
  'price',
  'subscribe',
  'payment',
  'trial',
  'books',
  'schedule',
  'whichCourse',
  'greeting',
  'thanks',
];

/**
 * Answers that already contain another intent's answer. A price reply lists
 * the year's courses with their links, so «الكورس بكام وأنهي كورس؟» is
 * answered once rather than twice.
 */
const SUBSUMES: Partial<Record<BotIntent, readonly BotIntent[]>> = {
  price: ['whichCourse'],
  subscribe: ['whichCourse'],
};

/**
 * The default vocabulary per intent — Egyptian Arabic, Franco-Arabic and the
 * misspellings people actually send. Written UNFOLDED on purpose (hamzas,
 * ta-marbuta and all), because that is how a reviewer reads them; they are
 * folded at match time exactly like the message.
 *
 * The admin can ADD keywords per intent from «الرد الآلي» (stored in the
 * database), never remove these — a keyword removed here is a code change
 * reviewed like any other.
 *
 * ⚠️ Bare «كام» is deliberately absent from `price`: «سنة كام» and «كام حصة»
 * are not price questions. The price keywords all carry a «ب» or a noun.
 */
export const DEFAULT_KEYWORDS: Record<BotIntent, readonly string[]> = {
  price: [
    'بكام', 'بكم', 'بكامم', 'سعر*', 'أسعار', 'الأسعار', 'تمن', 'تمنه', 'ثمن', 'تكلفة',
    'بيتكلف*', 'بتكلف*', 'كام جنيه', 'المصاريف', 'مصاريف', 'الاشتراك كام', 'الكورس كام',
    'الشهر كام', 'الشهر بكام', 'التيرم بكام', 'الترم بكام', 'الحصة بكام', 'قيمة الاشتراك',
    'price*', 'how much', 'cost', 'fees', 'bkam', 'b kam', 'be kam', 'bekam', 'bkm', 'bikam',
    'se3r*', 's3r', 'as3ar', 'asaar', 'kam geneh', 'el course kam',
  ],
  subscribe: [
    'اشترك*', 'اشتراك*', 'أشترك*', 'نشترك', 'هشترك', 'أسجل', 'اسجل', 'سجل*', 'تسجيل', 'التسجيل',
    'أحجز', 'احجز', 'حجز', 'انضم', 'أنضم', 'ادخل الكورس', 'أبدأ', 'ابدا', 'أبتدي', 'ابتدي',
    'عاوز اشترك', 'عايز اشترك', 'عايزه اشترك', 'عاوزه اشترك', 'خطوات الاشتراك', 'طريقة الاشتراك',
    'a4tr*', 'a4tar*', 'ashtr*', 'ashtar*', 'eshtrak*', 'eshtr*', 'eshtar*', 'eshterak*', 'e4tr*', 'e4tar*', 'subscri*', 'register*',
    'sign up', 'signup', 'join', 'enrol*', 'sagel', 'asagel', 'tasgeel', 'hgz', '7agz', 'a7gez',
  ],
  payment: [
    'انستاباي', 'انستا باي', 'إنستاباي', 'انستا', 'محفظة', 'محفظه', 'المحفظة', 'محافظ',
    'فودافون كاش', 'فودافون', 'اورانج كاش', 'اتصالات كاش', 'كاش', 'أدفع', 'ادفع', 'الدفع',
    'دفع', 'ندفع', 'حولت', 'حوّلت', 'تحويل', 'أحول', 'احول', 'بحول', 'فيزا', 'فوري',
    'instapay', 'insta pay', 'insta', 'vodafone', 'vf cash', 'cash', 'wallet', 'pay*',
    'visa', 'fawry', 'transfer*', 'adfa3', 'dafa3', 'ad fa3', 'tahwil', 'ta7weel', '7awelt',
  ],
  trial: [
    'تجريبي*', 'تجريبية', 'تجربة', 'أجرب', 'اجرب', 'نجرب', 'مجاني*', 'مجانا', 'ببلاش',
    'فري', 'عينة', 'حصة مجانية', 'درس مجاني', 'أشوف الشرح', 'اشوف شرح', 'أشوف شرحك',
    'شرح مجاني', 'حصة تجريبية', 'free', 'trial', 'demo', 'sample', 'tagrib*', 'tagreeb*',
    'mgany', 'magany', 'mag ani', 'bbalash', 'b balash', 'balash',
  ],
  whichCourse: [
    'أنهي كورس', 'انهي كورس', 'انهو كورس', 'أي كورس', 'اي كورس', 'كورس إيه', 'كورس ايه',
    'إيه الكورسات', 'ايه الكورسات', 'الكورسات', 'كورسات', 'المنهج', 'منهج', 'المواد',
    'بتشرح إيه', 'بتشرح ايه', 'بتدرس إيه', 'بتدرس ايه', 'المحتوى', 'يناسبني', 'المناسب',
    'مناسب لسنتي', 'لسنتي', 'which course', 'courses', 'anhy kors', 'anhy course', 'anho course',
    'kors eh', 'course eh', 'el korsat', 'korsat',
  ],
  books: [
    'كتاب', 'الكتاب', 'كتب', 'الكتب', 'ملزمة', 'ملزمه', 'ملازم', 'مذكرة', 'مذكرات',
    'شحن', 'الشحن', 'توصيل', 'التوصيل', 'يوصل', 'يوصلي', 'بيوصل', 'هيوصل', 'اوردر',
    'أوردر', 'طلب الكتاب', 'الكتاب الورقي', 'مطبوع', 'ketab', 'kitab', 'kotob', 'book*',
    'shipping', 'delivery', 'sha7n', 'shahn', 'tawsil', 'tawseel', 'molazma', 'mozakra',
  ],
  schedule: [
    'معاد', 'ميعاد', 'مواعيد', 'المواعيد', 'امتى', 'إمتى', 'امتي', 'الساعة كام', 'جدول',
    'الجدول', 'بتنزل', 'هتنزل', 'تنزل امتى', 'نزلت', 'لايف', 'سيشن', 'السنتر', 'سنتر',
    'حضوري', 'اونلاين ولا', 'live', 'session', 'schedule', 'timing', 'emta', 'emty',
    'imta', 'mi3ad', 'ma3ad', 'mawa3id', 'mwa3eed', 'center', 'sentar',
  ],
  human: [
    'أكلم حد', 'اكلم حد', 'كلم حد', 'عاوز أكلم', 'عايز اكلم', 'عاوزه اكلم', 'عايزه اكلم',
    'أكلم', 'اكلم', 'كلمني', 'كلموني', 'اتكلم مع', 'أتكلم مع', 'حد يرد', 'حد يكلمني',
    'رد عليا', 'ردوا عليا', 'ردو', 'خدمة العملاء', 'الدعم', 'الدعم الفني', 'مشكلة',
    'مشكله', 'شكوى', 'شكوي', 'مش شغال', 'مش بيفتح', 'مش راضي', 'مش عارف ادخل',
    'مش عارفة ادخل', 'مش قادر', 'مش قادرة', 'نسيت الباسورد', 'الباسورد', 'كلمة السر',
    'اتسرق', 'استرجاع', 'فلوسي', 'call me', 'call', 'kalemny', 'kalimny', 'akalem', 'a kalem',
    'human', 'agent', 'support', 'problem', 'moshkla', 'mushkila', '7ad yrod', '7ad yekalemny',
  ],
  greeting: [
    'السلام عليكم', 'سلام عليكم', 'السلام', 'سلام', 'أهلا', 'اهلا', 'هاي', 'هلو', 'مرحبا',
    'صباح الخير', 'مساء الخير', 'ازيك', 'إزيك', 'ازيكم', 'hi', 'hello', 'hey', 'salam',
    'slm', 'salamo 3alekom', 'el salam', 'sba7 el5er', 'msa2 el5er',
  ],
  thanks: [
    'شكرا', 'شكراً', 'متشكر*', 'تسلم', 'تسلمي', 'تسلموا', 'ميرسي', 'جزاك الله', 'ربنا يكرمك',
    'تمام', 'اوكي', 'أوكي', 'حاضر', 'ماشي', 'thanks', 'thank*', 'thx', 'merci', 'tmam',
    'tamam', 'ok', 'okay', 'shokran', 'mashi',
  ],
};

interface CompiledKeyword {
  readonly tokens: readonly { readonly text: string; readonly prefix: boolean }[];
  readonly weight: number;
}

/** Folds one keyword the way the message is folded, keeping `*` as a marker. */
export function compileKeyword(raw: string): CompiledKeyword | null {
  const parts = raw
    .trim()
    .split(/\s+/u)
    .map((part) => {
      const prefix = part.endsWith('*');
      const text = normalizeArabic(prefix ? part.slice(0, -1) : part);
      return { text, prefix };
    })
    // A part that folds to nothing (an emoji, a «؟») contributes nothing,
    // and a part that folds to SEVERAL tokens is split into them.
    .flatMap((part) =>
      part.text
        .split(' ')
        .filter(Boolean)
        .map((text, index, all) => ({ text, prefix: part.prefix && index === all.length - 1 })),
    );
  if (parts.length === 0) return null;
  return { tokens: parts, weight: parts.length };
}

function tokenMatches(variants: readonly string[], want: { text: string; prefix: boolean }): boolean {
  return variants.some((variant) =>
    want.prefix ? variant.startsWith(want.text) : variant === want.text,
  );
}

/** Whether `keyword` occurs in the message, as consecutive tokens. */
function occurs(message: readonly (readonly string[])[], keyword: CompiledKeyword): boolean {
  const n = keyword.tokens.length;
  for (let start = 0; start + n <= message.length; start += 1) {
    let all = true;
    for (let k = 0; k < n; k += 1) {
      if (!tokenMatches(message[start + k]!, keyword.tokens[k]!)) {
        all = false;
        break;
      }
    }
    if (all) return true;
  }
  return false;
}

/** A message, tokenised once, with every token's variants. */
export function prepareMessage(text: string): string[][] {
  return tokenize(text).map(tokenVariants);
}

/** Total weight of the keywords from `keywords` that occur in `message`. */
export function scoreKeywords(message: readonly (readonly string[])[], keywords: readonly string[]): number {
  let score = 0;
  const seen = new Set<string>();
  for (const raw of keywords) {
    const compiled = compileKeyword(raw);
    if (!compiled) continue;
    const key = compiled.tokens.map((t) => `${t.text}${t.prefix ? '*' : ''}`).join(' ');
    if (seen.has(key)) continue;
    seen.add(key);
    if (occurs(message, compiled)) score += compiled.weight;
  }
  return score;
}

/** An admin-written question with its own answer (`custom:<id>` in the API). */
export interface CustomRule {
  readonly key: string;
  readonly keywords: readonly string[];
}

export interface ClassifyOptions {
  /** Extra keywords per built-in intent, from the admin's table. */
  readonly extraKeywords?: Partial<Record<BotIntent, readonly string[]>>;
  /** Built-in intents the admin switched off — never reported. */
  readonly disabled?: readonly BotIntent[];
  /** Admin-written rules, matched alongside the built-ins. */
  readonly custom?: readonly CustomRule[];
}

export interface Classification {
  /**
   * The questions to answer, most important first, at most two. Built-in
   * intents by name, custom rules by their `custom:` key. Empty means nothing
   * hard matched — the reply falls to the greeting, the model, or a person.
   */
  readonly intents: readonly string[];
  readonly greeting: boolean;
  readonly thanks: boolean;
}

/** Words that make a price question about a COURSE rather than a book. */
const COURSE_WORDS = [
  'كورس*', 'الكورس*', 'اشتراك*', 'الاشتراك', 'شهر*', 'الشهر', 'ترم', 'التيرم', 'تيرم', 'حصه', 'الحصه',
  'kors*', 'cours*', 'month*', 'shahr', 'term',
];

/** How many answers one reply may combine before it stops being a reply. */
export const MAX_INTENTS_PER_REPLY = 2;

export function classify(text: string, options: ClassifyOptions = {}): Classification {
  const message = prepareMessage(text);
  const disabled = new Set(options.disabled ?? []);
  const scored: { key: string; score: number; rank: number }[] = [];

  BOT_INTENTS.forEach((intent) => {
    if (disabled.has(intent)) return;
    const keywords = [...DEFAULT_KEYWORDS[intent], ...(options.extraKeywords?.[intent] ?? [])];
    const score = scoreKeywords(message, keywords);
    if (score > 0) scored.push({ key: intent, score, rank: PRIORITY.indexOf(intent) });
  });

  // Custom rules rank just after `human` — the admin wrote them on purpose,
  // so a custom «الحصص أونلاين ولا سنتر؟» beats the generic schedule answer
  // at an equal score.
  for (const rule of options.custom ?? []) {
    const score = scoreKeywords(message, rule.keywords);
    if (score > 0) scored.push({ key: rule.key, score, rank: 0.5 });
  }

  // «الكتاب بكام» is a BOOK price: the books answer carries its own prices,
  // and asking for the year to quote course prices nobody asked about is the
  // wrong question. Only when the message also names a course does the price
  // of the course stay in.
  const keys = new Set(scored.map((s) => s.key));
  if (keys.has('books') && keys.has('price') && scoreKeywords(message, COURSE_WORDS) === 0) {
    scored.splice(
      scored.findIndex((s) => s.key === 'price'),
      1,
    );
  }

  const greeting = scored.some((s) => s.key === 'greeting');
  const thanks = scored.some((s) => s.key === 'thanks');
  const hard = scored
    .filter((s) => !SOFT_INTENTS.includes(s.key as BotIntent))
    .sort((a, b) => b.score - a.score || a.rank - b.rank);

  const picked: string[] = [];
  for (const candidate of hard) {
    if (picked.length >= MAX_INTENTS_PER_REPLY) break;
    const subsumed = picked.some((p) => SUBSUMES[p as BotIntent]?.includes(candidate.key as BotIntent));
    if (subsumed) continue;
    // …and the other direction: a later, broader answer replaces a narrower one.
    const replaces = SUBSUMES[candidate.key as BotIntent] ?? [];
    for (const narrower of replaces) {
      const at = picked.indexOf(narrower);
      if (at !== -1) picked.splice(at, 1);
    }
    picked.push(candidate.key);
  }

  return { intents: picked, greeting, thanks };
}

// ── the year ─────────────────────────────────────────────────────────────

/** One of the numbered answers to «السنة الدراسية كام؟». */
export interface YearOption {
  /** `education_systems.slug` — `bacalorya`, `thanaweya_amma`, `preparatory`. */
  readonly system: string;
  readonly year: number;
  readonly label: string;
}

const YEAR_WORDS: Record<number, readonly string[]> = {
  1: ['أولى', 'اولى', 'الأولى', 'أول', 'اول', 'الأول', 'واحد', 'first', '1st', 'ola', 'oula', 'oola', 'awel', 'awl'],
  2: ['تانية', 'ثانية', 'التانية', 'الثانية', 'تاني', 'ثاني', 'التاني', 'الثاني', 'اتنين', 'اثنين', 'second', '2nd', 'tanya', 'tania', 'tanyah', 'tany', 'tani'],
  3: ['تالتة', 'ثالثة', 'التالتة', 'الثالثة', 'تالت', 'ثالث', 'التالت', 'الثالث', 'تلاتة', 'ثلاثة', 'third', '3rd', 'talta', 'talet', 'talt', 'taltah'],
};

const STAGE_WORDS: Record<string, readonly string[]> = {
  thanaweya_amma: ['ثانوي*', 'ثانويه', 'الثانوي', 'ثانوية عامة', 'sec', 'secondary', 'tanawy', 'thanawy', 'thanaweya', 'tanawya'],
  bacalorya: ['بكالوريا', 'بكالوريه', 'بكلوريا', 'البكالوريا', 'bac', 'bakaloria', 'baccalaureate', 'bakalorya'],
  preparatory: ['اعدادي*', 'إعدادي*', 'الاعدادي', 'prep*', 'e3dady', 'e3dadi', 'preparatory'],
};

const YEAR_LEAD = ['سنة', 'سنه', 'الصف', 'صف', 'year', 'grade', 'sana'];

function yearWordAt(variants: readonly string[]): number | null {
  for (const [year, words] of Object.entries(YEAR_WORDS)) {
    for (const word of words) {
      const folded = normalizeArabic(word);
      if (variants.includes(folded)) return Number(year);
    }
  }
  return null;
}

function stageIn(message: readonly (readonly string[])[]): string | null {
  for (const [system, words] of Object.entries(STAGE_WORDS)) {
    if (scoreKeywords(message, words) > 0) return system;
  }
  return null;
}

/**
 * The year a message names, among the stack's own options.
 *
 * `awaiting` is whether the bot has just asked. Then a bare «2» or «تانية» is
 * an answer — and a bare number is the OPTION number, because that is what the
 * question asked for, which is not the year when the options span two systems.
 *
 * When the bot has NOT asked, a number on its own is never read as a year
 * («عندي 2 سؤال»): the message must say «تانية ثانوي», «سنة تالتة» or similar
 * — a year word next to a stage or a «سنة».
 */
export function parseYear(
  text: string,
  options: readonly YearOption[],
  awaiting: boolean,
): YearOption | null {
  if (options.length === 0) return null;
  const message = prepareMessage(text);
  const folded = normalizeArabic(text);

  if (awaiting) {
    const bare = /^(?:رقم\s*)?(\d{1,2})$/u.exec(folded);
    if (bare) {
      const index = Number(bare[1]);
      return options[index - 1] ?? null;
    }
  }

  const stage = stageIn(message);
  let year: number | null = null;
  let led = false;
  for (let i = 0; i < message.length; i += 1) {
    const variants = message[i]!;
    const word = yearWordAt(variants) ?? (/^[1-3]$/u.test(variants[0]!) ? Number(variants[0]) : null);
    if (word === null) continue;
    year = word;
    const prev = message[i - 1];
    if (prev && YEAR_LEAD.some((lead) => prev.includes(normalizeArabic(lead)))) led = true;
    break;
  }
  if (year === null) return null;
  if (!awaiting && !stage && !led) return null;

  const sameYear = options.filter((option) => option.year === year);
  if (stage) {
    const exact = sameYear.find((option) => option.system === stage);
    if (exact) return exact;
  }
  return sameYear.length === 1 ? sameYear[0]! : null;
}

// ── things not to answer ─────────────────────────────────────────────────

/**
 * Phrases another bot's auto-reply carries. Two auto-repliers answering each
 * other is the loop that gets a number banned in an afternoon, so a message
 * that reads like one is never answered — and the chat is muted.
 */
const AUTOMATED = [
  'رسالة تلقائية', 'رساله آليه', 'رسالة آلية', 'رد تلقائي', 'رد آلي', 'الرد الآلي',
  'automated message', 'automatic reply', 'auto reply', 'autoreply', 'auto-reply',
  'this is an automated', 'do not reply', 'no-reply', 'out of office', 'away message',
  'لا ترد على هذه الرسالة', 'خارج أوقات العمل', 'سنرد عليك في أقرب وقت',
];

export function looksAutomated(text: string): boolean {
  const folded = normalizeArabic(text);
  if (!folded) return false;
  return AUTOMATED.some((phrase) => {
    const needle = normalizeArabic(phrase);
    return needle.length > 0 && ` ${folded} `.includes(` ${needle} `);
  });
}
