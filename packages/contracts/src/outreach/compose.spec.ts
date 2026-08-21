import { describe, expect, it } from 'vitest';
import { MESSAGE_MAX } from '@ayman/contracts/assistant/conversation';
import {
  FOCUS_INTROS,
  FOCUS_TAILS,
  NUDGE_BODIES,
  NUDGE_CLOSERS,
  NUDGE_OPENERS,
  OUTREACH_GREETINGS,
  PRAISE_BODIES,
  PRAISE_CLOSERS,
  PRAISE_OPENERS,
  QUIZ_CLOSERS,
  QUIZ_RESULT_OPENERS,
  QUIZ_SCORE_LINES,
  STRENGTH_LINES,
  WHATSAPP_BODIES,
  WHATSAPP_CLOSERS,
  WHATSAPP_OPENERS,
  WHATSAPP_TAGALONGS,
} from '@ayman/contracts/copy/outreach';
import { OUTREACH_KINDS } from '@ayman/contracts/outreach/kinds';
import {
  bandFor,
  composeOutreach,
  firstNameOf,
  parseVariantKey,
  type ComposeInput,
  type OutreachFacts,
} from '@ayman/contracts/outreach/compose';

/**
 * The promise this feature makes is «كل مرة بشكل مختلف» — and a promise about
 * variety is exactly the kind that degrades silently. Nothing in production
 * fails when two students get the same sentence; it just stops being a message
 * from a person. So the no-repeat rule is asserted here, mechanically, over the
 * real pools rather than over fixtures.
 */

const RESULT: OutreachFacts = {
  kind: 'quiz_result',
  quizTitle: 'الحلقات التكرارية',
  scorePercent: 80,
  weakTopics: [
    { name: 'الحلقات المتداخلة', questionNumbers: [3, 7] },
    { name: 'شرط الخروج', questionNumbers: [5] },
  ],
  strongTopics: ['المتغيرات'],
};

function input(overrides: Partial<ComposeInput> = {}): ComposeInput {
  return {
    firstName: 'محمد',
    facts: RESULT,
    recentVariantKeys: [],
    whatsappUrl: null,
    seed: 'seed-1',
    ...overrides,
  };
}

/** Runs `count` messages, feeding each result back in as history. */
function sequence(count: number, overrides: Partial<ComposeInput> = {}) {
  const history: string[] = [];
  const bodies: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const result = composeOutreach(
      input({ ...overrides, seed: `seed-${index}`, recentVariantKeys: [...history] }),
    );
    history.unshift(result.variantKey);
    bodies.push(result.body);
  }
  return { history, bodies };
}

describe('composeOutreach — variety', () => {
  it('never opens two consecutive messages the same way', () => {
    const { history } = sequence(30);
    for (let index = 0; index + 1 < history.length; index += 1) {
      expect(parseVariantKey(history[index]!).g).not.toBe(parseVariantKey(history[index + 1]!).g);
    }
  });

  it('walks the whole greeting pool before reusing any of it', () => {
    const { history } = sequence(OUTREACH_GREETINGS.length);
    const used = history.map((key) => parseVariantKey(key).g);
    expect(new Set(used).size).toBe(OUTREACH_GREETINGS.length);
  });

  it('produces distinct bodies across a long run', () => {
    const { bodies } = sequence(20);
    // Not `toBe(20)`: with a shared score band the pools do eventually come
    // round. What must not happen is a handful of messages repeating over and
    // over, which is what a broken picker looks like.
    expect(new Set(bodies).size).toBeGreaterThanOrEqual(15);
  });

  it('keeps the slots independent — a new greeting does not force a new closer', () => {
    /*
     * The regression this guards: seeding every slot from one counter makes the
     * pools move in lockstep, so `7 × 5 × 5` distinct messages collapse to 7.
     * Two runs that differ only in seed must disagree on SOME slot pair
     * differently — checked here as "the greeting index and the closer index
     * are not a fixed function of each other".
     */
    const pairs = new Set<string>();
    for (let index = 0; index < 40; index += 1) {
      const key = parseVariantKey(composeOutreach(input({ seed: `s${index}` })).variantKey);
      pairs.add(`${key.g}:${key['c.strong']}`);
    }
    expect(pairs.size).toBeGreaterThan(OUTREACH_GREETINGS.length);
  });

  it('is deterministic — the same input composes the same message', () => {
    const first = composeOutreach(input());
    const second = composeOutreach(input());
    expect(second).toEqual(first);
  });

  it('survives a history full of unparseable keys', () => {
    const result = composeOutreach(
      input({ recentVariantKeys: ['', 'garbage', 'g=', '=3', 'g=notanumber', 'g=999'] }),
    );
    expect(result.body).toContain('محمد');
  });
});

describe('composeOutreach — tone follows the score', () => {
  it.each([
    [95, 'excellent'],
    [90, 'excellent'],
    [89, 'strong'],
    [75, 'strong'],
    [74, 'fair'],
    [50, 'fair'],
    [49, 'weak'],
    [0, 'weak'],
  ] as const)('%i%% is the %s band', (score, band) => {
    expect(bandFor(score)).toBe(band);
  });

  it('never congratulates a failed paper', () => {
    const result = composeOutreach(
      input({ facts: { ...RESULT, scorePercent: 20 }, seed: 'weak' }),
    );
    const congratulations = QUIZ_CLOSERS.excellent.concat(QUIZ_SCORE_LINES.excellent);
    for (const line of congratulations) {
      expect(result.body).not.toContain(line.replace('{score}٪', ''));
    }
    // And it does say something from the band it belongs to.
    expect(QUIZ_CLOSERS.weak.some((line) => result.body.includes(line))).toBe(true);
  });

  it('records the band in the variant key, so the pools never cross', () => {
    const weak = parseVariantKey(
      composeOutreach(input({ facts: { ...RESULT, scorePercent: 10 } })).variantKey,
    );
    expect(Object.keys(weak)).toContain('c.weak');
    expect(Object.keys(weak)).not.toContain('c.excellent');
  });
});

describe('composeOutreach — content', () => {
  it('names the weak topics and their question numbers', () => {
    const body = composeOutreach(input()).body;
    expect(body).toContain('الحلقات المتداخلة');
    expect(body).toContain('3 و 7');
    expect(body).toContain('شرط الخروج');
  });

  it('caps the focus list at three topics', () => {
    const body = composeOutreach(
      input({
        facts: {
          ...RESULT,
          weakTopics: [1, 2, 3, 4, 5].map((n) => ({ name: `موضوع ${n}`, questionNumbers: [n] })),
        },
      }),
    ).body;
    expect(body).toContain('موضوع 3');
    expect(body).not.toContain('موضوع 4');
  });

  it('omits the focus block entirely on a clean paper', () => {
    const body = composeOutreach(
      input({ facts: { ...RESULT, scorePercent: 100, weakTopics: [], strongTopics: [] } }),
    ).body;
    expect(body).not.toContain('•');
  });

  it('writes ONE mistake as a sentence, not a heading over a bullet', () => {
    /*
     * Five paragraphs for a 93% paper with one slip is what «مش بتبقى مفهومة»
     * meant, and the student who got exactly that answered «يعني اي». One
     * topic is one line now; the list shape is kept for the case it helps.
     */
    const body = composeOutreach(
      input({ facts: { ...RESULT, weakTopics: [{ name: null, questionNumbers: [2] }] } }),
    ).body;
    expect(body).toContain('سؤال 2');
    expect(body).not.toContain('•');
    // …and the heading that used to sit above the bullet is gone with it.
    expect(body).not.toContain('دي الحتت اللي محتاجة مراجعة:');
  });

  it('keeps the bulleted list when there is genuinely more than one', () => {
    const body = composeOutreach(
      input({
        facts: {
          ...RESULT,
          weakTopics: [
            { name: 'الحلقات', questionNumbers: [2] },
            { name: 'الشروط', questionNumbers: [5] },
          ],
        },
      }),
    ).body;
    expect(body).toContain('•');
  });

  it('drops the lecture path a student cannot act on', () => {
    /*
     * `topic.name` arrives as «أساسيات البرمجة — المحاضرة الثانية», and the
     * opener one line above already names that lecture. Printing both put the
     * same words in the message twice and made the correction read like a
     * database row.
     */
    const body = composeOutreach(
      input({
        facts: {
          ...RESULT,
          weakTopics: [{ name: 'أساسيات البرمجة — المحاضرة الثانية', questionNumbers: [7] }],
        },
      }),
    ).body;
    expect(body).toContain('سؤال 7');
    expect(body).not.toContain('المحاضرة الثانية —');
  });

  it('joins several strengths with Arabic «و» and no comma before it', () => {
    // Strengths are only written when there is nothing to fix — beside a
    // correction they are a "but also" that blunts both halves.
    const body = composeOutreach(
      input({ facts: { ...RESULT, weakTopics: [], strongTopics: ['المتغيرات', 'الشروط'] } }),
    ).body;
    expect(body).toContain('المتغيرات والشروط');
  });

  it('does not praise topics in the same breath as correcting one', () => {
    const body = composeOutreach(
      input({
        facts: {
          ...RESULT,
          weakTopics: [{ name: null, questionNumbers: [2] }],
          strongTopics: ['المتغيرات'],
        },
      }),
    ).body;
    expect(body).not.toContain('المتغيرات');
  });

  it('uses the first name only', () => {
    expect(firstNameOf('محمد أحمد السيد')).toBe('محمد');
    expect(firstNameOf('  سارة  ')).toBe('سارة');
    expect(firstNameOf('')).toBe('');
  });

  it('stops a caps-lock name from shouting in the greeting', () => {
    /*
     * «MARAWAN، إزي حالك؟» — students type their names in caps lock all the
     * time, and the greeting is the one place the platform puts that name
     * inside a sentence meant to sound like a person saying hello.
     *
     * ALL-CAPS only. A name with a lowercase letter in it is spelt the way its
     * owner spells it, and "correcting" that is how the greeting starts
     * getting names wrong.
     */
    expect(firstNameOf('MARAWAN ELSAYED')).toBe('Marawan');
    expect(firstNameOf('ANNE-MARIE')).toBe('Anne-Marie');
    expect(firstNameOf("O'BRIEN")).toBe("O'Brien");
    expect(firstNameOf('McDonald')).toBe('McDonald');
    expect(firstNameOf('marwan')).toBe('marwan');
    // Arabic is caseless, so this can never fire on the names it is really about.
    expect(firstNameOf('مروان')).toBe('مروان');
  });

  it('tells the student the work is small, every single time', () => {
    /*
     * The whole reason the focus block exists. A list of topics someone just
     * got wrong, delivered on its own, is a list of reasons to feel stupid and
     * close the app — «دي الحتت اللي وقعت فيها» and then nothing. The line
     * under the bullets is what turns the same list into something worth
     * opening the lesson for.
     *
     * Asserted on the POOL rather than on a rendered message, so a sixth entry
     * added later cannot quietly be the one that just lists the damage. The
     * word list is deliberately loose: it is checking that reassurance was
     * attempted, not policing which words say it.
     */
    const REASSURING = ['سهل', 'سهلين', 'بسيط', 'مش صعب', 'تخوّف', 'أشرح', 'ربع ساعة'];
    for (const tail of FOCUS_TAILS) {
      expect(
        REASSURING.some((word) => tail.includes(word)),
        `focus tail promises no relief: ${tail}`,
      ).toBe(true);
    }
  });

  it('says the number is fixable in the two bands where it is bad news', () => {
    // Same rule, one sentence earlier. A student who reads a small number
    // stops reading right there, so the line that DELIVERS it has to be the
    // one that says it can be fixed.
    const REASSURING = ['ملوش لزوم', 'مفيش مشكلة', 'بسيط', 'أسهل', 'مش صعب', 'بيتظبط'];
    for (const band of ['fair', 'weak'] as const) {
      for (const line of QUIZ_SCORE_LINES[band]) {
        expect(
          REASSURING.some((word) => line.includes(word)),
          `${band} score line offers no way out: ${line}`,
        ).toBe(true);
      }
    }
  });

  it('calls him مهندس أيمن when it names him at all', () => {
    // «أيمن» on its own reads like a system that only has a database column.
    for (const greeting of OUTREACH_GREETINGS) {
      if (!greeting.includes('أيمن')) continue;
      expect(greeting).toContain('مهندس أيمن');
    }
  });

  it('always names the paper it is about, whichever opener is drawn', () => {
    /*
     * The regression this exists for: one opener in six named no paper, and
     * nothing else in the message does either — the score line is a bare
     * number and the bullets name TOPICS. A student who sat three papers that
     * week could not tell which one «شفت نتيجتك» meant.
     *
     * It passed locally for a week and only failed in CI, because which
     * opener is drawn depends on a seed built from ids that differ every run.
     * Asserted over MANY seeds here, deterministically, so the pool cannot
     * grow another one.
     */
    for (let index = 0; index < 60; index += 1) {
      const body = composeOutreach(input({ seed: `q${index}` })).body;
      expect(body).toContain(RESULT.quizTitle);
    }
  });

  it.each([
    ['quiz_nudge', { kind: 'quiz_nudge', lessonTitle: 'الدوال' } as OutreachFacts],
    ['lesson_praise', { kind: 'lesson_praise', lessonTitle: 'الدوال' } as OutreachFacts],
  ])('always names the lesson in a %s message', (_kind, facts) => {
    for (let index = 0; index < 60; index += 1) {
      expect(composeOutreach(input({ facts, seed: `l${index}` })).body).toContain('الدوال');
    }
  });

  it('leaves no unfilled placeholder in any message of any kind', () => {
    const facts: OutreachFacts[] = [
      RESULT,
      { kind: 'quiz_nudge', lessonTitle: 'الدوال' },
      { kind: 'lesson_praise', lessonTitle: 'المقدمة' },
      { kind: 'whatsapp_invite' },
    ];
    for (const kind of facts) {
      for (let index = 0; index < 25; index += 1) {
        const body = composeOutreach(
          input({ facts: kind, seed: `p${index}`, whatsappUrl: 'https://chat.whatsapp.com/x' }),
        ).body;
        expect(body).not.toMatch(/\{[a-z]+\}/iu);
      }
    }
  });

  it('fits the column a conversation message is stored in', () => {
    const body = composeOutreach(
      input({
        facts: {
          ...RESULT,
          quizTitle: 'ع'.repeat(200),
          weakTopics: [1, 2, 3].map((n) => ({ name: 'ط'.repeat(80), questionNumbers: [n] })),
          strongTopics: ['ن'.repeat(80), 'م'.repeat(80)],
        },
        whatsappUrl: `https://chat.whatsapp.com/${'a'.repeat(60)}`,
      }),
    ).body;
    expect(body.length).toBeLessThanOrEqual(MESSAGE_MAX);
  });
});

describe('the voice — one message, written for either reader', () => {
  /**
   * The platform never asks whether a student is a boy or a girl, and it sends
   * these messages to all of them. Every inflected line — «عامل إيه»، «إنت
   * فاهم»، «متقلقش»، «راجع الحاجات دي» — was therefore addressing the male
   * half and telling the other half, in the first sentence, that the message
   * was not written for her.
   *
   * The rule and the four devices that satisfy it are set out at the top of
   * `copy/outreach.ts`. This is the tripwire under it: a list of forms that
   * can ONLY be said to a male reader, matched token by token over every pool.
   *
   * What it is not: a proof. It catches whole words, so a prefixed «وراجع»
   * walks past it, and it says nothing about a sentence that is masculine in
   * some way nobody has written yet. It is here because every entry below is a
   * form that actually shipped in this file, and a sixth pool entry added in a
   * hurry is exactly how one comes back.
   */
  const MASCULINE_ONLY = [
    // Imperatives. The feminine grows a ي — «راجعي»، «اسأليني»، «خدي».
    'راجع',
    'ارجع',
    'اسألني',
    'ابعتلي',
    'ابعته',
    'قولّي',
    'صدّقني',
    'خليك',
    'خد',
    'روح',
    'دوس',
    'كمّل',
    'اشترك',
    'افتكر',
    'اتفرّج',
    'حلّه',
    'شوف',
    'ركّز',
    // Negative imperatives, the same rule with a circumfix on it.
    'متخافش',
    'متقلقش',
    'متضايقش',
    'متزعلش',
    'متقفش',
    'متنساش',
    // Participles and adjectives said ABOUT the reader. The ones he says about
    // HIMSELF — «شايف»، «عارف»، «مبسوط»، «متابعك» — are his to inflect and are
    // deliberately absent from this list.
    'مشترك',
    'مشتركتش',
    'فاهم',
    'ماشي',
    'حابب',
    'فاكر',
    'متخيّل',
    'عامل',
    // Second-person present. The feminine is «بتذاكري»، «تقدري»، «تستاهليه».
    'بتذاكر',
    'تقدر',
    'تستاهله',
    // Second-person past. «جبتي»، «ذاكرتي» in the feminine.
    'جبت',
    'ذاكرت',
    'غلطت',
    'اتفرّجت',
    'مشيت',
    'كمّلت',
    // Pronouns that grow a ي too: «معاكي»، «وراكي»، «بيكي». The suffix ـك on a
    // NOUN («نتيجتك»، «ورقتك»، «عندك») is one spelling for both and is what
    // the pools use instead.
    'معاك',
    'وراك',
    'بيك',
    'ليك',
    'فيك',
  ];

  const EVERY_LINE: readonly string[] = [
    ...OUTREACH_GREETINGS,
    ...QUIZ_RESULT_OPENERS,
    ...Object.values(QUIZ_SCORE_LINES).flat(),
    ...FOCUS_INTROS,
    ...FOCUS_TAILS,
    ...STRENGTH_LINES,
    ...Object.values(QUIZ_CLOSERS).flat(),
    ...NUDGE_OPENERS,
    ...NUDGE_BODIES,
    ...NUDGE_CLOSERS,
    ...PRAISE_OPENERS,
    ...PRAISE_BODIES,
    ...PRAISE_CLOSERS,
    ...WHATSAPP_OPENERS,
    ...WHATSAPP_BODIES,
    ...WHATSAPP_CLOSERS,
    ...WHATSAPP_TAGALONGS,
  ];

  it('never addresses the student as a boy', () => {
    const banned = new Set(MASCULINE_ONLY);
    for (const line of EVERY_LINE) {
      for (const token of line.split(/[\s،.:؟!—«»…()٪]+/u)) {
        expect(banned.has(token), `«${token}» only works on a male reader: ${line}`).toBe(false);
      }
    }
  });

  it('never addresses her as a boy in a whole composed message either', () => {
    /*
     * The same tripwire over the OUTPUT rather than the pools — which is what
     * makes it survive a pool being added to `copy/outreach.ts` and not to
     * `EVERY_LINE` above. Every kind, many seeds, because which entry is drawn
     * depends on a hash of ids that differ every run.
     */
    const banned = new Set(MASCULINE_ONLY);
    const kinds: OutreachFacts[] = [
      RESULT,
      { kind: 'quiz_nudge', lessonTitle: 'الدوال' },
      { kind: 'lesson_praise', lessonTitle: 'الدوال' },
      { kind: 'whatsapp_invite' },
    ];

    for (const facts of kinds) {
      for (let index = 0; index < 40; index += 1) {
        const body = composeOutreach(
          input({
            facts,
            firstName: 'سارة',
            seed: `v${index}`,
            whatsappUrl: 'https://chat.whatsapp.com/x',
          }),
        ).body;
        for (const token of body.split(/[\s،.:؟!—«»…()٪]+/u)) {
          expect(banned.has(token), `«${token}» only works on a male reader: ${body}`).toBe(false);
        }
      }
    }
  });
});

describe('composeOutreach — the WhatsApp group', () => {
  it('says nothing about a group when no link is configured', () => {
    for (let index = 0; index < 20; index += 1) {
      const body = composeOutreach(input({ seed: `n${index}` })).body;
      expect(WHATSAPP_TAGALONGS.some((line) => body.includes(line))).toBe(false);
    }
  });

  it('invites some of the time, and never twice in a row', () => {
    const { history, bodies } = sequence(30, { whatsappUrl: 'https://chat.whatsapp.com/x' });
    const invited = bodies.map((body) => WHATSAPP_TAGALONGS.some((line) => body.includes(line)));

    expect(invited.filter(Boolean).length).toBeGreaterThan(0);
    expect(invited.filter(Boolean).length).toBeLessThan(bodies.length);

    // `history` is newest-first, so walk it as such.
    const carried = history.map((key) => 'w' in parseVariantKey(key));
    for (let index = 0; index + 1 < carried.length; index += 1) {
      expect(carried[index] && carried[index + 1]).toBe(false);
    }
  });

  it('puts the link in the standalone invitation, and never doubles the ask', () => {
    const url = 'https://chat.whatsapp.com/abc';
    const body = composeOutreach(
      input({ facts: { kind: 'whatsapp_invite' }, whatsappUrl: url }),
    ).body;
    expect(body).toContain(url);
    expect(WHATSAPP_TAGALONGS.some((line) => body.includes(line))).toBe(false);
  });
});

describe('the kind catalogue', () => {
  it('covers every branch the composer can take', () => {
    // A `kind` added to the union without an entry here is a failing test
    // rather than an insert that violates the Prisma enum in production.
    const composed: OutreachFacts['kind'][] = [
      'quiz_result',
      'quiz_nudge',
      'lesson_praise',
      'whatsapp_invite',
    ];
    expect([...OUTREACH_KINDS].sort()).toEqual([...composed].sort());
  });
});
