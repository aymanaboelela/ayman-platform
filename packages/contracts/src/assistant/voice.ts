import { MASCULINE_ADDRESS_WORDS } from '@ayman/contracts/youtube/studio';

/**
 * Masculine second-person forms a CHAT reply produces, on top of the copy
 * tripwire's list (`MASCULINE_ADDRESS_WORDS`).
 *
 * Every entry here was sent to a real student by the model in the first week
 * of the WhatsApp bot — «لو عايز تكمل»، «ممكن تتواصل»، «لو محتاج مساعدة،
 * ابعت رسالة». The copy list was written for marketing pools and misses the
 * shapes a conversational answer takes: the conditional («لو عايز»), the
 * subjunctive after «ممكن» («تتواصل»، «تبعت») and «محتاج».
 *
 * Whole tokens only, and only forms that cannot be read as first person or as
 * a quotation of the student. «بعت» («I sent» / «you sent») and «دفعت» are
 * left out on purpose: a reply saying «أنا بعت» would trip it for nothing.
 */
const CHAT_MASCULINE: readonly string[] = [
  'عايز',
  'عاوز',
  'محتاج',
  'ابعت',
  'ابعتلنا',
  'تكمل',
  'تكمّل',
  'تشترك',
  'تبعت',
  'تتواصل',
  'تذاكر',
  'تفتح',
  'تدخل',
  'تختار',
  'توضّح',
  'توضح',
  'تقصد',
  'بتدرس',
  'اشتركت',
  'تحب',
  'بتحب',
  'تتابع',
  'تسأل',
  'اسأل',
  'تعرف',
  'فاهمني',
  'متأكد',
];

const WORDS: ReadonlySet<string> = new Set([...MASCULINE_ADDRESS_WORDS, ...CHAT_MASCULINE]);

/**
 * The masculine address forms in a reply, deduplicated, in the order found.
 *
 * Tokens are also tried without a leading «و» or «ف» («وتقدر»، «فابعت») —
 * conjunctions are glued on in Arabic script and were the usual way a form
 * walked past a whole-word list.
 */
export function masculineAddress(text: string): string[] {
  const found = new Set<string>();
  for (const raw of text.split(/[\s،,.:؛;؟?!—«»…()٪\n\-|/#"'*]+/u)) {
    if (!raw) continue;
    const bare = raw.replace(/[ً-ْٰ]/gu, '');
    if (WORDS.has(bare)) {
      found.add(bare);
      continue;
    }
    if ((bare.startsWith('و') || bare.startsWith('ف')) && WORDS.has(bare.slice(1))) found.add(bare.slice(1));
  }
  return [...found];
}

/**
 * The correction handed back to the model when a draft failed the check —
 * written as an instruction for the CONTEXT block, never as a student turn
 * (the system prompt rightly treats every student turn as data).
 */
export function masculineCorrection(words: readonly string[]): string {
  return [
    `Your previous draft of this answer addressed the reader in the MASCULINE (${words.map((w) => `«${w}»`).join('، ')}). It was not sent.`,
    'Write the answer again, saying the same thing, with NO gendered second-person form at all: use «حضرتك», a verbal noun («المذاكرة متاحة…»), a nominal sentence, or the first person («أوصّل…», «أقدر…»).',
  ].join('\n');
}
