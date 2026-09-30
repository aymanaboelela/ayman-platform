import { describe, expect, it } from 'vitest';
import {
  ARENA_RULES,
  ArenaFrameSchema,
  ArenaLobbySchema,
  ArenaQuestionSchema,
  arenaAwardedPoints,
  arenaBasePoints,
  competitionRanks,
} from './arena';
import { arenaCopy } from './copy/arena';

/** كل سترنج في الكوبي، بالترتيب — عشان الفخ تحت يعدّي على كله. */
function strings(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (node && typeof node === 'object') return Object.values(node).flatMap(strings);
  return [];
}

describe('arenaCopy — one string, written for either reader', () => {
  /*
   * نفس الفخ اللي في `outreach/compose.spec.ts` و`homework.spec.ts`، على
   * الساحة: كلام بيتقال لولد بس. هنا مرتين، لأن الجملة بتتكلم عن المنافس
   * كمان («جاوب غلط»، «فصل»، «عنده»).
   */
  const MASCULINE_ONLY = new Set([
    // أوامر.
    'ابدأ',
    'جاوب',
    'اختار',
    'استنى',
    'ارجع',
    'راجع',
    'خد',
    'كمّل',
    'العب',
    'دوس',
    'شوف',
    'ركّز',
    'متخافش',
    'متقلقش',
    'متزعلش',
    // صفات وأفعال عن اللي بيقرا أو عن المنافس.
    'فاهم',
    'شاطر',
    'جاهز',
    'بيفكّر',
    'بيفكر',
    'جاوبت',
    'غلطت',
    'كسبت',
    'خسرت',
    'فصل',
    'رجع',
    'سبق',
    'ياخد',
    'ياخدها',
    'بيختار',
    'مستني',
    // ضماير بتكبر بـي في المؤنث.
    'عنده',
    'معاك',
    'وراك',
    'بيك',
    'ليك',
    'فيك',
    'عليك',
    'إنت',
    'انت',
  ]);

  it('never addresses the reader — or describes the opponent — as a boy', () => {
    for (const line of strings(arenaCopy)) {
      for (const token of line.split(/[\s،.:؟!—«»…()٪{}·+]+/u)) {
        expect(MASCULINE_ONLY.has(token), `«${token}» only works for a boy: ${line}`).toBe(false);
      }
    }
  });

  it('asks nothing of the student with an imperative on the start button', () => {
    expect(arenaCopy.lobby.start).toBe('يلا نبدأ');
  });
});

describe('arena points', () => {
  it('pays a win, a draw and nothing else', () => {
    expect(arenaBasePoints('win')).toBe(ARENA_RULES.points.win);
    expect(arenaBasePoints('draw')).toBe(ARENA_RULES.points.draw);
    expect(arenaBasePoints('loss')).toBe(0);
    expect(arenaBasePoints('none')).toBe(0);
  });

  it('cuts at the daily cap and says so', () => {
    const cap = ARENA_RULES.dailyPointsCap;
    expect(arenaAwardedPoints({ base: 3, todayPoints: 0, pairScoredToday: 0 })).toEqual({ points: 3, capped: false });
    expect(arenaAwardedPoints({ base: 3, todayPoints: cap - 1, pairScoredToday: 0 })).toEqual({ points: 1, capped: true });
    expect(arenaAwardedPoints({ base: 3, todayPoints: cap, pairScoredToday: 0 })).toEqual({ points: 0, capped: true });
  });

  it('stops paying the same pair after the daily limit', () => {
    const limit = ARENA_RULES.pairScoredPerDay;
    expect(arenaAwardedPoints({ base: 3, todayPoints: 0, pairScoredToday: limit - 1 }).points).toBe(3);
    expect(arenaAwardedPoints({ base: 3, todayPoints: 0, pairScoredToday: limit })).toEqual({ points: 0, capped: true });
  });

  it('never reports a cap on a match that earned nothing to cut', () => {
    expect(arenaAwardedPoints({ base: 0, todayPoints: 999, pairScoredToday: 99 })).toEqual({ points: 0, capped: false });
  });
});

describe('competitionRanks', () => {
  it('shares a rank on a tie and skips after it', () => {
    expect(competitionRanks([30, 21, 21, 9, 9, 9, 3])).toEqual([1, 2, 2, 4, 4, 4, 7]);
    expect(competitionRanks([])).toEqual([]);
  });
});

describe('the wire shapes', () => {
  it('parses a mid-match frame', () => {
    const frame = ArenaFrameSchema.parse({
      type: 'view',
      at: 1_000,
      fx: 'opponent_wrong',
      view: {
        phase: 'match',
        match: {
          id: 'm',
          seq: 5,
          courseTitle: 'برمجة',
          cohortLabel: 'تانية',
          total: 7,
          index: 2,
          stage: 'question',
          you: { player: { name: 'مريم', image: null }, score: 1, status: 'thinking' },
          opponent: { player: { name: 'ملك', image: '/x.webp' }, score: 1, status: 'locked' },
          question: {
            index: 2,
            id: 'q',
            type: 'mcq_single',
            stemHtml: '<p>؟</p>',
            options: [
              { id: 'a', bodyHtml: 'أ' },
              { id: 'b', bodyHtml: 'ب' },
            ],
          },
          deadline: 16_000,
          questionMs: ARENA_RULES.questionMs,
          paused: null,
          yourPick: null,
          reveal: null,
          history: ['you', 'opponent'],
          end: null,
        },
      },
    });
    expect(frame.type).toBe('view');
  });

  it('has no room for the right answer inside a live question', () => {
    // الشكل نفسه مالوش مكان للصح في السؤال: `options` فيها id ونص بس،
    // والصح في `reveal` لوحده. حقل زيادة بيتشال وقت القراية.
    const question = ArenaQuestionSchema.parse({
      index: 0,
      id: 'q',
      type: 'true_false',
      stemHtml: 's',
      options: [
        { id: 'a', bodyHtml: 'صح', fraction: 1 },
        { id: 'b', bodyHtml: 'غلط', fraction: 0 },
      ],
      correctOptionIds: ['a'],
    });
    expect(JSON.stringify(question)).not.toMatch(/fraction|correct/u);
  });

  it('parses an empty lobby', () => {
    const lobby = ArenaLobbySchema.parse({
      cohort: null,
      blocked: 'no_year',
      courses: [],
      me: { name: 'مريم', image: null, points: 0, wins: 0, draws: 0, losses: 0, played: 0, rank: null, todayPoints: 0 },
      view: { phase: 'idle' },
      board: { cohortLabel: '', rows: [], me: null },
      at: 1,
    });
    expect(lobby.blocked).toBe('no_year');
  });
});
