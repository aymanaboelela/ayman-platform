import {
  ARENA_RULES,
  type ArenaEnd,
  type ArenaMatchView,
  type ArenaPoint,
  type ArenaReveal,
  type ArenaSideState,
} from '@ayman/contracts/arena';

/**
 * «ساحة التحدي» — الحَكَم. كل قاعدة في الماتش هنا، كفانكشنز بيور: بتاخد
 * الحالة والوقت وبترجّع الحالة الجديدة واللي حصل. مفيش Redis ولا ساعة ولا
 * Nest — `ArenaService` هو اللي بيحمّل ويقفل ويحفظ ويبعت، والملف ده بيقرر.
 *
 * ## القواعد، بالظبط زي ما اتطلبت
 *
 * 1. أول إجابة **صح** بتوصل السيرفر بتاخد النقطة، والسؤال بيتقفل للاتنين.
 * 2. الإجابة **الغلط** بتقفل السؤال على صاحبها بس. التاني بيكمّل على راحته
 *    لحد ما الوقت يخلص، ولو جاوب صح ياخد النقطة.
 * 3. الاتنين غلط، أو الوقت خلص = محدش بياخد حاجة.
 * 4. الوقت وقت السيرفر: `now` بيتمرّر من برّه، وهو لحظة ما الطلب وصل الـAPI
 *    (`receivedAt` في الكنترولر)، مش أي ساعة جاية من المتصفح.
 *
 * ## الحالات الحدّية، مكتوبة
 *
 * · **إجابتين صح في نفس اللحظة:** الماتش بيتقفل بقفل واحد في Redis، فالإجابات
 *   بتتحكم بالترتيب اللي وصلت بيه للقفل — ودي بالترتيب اللي وصلت بيه للسيرفر،
 *   لأن الطلبين بيبعتوا `SET NX` على نفس الكونكشن بالترتيب. التانية بترجع
 *   `late` والنقطة للأولى.
 * · **إجابة بعد الوقت:** `answer` بيطبّق أي انتقال فات ميعاده الأول
 *   (`advance`)، فإجابة وصلت بعد `deadline` بتلاقي السؤال اتقفل بالوقت، حتى لو
 *   السويبر لسه ماعدّاش — `late`.
 * · **إجابة على سؤال قديم / مرتين / والماتش واقف / من حد مش في الماتش:**
 *   بتتجاهل. التالتة عشان مفيش حد يجاوب والتاني النت عنده قاطع.
 * · **اختيار مش من اختيارات السؤال:** بيتجاهل، ومابيقفلش السؤال على صاحبه.
 * · **النت قطع:** الماتش كله بيقف (الساعة كمان)، وبيتحسب للّي فصل مهلة
 *   `graceMs`. رجع فيها = الماتش بيكمّل من نفس السؤال، وعلى الأقل
 *   `resumeMinMs` في الساعة. مارجعش = التاني كسب «بالانسحاب».
 * · **الاتنين فصلوا:** لو مهلة الاتنين خلصت = الماتش اتقطع من غير كسبان ولا
 *   نقط. لو مهلة واحد خلصت والتاني لسه في مهلته ورجع = اللي رجع كسب.
 * · **انسحاب بإيده:** زي اللي فصل ومارجعش، بس على طول.
 * · **ريستارت للسيرفر:** `abort` — مفيش كسبان ولا نقط، والاتنين بيتقالهم
 *   «الماتش اتقطع».
 * · **تعادل في النتيجة** بعد آخر سؤال = تعادل، وليه نقطه.
 */

export type Side = 0 | 1;

export interface EnginePlayer {
  userId: string;
  name: string;
  image: string | null;
  score: number;
  online: boolean;
  /** آخر مرة النت قطع — `null` وهو متصل. */
  offlineAt: number | null;
  /** لحد إمتى بنستناه — `null` وهو متصل. */
  graceUntil: number | null;
}

export interface EngineQuestion {
  id: string;
  type: 'mcq_single' | 'true_false';
  stemHtml: string;
  options: Array<{ id: string; bodyHtml: string }>;
  /** ⚠️ السيرفر بس — عمره ما بيدخل `viewFor` قبل ما السؤال يتقفل. */
  correct: string[];
}

export interface EngineAnswer {
  optionId: string;
  right: boolean;
  /** من فتح السؤال لحد ما الإجابة وصلت، من غير الوقت اللي الماتش كان واقف فيه. */
  ms: number;
}

export type RoundReason = 'correct' | 'both_wrong' | 'timeout';

export interface EngineRound {
  openedAt: number;
  /** وقت الوقفات (نت قطع) جوّه السؤال ده — بيتطرح من `ms`. */
  pausedMs: number;
  answers: [EngineAnswer | null, EngineAnswer | null];
  winner: Side | null;
  reason: RoundReason | null;
  closedAt: number | null;
}

export type EndReason = ArenaEnd['reason'];

export interface EngineEnd {
  winner: Side | null;
  reason: EndReason;
  at: number;
}

/** النقط بعد ما اتكتبت في Postgres — بتتحط هنا عشان شاشة النتيجة. */
export interface EngineAward {
  points: number;
  capped: boolean;
  total: number | null;
}

export interface MatchState {
  v: 1;
  id: string;
  /** البوت اللي عمل الماتش — بوت تاني بيلاقيه = ريستارت، فبيتقفل. */
  bootId: string;
  seq: number;
  courseId: string;
  courseTitle: string;
  cohortLabel: string;
  startedAt: number;
  players: [EnginePlayer, EnginePlayer];
  questions: EngineQuestion[];
  index: number;
  stage: 'vs' | 'question' | 'reveal' | 'ended';
  /** نهاية المرحلة — `null` وهو واقف أو خلص. */
  stageEndsAt: number | null;
  /** الوقت اللي كان فاضل لما وقف. */
  pausedRemainingMs: number | null;
  pausedAt: number | null;
  rounds: EngineRound[];
  end: EngineEnd | null;
  awards: [EngineAward, EngineAward] | null;
}

/**
 * اللي حصل في الخطوة دي — `ArenaService` بيحوّله لـfx لكل لاعب (نفس الحدث
 * «صح» بيبقى `you_right` عند واحد و`opponent_right` عند التاني).
 */
export type EngineEvent =
  | { kind: 'question' }
  | { kind: 'right'; side: Side }
  | { kind: 'wrong'; side: Side }
  | { kind: 'both_wrong' }
  | { kind: 'timeout' }
  | { kind: 'offline'; side: Side }
  | { kind: 'online'; side: Side }
  | { kind: 'end' };

export type AnswerResult = 'right' | 'wrong' | 'late' | 'ignored';

export interface CreateMatchInput {
  id: string;
  bootId: string;
  courseId: string;
  courseTitle: string;
  cohortLabel: string;
  players: [Pick<EnginePlayer, 'userId' | 'name' | 'image'>, Pick<EnginePlayer, 'userId' | 'name' | 'image'>];
  questions: EngineQuestion[];
  now: number;
}

const other = (side: Side): Side => (side === 0 ? 1 : 0);

export function createMatch(input: CreateMatchInput): MatchState {
  if (input.players[0].userId === input.players[1].userId) {
    throw new Error('a student cannot be matched with themselves');
  }
  if (input.questions.length === 0) throw new Error('a match needs at least one question');
  const player = (p: CreateMatchInput['players'][number]): EnginePlayer => ({
    ...p,
    score: 0,
    online: true,
    offlineAt: null,
    graceUntil: null,
  });
  return {
    v: 1,
    id: input.id,
    bootId: input.bootId,
    seq: 0,
    courseId: input.courseId,
    courseTitle: input.courseTitle,
    cohortLabel: input.cohortLabel,
    startedAt: input.now,
    players: [player(input.players[0]), player(input.players[1])],
    questions: input.questions,
    index: 0,
    stage: 'vs',
    stageEndsAt: input.now + ARENA_RULES.vsMs,
    pausedRemainingMs: null,
    pausedAt: null,
    rounds: [],
    end: null,
    awards: null,
  };
}

export function sideOf(state: MatchState, userId: string): Side | null {
  if (state.players[0].userId === userId) return 0;
  if (state.players[1].userId === userId) return 1;
  return null;
}

export function isPaused(state: MatchState): boolean {
  return state.end === null && state.players.some((p) => !p.online);
}

/**
 * كل انتقال فات ميعاده لحد `now`: الـVS → أول سؤال، السؤال → الوقت خلص،
 * الكشف → اللي بعده أو النهاية، ومهلة النت اللي خلصت → انسحاب. بيلف لحد ما
 * مايبقاش فيه حاجة متأخرة، فسويبر اتأخر ثانيتين مابيبوّظش الترتيب.
 */
export function advance(state: MatchState, now: number): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (let guard = 0; guard < 64 && state.end === null; guard++) {
    if (isPaused(state)) {
      const ended = settleGrace(state, now);
      if (ended) events.push({ kind: 'end' });
      break;
    }
    if (state.stageEndsAt === null || state.stageEndsAt > now) break;

    if (state.stage === 'vs') {
      openQuestion(state, 0, now);
      events.push({ kind: 'question' });
    } else if (state.stage === 'question') {
      closeRound(state, null, 'timeout', now);
      events.push({ kind: 'timeout' });
    } else if (state.stage === 'reveal') {
      if (state.index + 1 < state.questions.length) {
        openQuestion(state, state.index + 1, now);
        events.push({ kind: 'question' });
      } else {
        finish(state, completedWinner(state), 'completed', now);
        events.push({ kind: 'end' });
      }
    }
  }
  if (events.length > 0) state.seq += 1;
  return events;
}

/** إجابة لاعب. `now` = لحظة ما الطلب وصل السيرفر. */
export function answer(
  state: MatchState,
  side: Side,
  index: number,
  optionId: string,
  now: number,
): { result: AnswerResult; events: EngineEvent[] } {
  // الأول أي انتقال فات ميعاده — عشان إجابة بعد الوقت تتحكم «متأخرة» حتى
  // لو السويبر لسه ماعدّاش.
  const events = advance(state, now);
  if (state.end !== null) return { result: 'late', events };
  if (index < state.index) return { result: 'late', events };
  if (index !== state.index) return { result: 'ignored', events };
  if (state.stage === 'reveal') return { result: 'late', events };
  if (state.stage !== 'question' || isPaused(state)) return { result: 'ignored', events };

  const round = state.rounds[state.index];
  const question = state.questions[state.index];
  if (!round || !question) return { result: 'ignored', events };
  if (round.answers[side] !== null) return { result: 'ignored', events };
  if (!question.options.some((option) => option.id === optionId)) return { result: 'ignored', events };

  const right = question.correct.includes(optionId);
  round.answers[side] = { optionId, right, ms: Math.max(0, now - round.openedAt - round.pausedMs) };
  state.seq += 1;

  if (right) {
    state.players[side].score += 1;
    closeRound(state, side, 'correct', now);
    return { result: 'right', events: [...events, { kind: 'right', side }] };
  }

  events.push({ kind: 'wrong', side });
  // التاني جاوب قبل كده؟ يبقى جاوب غلط (الصح كان قفل السؤال) — الاتنين غلط.
  if (round.answers[other(side)] !== null) {
    closeRound(state, null, 'both_wrong', now);
    events.push({ kind: 'both_wrong' });
  }
  return { result: 'wrong', events };
}

/** النت قطع عند لاعب — الماتش كله بيقف، والمهلة بتبدأ. */
export function disconnect(state: MatchState, side: Side, now: number): EngineEvent[] {
  const player = state.players[side];
  if (state.end !== null || !player.online) return [];
  const wasPaused = isPaused(state);
  player.online = false;
  player.offlineAt = now;
  player.graceUntil = now + ARENA_RULES.graceMs;
  if (!wasPaused) {
    state.pausedRemainingMs = state.stageEndsAt === null ? null : Math.max(0, state.stageEndsAt - now);
    state.pausedAt = now;
    state.stageEndsAt = null;
  }
  state.seq += 1;
  return [{ kind: 'offline', side }];
}

/**
 * رجع. لو الاتنين بقوا متصلين، الماتش بيكمّل من مكانه — والسؤال على الأقل
 * `resumeMinMs`، عشان اللي رجع يلحق يقرا.
 */
export function reconnect(state: MatchState, side: Side, now: number): EngineEvent[] {
  const player = state.players[side];
  if (state.end !== null || player.online) return [];
  player.online = true;
  player.offlineAt = null;
  player.graceUntil = null;
  const events: EngineEvent[] = [{ kind: 'online', side }];

  if (!isPaused(state)) {
    const remaining = state.pausedRemainingMs ?? 0;
    const floor = state.stage === 'question' ? ARENA_RULES.resumeMinMs : 0;
    state.stageEndsAt = now + Math.max(remaining, floor);
    const round = state.rounds[state.index];
    if (state.stage === 'question' && round && state.pausedAt !== null) {
      round.pausedMs += Math.max(0, now - state.pausedAt);
    }
    state.pausedRemainingMs = null;
    state.pausedAt = null;
  }
  state.seq += 1;
  // التاني كانت مهلته خلصت وهو (اللي رجع) لسه في مهلته؟ يبقى كسب بالانسحاب.
  events.push(...advance(state, now));
  return events;
}

/** انسحاب بإيده — الماتش للتاني على طول. */
export function leave(state: MatchState, side: Side, now: number): EngineEvent[] {
  if (state.end !== null) return [];
  finish(state, other(side), 'forfeit', now);
  state.seq += 1;
  return [{ kind: 'end' }];
}

/** ريستارت للسيرفر، أو ماتش مابقاش ينفع يكمّل — مفيش كسبان ولا نقط. */
export function abort(state: MatchState, now: number): EngineEvent[] {
  if (state.end !== null) return [];
  finish(state, null, 'aborted', now);
  state.seq += 1;
  return [{ kind: 'end' }];
}

/**
 * إمتى الماتش محتاج السويبر تاني: نهاية المرحلة، أو نهاية أقرب مهلة. وهو
 * شغّال، مش أبعد من ثانية — عشان النبض (مين متصل) يتقري كل ثانية.
 */
export function nextDueAt(state: MatchState, now: number): number | null {
  if (state.end !== null) return null;
  const candidates = [now + 1_000];
  if (state.stageEndsAt !== null) candidates.push(state.stageEndsAt);
  for (const player of state.players) if (player.graceUntil !== null) candidates.push(player.graceUntil);
  return Math.min(...candidates);
}

/** نتيجة الماتش لكل ناحية. */
export function outcomeFor(state: MatchState, side: Side): ArenaEnd['outcome'] {
  const end = state.end;
  if (!end) return 'none';
  if (end.reason === 'abandoned' || end.reason === 'aborted') return 'none';
  if (end.winner === null) return 'draw';
  return end.winner === side ? 'win' : 'loss';
}

/** الماتش زي ما اللاعب ده شايفه. ⚠️ الصح مابيظهرش غير في `reveal`. */
export function viewFor(state: MatchState, side: Side): ArenaMatchView {
  const me = state.players[side];
  const them = state.players[other(side)];
  const round = state.rounds[state.index] ?? null;
  const live = state.stage === 'question' && state.end === null;
  const question = state.stage === 'question' || state.stage === 'reveal' ? state.questions[state.index] : undefined;

  const sideState = (s: Side): ArenaSideState => {
    if (!state.players[s].online && state.end === null) return 'offline';
    const mine = live ? round?.answers[s] : null;
    return mine && !mine.right ? 'locked' : 'thinking';
  };

  const perspective = (winner: Side | null): ArenaPoint => (winner === null ? 'none' : winner === side ? 'you' : 'opponent');

  const last = [...state.rounds].reverse().find((r) => r.reason !== null) ?? null;
  const lastIndex = last ? state.rounds.indexOf(last) : -1;
  const showReveal = state.stage === 'reveal' || (state.stage === 'ended' && lastIndex === state.index);
  const reveal: ArenaReveal | null =
    showReveal && last && last.reason !== null
      ? {
          index: lastIndex,
          correctOptionIds: [...(state.questions[lastIndex]?.correct ?? [])],
          yourOptionId: last.answers[side]?.optionId ?? null,
          opponentOptionId: last.answers[other(side)]?.optionId ?? null,
          winner: perspective(last.winner),
          reason: last.reason,
        }
      : null;

  let paused: ArenaMatchView['paused'] = null;
  if (isPaused(state)) {
    const offline = state.players.filter((p) => !p.online);
    const who = offline.length === 2 ? 'both' : me.online ? 'opponent' : 'you';
    const graceUntil = Math.min(...offline.map((p) => p.graceUntil ?? state.stageEndsAt ?? 0));
    paused = { who, graceUntil };
  }

  const pick = live ? round?.answers[side] : null;
  const award = state.awards?.[side] ?? null;

  return {
    id: state.id,
    seq: state.seq,
    courseTitle: state.courseTitle,
    cohortLabel: state.cohortLabel,
    total: state.questions.length,
    index: state.index,
    stage: state.stage,
    you: { player: { name: me.name, image: me.image }, score: me.score, state: sideState(side) },
    opponent: { player: { name: them.name, image: them.image }, score: them.score, state: sideState(other(side)) },
    question: question
      ? {
          index: state.index,
          id: question.id,
          type: question.type,
          stemHtml: question.stemHtml,
          // ⚠️ `correct` عمره ما بيعدّي من هنا — id ونص بس.
          options: question.options.map((option) => ({ id: option.id, bodyHtml: option.bodyHtml })),
        }
      : null,
    deadline: state.end === null ? state.stageEndsAt : null,
    questionMs: ARENA_RULES.questionMs,
    paused,
    yourPick: pick && !pick.right ? pick.optionId : null,
    reveal,
    history: state.rounds.filter((r) => r.reason !== null).map((r) => perspective(r.winner)),
    end: state.end
      ? {
          outcome: outcomeFor(state, side),
          reason: state.end.reason,
          pointsEarned: award?.points ?? 0,
          capped: award?.capped ?? false,
          totalPoints: award?.total ?? null,
        }
      : null,
  };
}

// ── جوّه ──────────────────────────────────────────────────────────────────

function openQuestion(state: MatchState, index: number, now: number): void {
  state.index = index;
  state.stage = 'question';
  state.stageEndsAt = now + ARENA_RULES.questionMs;
  state.rounds[index] = {
    openedAt: now,
    pausedMs: 0,
    answers: [null, null],
    winner: null,
    reason: null,
    closedAt: null,
  };
}

function closeRound(state: MatchState, winner: Side | null, reason: RoundReason, now: number): void {
  const round = state.rounds[state.index];
  if (round) {
    round.winner = winner;
    round.reason = reason;
    round.closedAt = now;
  }
  state.stage = 'reveal';
  state.stageEndsAt = now + ARENA_RULES.revealMs;
}

function completedWinner(state: MatchState): Side | null {
  const [a, b] = state.players;
  if (a.score === b.score) return null;
  return a.score > b.score ? 0 : 1;
}

function finish(state: MatchState, winner: Side | null, reason: EndReason, now: number): void {
  state.end = { winner, reason, at: now };
  state.stage = 'ended';
  state.stageEndsAt = null;
  state.pausedRemainingMs = null;
  state.pausedAt = null;
}

/** المهلة خلصت؟ — انسحاب، أو اتقطع لو الاتنين. بيرجّع `true` لو الماتش خلص. */
function settleGrace(state: MatchState, now: number): boolean {
  const expired = ([0, 1] as const).filter((s) => {
    const p = state.players[s];
    return !p.online && p.graceUntil !== null && p.graceUntil <= now;
  });
  if (expired.length === 0) return false;
  if (expired.length === 2) {
    finish(state, null, 'abandoned', now);
    return true;
  }
  const gone = expired[0]!;
  const stayed = other(gone);
  // اللي فضل لازم يكون متصل عشان ياخد الماتش. لو هو كمان فاصل ولسه في
  // مهلته، نستنى: يرجع = يكسب، مايرجعش = اتقطع.
  if (!state.players[stayed].online) return false;
  finish(state, stayed, 'forfeit', now);
  return true;
}
