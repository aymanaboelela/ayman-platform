'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  ARENA_RULES,
  ArenaAnswerResultSchema,
  ArenaBeatSchema,
  ArenaFrameSchema,
  ArenaViewSchema,
  type ArenaView,
} from '@ayman/contracts/arena';
import { ApiRequestError, apiDelete, apiPost } from '@/lib/api';
import { arenaReducer, initialState, screenOf } from './arena-state';

const STREAM_URL = '/api/me/arena/stream';
/** مفيش ولا فريم (حتى `ping` كل ٥ ثواني) بقاله كده = الخط مات، نفتحه من جديد. */
const SILENCE_MS = 12_000;
/** بعد ريستارت للسيرفر: الطالب لسه عايز يلعب ومش في طابور — نرجّعه، مش أكتر من مرة كل كده. */
const REJOIN_EVERY_MS = 4_000;

export type ArenaErrorCode = 'no_year' | 'no_subscription' | 'course_not_playable' | 'no_questions' | 'unavailable';

/**
 * الماتش المباشر: ستريم SSE للحالة، ونبضة POST كل ٤ ثواني، والأفعال
 * (يلا نبدأ، إلغاء، إجابة، انسحاب).
 *
 * الستريم مفتوح بس وإحنا في الطابور أو في ماتش — اللوبي مابيفتحش كونكشن.
 * EventSource بيعيد لوحده بعد أي قطع، وفوقه حارس: لو فات ١٢ ثانية من غير
 * ولا فريم، بنقفله ونفتحه تاني (موبايل النت قطع عنده من غير ما السوكت يقفل).
 */
export function useArenaLive(initial: { view: ArenaView; at: number }) {
  const [state, dispatch] = useReducer(arenaReducer, undefined, () => initialState(initial.view, initial.at, Date.now()));
  const screen = screenOf(state);
  const live = screen !== 'lobby';
  const lastJoin = useRef(0);

  // ── الستريم ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!live) {
      dispatch({ type: 'connection', connection: 'off' });
      return;
    }
    let source: EventSource | null = null;
    let lastFrameAt = Date.now();
    let failures = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const open = () => {
      if (stopped) return;
      source?.close();
      dispatch({ type: 'connection', connection: 'connecting' });
      const current = new EventSource(STREAM_URL);
      source = current;
      lastFrameAt = Date.now();
      current.onopen = () => {
        failures = 0;
        dispatch({ type: 'connection', connection: 'open' });
      };
      current.onmessage = (event: MessageEvent<string>) => {
        lastFrameAt = Date.now();
        let parsed: unknown;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return;
        }
        const frame = ArenaFrameSchema.safeParse(parsed);
        if (!frame.success) return;
        if (frame.data.type === 'ping') {
          dispatch({ type: 'clock', at: frame.data.at, now: Date.now() });
          return;
        }
        dispatch({ type: 'frame', view: frame.data.view, fx: frame.data.fx, at: frame.data.at, now: Date.now() });
      };
      current.onerror = () => {
        dispatch({ type: 'connection', connection: 'lost' });
        if (current.readyState === EventSource.CLOSED) {
          current.close();
          failures += 1;
          retry = setTimeout(open, Math.min(8_000, 1_000 * 2 ** (failures - 1)));
        }
      };
    };

    open();
    const watchdog = setInterval(() => {
      if (Date.now() - lastFrameAt > SILENCE_MS) {
        dispatch({ type: 'connection', connection: 'lost' });
        open();
      }
    }, 3_000);
    return () => {
      stopped = true;
      clearInterval(watchdog);
      if (retry) clearTimeout(retry);
      source?.close();
    };
  }, [live]);

  // ── النبضة ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!live) return;
    let stopped = false;
    const beat = async () => {
      try {
        const reply = await apiPost('/api/me/arena/beat', ArenaBeatSchema, {});
        if (!stopped) dispatch({ type: 'beat', at: reply.at, now: Date.now(), phase: reply.phase });
      } catch {
        // نبضة ضاعت = التانية بعد ٤ ثواني. السيرفر مستحمل اتنين.
      }
    };
    void beat();
    const timer = setInterval(() => void beat(), ARENA_RULES.beatMs);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [live]);

  // ── يلا نبدأ / ماتش تاني ─────────────────────────────────────────────────
  const join = useCallback(async (courseId: string) => {
    lastJoin.current = Date.now();
    try {
      const view = await apiPost('/api/me/arena/queue', ArenaViewSchema, { courseId });
      dispatch({ type: 'queued', view, now: Date.now() });
    } catch (error) {
      const code = errorCode(error);
      dispatch({ type: 'reset' });
      dispatch({ type: 'error', message: code });
    }
  }, []);

  const start = useCallback(
    (courseId: string) => {
      dispatch({ type: 'start', courseId, now: Date.now() });
      void join(courseId);
    },
    [join],
  );

  // السيرفر اتعمله ريستارت والطابور وقع؟ الستريم رجع بـ«مفيش حاجة» والطالب
  // لسه عايز يلعب — يرجع للطابور لوحده، بنفس الكورس.
  useEffect(() => {
    if (!state.want || state.view.phase !== 'idle' || state.connection !== 'open') return;
    if (Date.now() - lastJoin.current < REJOIN_EVERY_MS) return;
    void join(state.want);
  }, [state.want, state.view.phase, state.connection, join]);

  const cancel = useCallback(async () => {
    dispatch({ type: 'cancel' });
    try {
      await apiDelete('/api/me/arena/queue');
    } catch {
      // الطابور بينضّف نفسه لوحده لما النبضة تقف.
    }
  }, []);

  const answer = useCallback(
    async (matchId: string, index: number, optionId: string) => {
      dispatch({ type: 'answer-sent', optionId });
      try {
        const reply = await apiPost(`/api/me/arena/matches/${matchId}/answer`, ArenaAnswerResultSchema, {
          index,
          optionId,
        });
        dispatch({ type: 'answer-result', result: reply.result, view: reply.view });
      } catch {
        dispatch({ type: 'answer-failed' });
      }
    },
    [],
  );

  const leave = useCallback(async (matchId: string) => {
    try {
      const view = await apiPost(`/api/me/arena/matches/${matchId}/leave`, ArenaViewSchema, {});
      dispatch({ type: 'answer-result', result: 'ignored', view });
    } catch {
      dispatch({ type: 'reset' });
    }
  }, []);

  const keepWaiting = useCallback(() => dispatch({ type: 'keep-waiting', now: Date.now() }), []);
  const reset = useCallback(() => dispatch({ type: 'reset' }), []);

  return { state, screen, start, cancel, answer, leave, keepWaiting, reset };
}

function errorCode(error: unknown): ArenaErrorCode {
  if (error instanceof ApiRequestError && error.status === 403) {
    const code = (error.payload as { code?: unknown } | undefined)?.code;
    if (code === 'no_year' || code === 'no_subscription' || code === 'course_not_playable') return code;
    return 'course_not_playable';
  }
  return 'unavailable';
}
