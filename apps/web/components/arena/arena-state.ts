import type { ArenaFx, ArenaMatchView, ArenaView } from '@ayman/contracts/arena';
import { intentOfQueue } from '@ayman/contracts/arena-challenges';

/**
 * «ساحة التحدي» — حالة الصفحة كفانكشنز بيور (`arena-state.test.ts`).
 *
 * الشاشة كلها بتترسم من `view` اللي السيرفر بعته — مفيش قرار هنا عن مين كسب
 * أو الوقت خلص. اللي هنا: أنهي نسخة من الحالة أحدث (رد الـPOST وفريم الـSSE
 * بيوصلوا بأي ترتيب)، فرق الساعة بين المتصفح والسيرفر، والحاجات اللي بتاعة
 * الشاشة بس (الاختيار اللي لسه رايح، الطالب عايز يفضل في الطابور).
 */

export type Connection = 'off' | 'connecting' | 'open' | 'lost';

export interface ArenaState {
  view: ArenaView;
  /** ساعة السيرفر − ساعة المتصفح (مللي). */
  offset: number;
  connection: Connection;
  /**
   * الطالب داس «يلا نبدأ» ولسه عايز يلعب — بيرجع للطابور لوحده بعد ريستارت.
   * نص `ArenaIntent` (`arena-challenges.ts`): كورس، تحدّي، تحدّي جديد، أو
   * تحدّي طالب مفتوح.
   */
  want: string | null;
  /** آخر حاجة حصلت، للصوت والأنيميشن. `key` بيتغيّر مع كل فريم عشان نفس الـfx مرتين يتلعب مرتين. */
  fx: { fx: ArenaFx; key: number } | null;
  /** الاختيار اللي اتبعت ولسه مارجعش. */
  pending: string | null;
  /** «السؤال كان اتقفل خلاص» — رد الإجابة نفسه، مش حالة الماتش. */
  late: boolean;
  /** «مفيش حد متاح» اتقفلت لحد إمتى (ساعة المتصفح). */
  patienceFrom: number | null;
  error: string | null;
}

export type ArenaAction =
  | { type: 'frame'; view: ArenaView; fx: ArenaFx; at: number; now: number }
  | { type: 'clock'; at: number; now: number }
  | { type: 'beat'; at: number; now: number; phase: 'idle' | 'queued' | 'match' }
  | { type: 'connection'; connection: Connection }
  | { type: 'start'; intent: string; now: number }
  | { type: 'queued'; view: ArenaView; now: number }
  | { type: 'cancel' }
  | { type: 'answer-sent'; optionId: string }
  | { type: 'answer-result'; result: 'right' | 'wrong' | 'late' | 'ignored'; view: ArenaView }
  | { type: 'answer-failed' }
  | { type: 'keep-waiting'; now: number }
  | { type: 'reset' }
  | { type: 'error'; message: string };

export function initialState(view: ArenaView, at: number, now: number): ArenaState {
  return {
    view,
    offset: at - now,
    connection: 'off',
    want: view.phase === 'queued' ? intentOfQueue(view) : null,
    fx: null,
    pending: null,
    late: false,
    patienceFrom: null,
    error: null,
  };
}

/**
 * النسخة الأحدث تكسب. نفس الماتش = بالـ`seq`؛ ماتش جديد أو مرحلة تانية
 * (طابور ← ماتش ← لوبي) = اللي وصل.
 */
export function mergeView(current: ArenaView, incoming: ArenaView): ArenaView {
  if (current.phase === 'match' && incoming.phase === 'match' && current.match.id === incoming.match.id) {
    return incoming.match.seq >= current.match.seq ? incoming : current;
  }
  // فريم «طابور» متأخر وصل بعد ما الماتش اتعمل — الماتش أحدث.
  if (current.phase === 'match' && !current.match.end && incoming.phase === 'queued') return current;
  return incoming;
}

let fxKey = 0;

export function arenaReducer(state: ArenaState, action: ArenaAction): ArenaState {
  switch (action.type) {
    case 'frame': {
      const view = mergeView(state.view, action.view);
      const moved = view !== state.view;
      const next: ArenaState = {
        ...state,
        view,
        offset: action.at - action.now,
        fx: moved || action.fx === 'hello' ? { fx: action.fx, key: ++fxKey } : state.fx,
      };
      if (!moved) return next;
      // سؤال جديد = مفيش اختيار رايح ولا «متأخر».
      if (questionIndex(view) !== questionIndex(state.view)) {
        next.pending = null;
        next.late = false;
      }
      if (view.phase === 'match') next.want = null;
      if (view.phase === 'queued' && state.view.phase !== 'queued') next.patienceFrom = action.now;
      if (action.fx === 'left_queue' || action.fx === 'no_questions') next.want = null;
      if (action.fx === 'no_questions') next.error = 'no_questions';
      return next;
    }
    case 'clock':
      return { ...state, offset: action.at - action.now };
    case 'beat': {
      // السيرفر شالنا من الطابور من غير ما يبعت (النبضة وقفت لحظة) — الشاشة
      // لسه فاكرة إننا مستنيين. نرجع «مفيش حاجة»، و`want` بيرجّعنا للطابور.
      const lost = action.phase === 'idle' && state.view.phase === 'queued';
      return { ...state, offset: action.at - action.now, view: lost ? { phase: 'idle' } : state.view };
    }
    case 'connection':
      return { ...state, connection: action.connection };
    case 'start':
      return {
        ...state,
        // «ماتش تاني» من شاشة النتيجة: الشاشة تروح «بندوّر» على طول، مش بعد رد الطلب.
        view: state.view.phase === 'match' && state.view.match.end ? { phase: 'idle' } : state.view,
        want: action.intent,
        error: null,
        patienceFrom: action.now,
        pending: null,
        late: false,
      };
    case 'queued': {
      const view = mergeView(state.view, action.view);
      // «افتح تحدّي» اتحوّل لتحدّي برقم — الرجوع بعد ريستارت يرجع لنفس
      // التحدّي، مش يفتح واحد تاني.
      const want = view.phase === 'queued' && state.want ? intentOfQueue(view) : state.want;
      return { ...state, view, want, patienceFrom: state.patienceFrom ?? action.now };
    }
    case 'cancel':
      return { ...state, view: { phase: 'idle' }, want: null, patienceFrom: null, pending: null };
    case 'answer-sent':
      return { ...state, pending: action.optionId, late: false };
    case 'answer-result': {
      const view = mergeView(state.view, action.view);
      return { ...state, view, pending: null, late: action.result === 'late' };
    }
    case 'answer-failed':
      return { ...state, pending: null };
    case 'keep-waiting':
      return { ...state, patienceFrom: action.now };
    case 'reset':
      return { ...state, view: { phase: 'idle' }, want: null, pending: null, late: false, patienceFrom: null, fx: null };
    case 'error':
      return { ...state, error: action.message };
  }
}

function questionIndex(view: ArenaView): string {
  return view.phase === 'match' ? `${view.match.id}:${view.match.index}:${view.match.stage}` : view.phase;
}

/**
 * الاختيار ده مافيهوش ولا حرف عربي؟ — «len()» في سطر RTL بتطلع «()len»،
 * فالاختيار اللي كله لاتيني أو أرقام بيتعزل LTR. اختيار فيه عربي (حتى لو
 * بيبدأ بكود) بيفضل RTL، والكود جوّاه معزول لوحده.
 */
export function isLatinText(html: string): boolean {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
  return !/[\u0600-\u06FF\u0750-\u077F]/u.test(text);
}

/** أنهي شاشة. */
export type Screen = 'lobby' | 'search' | 'versus' | 'question' | 'result';

export function screenOf(state: Pick<ArenaState, 'view' | 'want'>): Screen {
  const { view } = state;
  if (view.phase === 'queued') return 'search';
  if (view.phase === 'idle') return state.want ? 'search' : 'lobby';
  const match = view.match;
  if (match.end) return 'result';
  if (match.stage === 'vs') return 'versus';
  return 'question';
}

/** مللي فاضلين لحد `deadline` بساعة السيرفر. */
export function remainingMs(deadline: number | null, offset: number, now: number): number {
  if (deadline === null) return 0;
  return Math.max(0, deadline - (now + offset));
}

/** «٠١:٠٧» — دقايق وثواني. */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** «فاتت الدقيقة ومفيش حد» — الشاشة بتسأل نستنى ولا لأ. */
export function patienceRanOut(patienceFrom: number | null, now: number, patienceMs: number): boolean {
  return patienceFrom !== null && now - patienceFrom >= patienceMs;
}

/** الصوت اللي يتلعب مع كل حاجة حصلت. */
export type Cue =
  | 'blip'
  | 'matched'
  | 'go'
  | 'right'
  | 'wrong'
  | 'steal'
  | 'lost-point'
  | 'miss'
  | 'alert'
  | 'back'
  | 'win'
  | 'lose'
  | 'draw'
  | 'tick';

export function cueFor(fx: ArenaFx, match: ArenaMatchView | null): Cue | null {
  switch (fx) {
    case 'matched':
      return 'matched';
    case 'question':
      return 'go';
    case 'you_right':
      return 'right';
    case 'you_wrong':
      return 'wrong';
    case 'opponent_right':
      return 'lost-point';
    case 'opponent_wrong':
      return 'steal';
    case 'both_wrong':
    case 'timeout':
      return 'miss';
    case 'opponent_offline':
    case 'paused':
      return 'alert';
    case 'opponent_back':
    case 'resumed':
      return 'back';
    case 'end': {
      const outcome = match?.end?.outcome;
      if (outcome === 'win') return 'win';
      if (outcome === 'loss') return 'lose';
      return 'draw';
    }
    case 'aborted':
    case 'no_questions':
      return 'miss';
    default:
      return null;
  }
}
