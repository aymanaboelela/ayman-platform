import type { AskEvent } from '@ayman/contracts/assistant/ask';
import { DEFAULT_BOT_SETTINGS } from '@ayman/contracts/wa-bot/schemas';
import type { YearOption } from '@ayman/contracts/wa-bot/intents';
import { copy as bot } from '@ayman/contracts/copy/wa-bot';
import { DEFAULT_KEYWORDS } from '@ayman/contracts/wa-bot/intents';
import type { AssistantAiService } from '../assistant/ai/assistant-ai.service';
import { FRESH_CHAT, WaBotBrainService, type BrainChat, type BrainInput } from './wa-bot-brain.service';
import { UNKNOWN, type Identity } from './wa-bot-identity.service';
import type { CourseFact, PersonalLine } from './render';
import type { WaBotFactsService } from './wa-bot-facts.service';
import type { WaBotSettingsService } from './wa-bot-settings.service';

/**
 * The reading half of the bot, against stub facts. What is asserted is the
 * TEXT a phone would receive — prices to the pound, the right year's links —
 * because that is the only thing anybody on the other end ever sees.
 */

const APP = 'https://platform.test';

const OPTIONS: YearOption[] = [
  { system: 'bacalorya', year: 1, label: 'الصف الأول بكالوريا' },
  { system: 'bacalorya', year: 2, label: 'الصف الثاني بكالوريا' },
  { system: 'bacalorya', year: 3, label: 'الصف الثالث بكالوريا' },
];

function course(over: Partial<CourseFact>): CourseFact {
  return {
    slug: 'y2-programming',
    title: 'برمجة تانية',
    system: 'bacalorya',
    year: 2,
    requiresGrant: true,
    monthlyPriceCents: 15000,
    monthlyOnSale: true,
    yearlyPriceCents: 120000,
    terms: [{ title: 'الترم الأول', priceCents: 50000 }],
    freeLessons: 2,
    scheduleNote: 'السبت والتلات ٨ م',
    ...over,
  };
}

let courses: CourseFact[];
let personal: PersonalLine[];
let books: { title: string; priceCents: number; inStock: boolean }[] | null;
let modelEvents: AskEvent[] | null;
let modelProvider: string | null;

const facts = {
  appUrl: APP,
  catalog: jest.fn(async () => ({ courses, options: OPTIONS })),
  site: jest.fn(async () => ({
    contact: { instapay: '+201011112222', vodafoneCash: '+201033334444', whatsappChannel: 'https://whatsapp.com/channel/x' },
    rates: { cairo_giza: 8000, delta: 10000, far: 12000 },
  })),
  books: jest.fn(async () => books),
  personal: jest.fn(async () => personal),
} as unknown as WaBotFactsService;

const answers = {
  resolved: jest.fn(async () => ({
    text: new Map(Object.entries(bot.answers)),
    classify: {},
  })),
} as unknown as WaBotSettingsService;

const ai = {
  get available() {
    return modelEvents !== null;
  },
  answer: jest.fn(async function* (_q: string, _h: unknown, _s: unknown, _st: unknown, meta?: { provider: string | null }) {
    if (meta) meta.provider = modelProvider;
    for (const event of modelEvents ?? []) yield event;
  }),
} as unknown as AssistantAiService;

const brain = new WaBotBrainService(facts, answers, ai);

function ask(text: string, over: { identity?: Identity; chat?: Partial<BrainChat>; aiFallback?: boolean } = {}) {
  const input: BrainInput = {
    text,
    identity: over.identity ?? UNKNOWN,
    chat: { ...FRESH_CHAT, ...over.chat },
    history: [],
    settings: { ...DEFAULT_BOT_SETTINGS, aiFallback: over.aiFallback ?? true },
    now: new Date('2026-10-28T11:00:00Z'),
  };
  return brain.compose(input);
}

const STUDENT: Identity = {
  who: 'student',
  userId: 'u1',
  name: 'منى أحمد',
  system: 'bacalorya',
  year: 2,
  staff: false,
};

beforeEach(() => {
  courses = [
    course({}),
    course({ slug: 'y1-basics', title: 'أساسيات أولى', year: 1, monthlyPriceCents: 10000, yearlyPriceCents: null, terms: [] }),
  ];
  personal = [];
  books = [{ title: 'كتاب تانية', priceCents: 25000, inStock: true }];
  modelEvents = null;
  modelProvider = 'gemini';
});

describe('a price question from a new number', () => {
  it('asks the year first, with numbered options — the price depends on it', async () => {
    const result = await ask('الكورس بكام؟');
    expect(result.action).toBe('askYear');
    expect(result.reply).toContain('1- الصف الأول بكالوريا');
    expect(result.reply).toContain('3- الصف الثالث بكالوريا');
    expect(result.patch).toMatchObject({ awaitingYear: true, pendingIntents: ['price'], yearAsks: 1 });
  });

  it('answers «2» with year two’s LIVE prices and its link, and nothing of year one', async () => {
    const result = await ask('2', { chat: { awaitingYear: true, pendingIntents: ['price'], yearAsks: 1 } });
    expect(result.action).toBe('answer');
    expect(result.intents).toEqual(['price']);
    expect(result.reply).toContain('الشهر 150 جنيه');
    expect(result.reply).toContain('الترم الأول 500 جنيه');
    expect(result.reply).toContain('السنة كاملة 1,200 جنيه');
    expect(result.reply).toContain(`${APP}/courses/y2-programming`);
    expect(result.reply).not.toContain('أساسيات أولى');
    expect(result.patch).toMatchObject({ awaitingYear: false, year: OPTIONS[1] });
  });

  it('quotes the price as it is NOW — a change between two questions is the one answered', async () => {
    await ask('2', { chat: { awaitingYear: true, pendingIntents: ['price'], yearAsks: 1 } });
    courses = [course({ monthlyPriceCents: 17500 })];
    const result = await ask('الكورس بكام', { chat: { yearSystem: 'bacalorya', year: 2 } });
    expect(result.reply).toContain('الشهر 175 جنيه');
    expect(result.reply).not.toContain('150');
  });

  it('skips the question when the message already names the year', async () => {
    const result = await ask('انا في تانية بكالوريا والكورس بكام');
    expect(result.action).toBe('answer');
    expect(result.reply).toContain('الشهر 150 جنيه');
    expect(result.patch.year).toEqual(OPTIONS[1]);
  });

  it('asks again once when the answer is not a year, then answers for every year', async () => {
    const again = await ask('مش فاهم', { chat: { awaitingYear: true, pendingIntents: ['price'], yearAsks: 1 } });
    expect(again.action).toBe('askYear');
    expect(again.reply).toContain(bot.reply.yearRetry.split('\n')[0]!);

    const giveUp = await ask('مش فاهم', { chat: { awaitingYear: true, pendingIntents: ['price'], yearAsks: 2 } });
    expect(giveUp.action).toBe('answer');
    expect(giveUp.reply).toContain('برمجة تانية');
    expect(giveUp.reply).toContain('أساسيات أولى');
  });
});

describe('free versus paid is never guessed', () => {
  it('a course that needs no grant is «مفتوح من غير اشتراك», with no number', async () => {
    courses = [course({ requiresGrant: false, monthlyPriceCents: null, yearlyPriceCents: null, terms: [] })];
    const result = await ask('الكورس بكام', { chat: { yearSystem: 'bacalorya', year: 2 } });
    expect(result.reply).toContain(bot.reply.coursePlansFree);
    expect(result.reply).not.toMatch(/\d+ جنيه/u);
  });

  it('a paid course with nothing on sale quotes no number at all', async () => {
    courses = [course({ monthlyPriceCents: 15000, monthlyOnSale: false, yearlyPriceCents: null, terms: [] })];
    const result = await ask('الكورس بكام', { chat: { yearSystem: 'bacalorya', year: 2 } });
    expect(result.reply).toContain(bot.reply.coursePlansAsk);
    expect(result.reply).not.toContain('150');
  });
});

describe('a known student', () => {
  it('is answered for their own year without being asked, and greeted by first name', async () => {
    const result = await ask('الكورس بكام', { identity: STUDENT });
    expect(result.action).toBe('answer');
    expect(result.reply?.startsWith('أهلاً يا منى')).toBe(true);
    expect(result.reply).toContain('الشهر 150 جنيه');
  });

  it('gets their own subscription under «طريقة الاشتراك»', async () => {
    personal = [
      { kind: 'active', course: 'برمجة تانية', slug: 'y2-programming', until: new Date('2026-11-30T00:00:00Z'), since: null },
      { kind: 'pending', course: 'أساسيات أولى', slug: 'y1-basics', until: null, since: new Date('2026-10-27T10:00:00Z') },
    ];
    const result = await ask('ازاي اشترك', { identity: STUDENT });
    expect(result.reply).toContain('اشتراكك في «برمجة تانية» شغّال لحد');
    expect(result.reply).toContain('فيه دفعة لـ«أساسيات أولى» مستنية المراجعة');
  });

  it('a parent is told about their child by name, never «اشتراكك»', async () => {
    personal = [{ kind: 'expired', course: 'برمجة تانية', slug: 'y2-programming', until: null, since: null }];
    const parent: Identity = { ...STUDENT, who: 'parent' };
    const result = await ask('ادفع ازاي', { identity: parent });
    expect(result.reply).toContain('اشتراك منى في «برمجة تانية» خلص');
    expect(result.reply).toContain(`${APP}/courses/y2-programming/subscribe`);
    expect(result.reply).not.toContain('اشتراكك');
  });

  it('a lead never gets a subscription line — there is no account to read', async () => {
    const result = await ask('ازاي اشترك', { chat: { yearSystem: 'bacalorya', year: 2 } });
    expect(result.reply).not.toContain('اشتراكك');
    expect(facts.personal).not.toHaveBeenCalledWith(null, expect.anything());
  });
});

describe('payment, books, schedule', () => {
  it('reads the transfer numbers from the settings, in the form people type them', async () => {
    const result = await ask('ادفع انستاباي ولا فودافون كاش؟');
    expect(result.reply).toContain('إنستاباي: 01011112222');
    expect(result.reply).toContain('فودافون كاش: 01033334444');
  });

  it('lists the books with prices and the delivery fee by zone', async () => {
    const result = await ask('الكتاب بيوصل البيت؟');
    expect(result.reply).toContain('كتاب تانية — 250 جنيه');
    expect(result.reply).toContain('القاهرة والجيزة 80 جنيه');
  });

  it('hands a book question to a person on a stack without the shop', async () => {
    books = null;
    const result = await ask('الكتاب بكام');
    expect(['handoff', 'model']).toContain(result.action);
    expect(result.reply ?? '').not.toContain('جنيه');
  });

  it('quotes each course’s own schedule line', async () => {
    const result = await ask('الحصص بتنزل امتى', { chat: { yearSystem: 'bacalorya', year: 2 } });
    expect(result.reply).toContain('برمجة تانية: السبت والتلات ٨ م');
    expect(result.reply).toContain('https://whatsapp.com/channel/x');
  });
});

describe('handing over to a person', () => {
  it('«عاوز أكلم حد» hands over with one sentence and flags the inbox', async () => {
    const result = await ask('عاوز أكلم حد');
    expect(result.action).toBe('handoff');
    expect(result.reply).toBe(bot.answers.human);
    expect(result.patch).toMatchObject({ needsHuman: true, handoffNotice: true });
  });

  it('an unmatched question with no model goes to a person', async () => {
    const result = await ask('ممكن تشرحلي الـ recursion؟');
    expect(result.action).toBe('handoff');
    expect(result.reply).toBe(bot.reply.handoff);
    expect(result.patch.needsHuman).toBe(true);
  });

  it('says so only once every few hours — the second unmatched question waits silently', async () => {
    const result = await ask('وسؤال تاني', { chat: { lastHandoffNoticeAt: new Date('2026-10-28T10:00:00Z') } });
    expect(result.action).toBe('silent');
    expect(result.patch.needsHuman).toBe(true);
  });
});

describe('the model fallback', () => {
  it('answers what no rule matched, marked as automatic', async () => {
    modelEvents = [
      { t: 'delta', text: 'الـ recursion يعني الدالة بتنده نفسها.' },
      { t: 'done', escalate: false, actions: [{ label: 'الكورسات', href: '/courses' }] },
    ];
    const result = await ask('ممكن تشرحلي الـ recursion؟');
    expect(result.action).toBe('model');
    expect(result.reply).toContain('الدالة بتنده نفسها');
    expect(result.reply).toContain(`الكورسات: ${APP}/courses`);
    expect(result.reply).toContain(bot.reply.modelFooter);
  });

  it('a model that is not sure hands over instead of guessing', async () => {
    modelEvents = [{ t: 'delta', text: 'مش متأكد.' }, { t: 'done', escalate: true }];
    expect((await ask('سؤال صعب جدا')).action).toBe('handoff');
  });

  it('the written script answering is NOT a model answer — it goes to a person', async () => {
    modelEvents = [{ t: 'delta', text: 'كلام من السكريبت' }, { t: 'done', escalate: false }];
    modelProvider = null;
    expect((await ask('سؤال صعب جدا')).action).toBe('handoff');
  });

  it('is never asked when the admin switched it off', async () => {
    modelEvents = [{ t: 'delta', text: 'إجابة' }, { t: 'done', escalate: false }];
    expect((await ask('سؤال صعب جدا', { aiFallback: false })).action).toBe('handoff');
  });
});

describe('silence', () => {
  it.each(['شكرا', 'تمام', 'ok'])('«%s» needs no answer', async (text) => {
    expect((await ask(text)).action).toBe('silent');
  });

  it('«قف» is never answered', async () => {
    expect((await ask('قف')).action).toBe('silent');
  });

  it('another bot’s auto-reply is never answered', async () => {
    expect((await ask('رد تلقائي: شكرا لتواصلك معنا')).action).toBe('silent');
  });

  it('a greeting on its own gets the welcome menu', async () => {
    const result = await ask('السلام عليكم');
    expect(result.action).toBe('answer');
    expect(result.reply?.startsWith(bot.reply.greetSalam)).toBe(true);
    expect(result.reply).toContain('الأسعار');
  });
});

it('the default vocabulary is what the admin screen shows as read-only', () => {
  expect(DEFAULT_KEYWORDS.price).toContain('بكام');
});
