'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Coffee, Loader2, Play, Square, Timer, Users } from 'lucide-react';
import {
  FOCUS_BREAK_MINUTES,
  FOCUS_DEFAULT_MINUTES,
  FOCUS_MINUTES,
  FocusPayloadSchema,
  FocusStopResultSchema,
  type FocusPayload,
} from '@ayman/contracts/engagement';
import { engagementCopy } from '@ayman/contracts/copy/engagement';
import { formatCopy } from '@ayman/contracts/format';
import { CountUp } from '@/components/rank/count-up';
import { apiGet, apiPost } from '@/lib/api';

const c = engagementCopy.focus;

/** How often the «بيذاكروا دلوقتي» count is re-read while the page is open. */
const LIVE_REFRESH_MS = 30_000;

const weekdayShort = new Intl.DateTimeFormat('ar-EG', { weekday: 'short', timeZone: 'UTC' });

type Phase =
  | { kind: 'idle' }
  | { kind: 'running'; endsAt: number; minutes: number }
  | { kind: 'break'; endsAt: number; minutes: number; credited: number }
  | { kind: 'stopped'; minutes: number };

function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** A soft two-note chime when a sitting or a break runs out. Silent where audio is blocked. */
function chime(): void {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const context = new AudioCtx();
    [660, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      const at = context.currentTime + index * 0.22;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.55);
    });
  } catch {
    // No sound is fine — the screen says it too.
  }
}

/**
 * The ring: a full circle that empties as the time runs out. `progress` is
 * the share still LEFT, so a fresh sitting is a whole ring.
 */
function Ring({ progress, label, sub, tone }: { progress: number; label: string; sub: string; tone: 'run' | 'break' | 'idle' }) {
  const radius = 92;
  const length = 2 * Math.PI * radius;
  return (
    <div className="eg-ring" data-tone={tone}>
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <circle className="eg-ring__track" cx="100" cy="100" r={radius} />
        <circle
          className="eg-ring__fill"
          cx="100"
          cy="100"
          r={radius}
          strokeDasharray={length}
          strokeDashoffset={length * (1 - Math.min(1, Math.max(0, progress)))}
        />
      </svg>
      <div className="eg-ring__text">
        <span className="eg-ring__time eg-ltr-num">{label}</span>
        <span className="eg-ring__sub">{sub}</span>
      </div>
    </div>
  );
}

/**
 * «أوضة المذاكرة». The server owns the sitting (`FocusService`); this screen
 * shows the countdown, chimes at the end, then runs a short break that is
 * never stored. A reload in the middle comes back to the same timer, because
 * the open sitting arrives with the page.
 */
export function FocusBoard({ initial }: { initial: FocusPayload }) {
  const [payload, setPayload] = useState(initial);
  const [minutes, setMinutes] = useState<number>(initial.open?.minutes ?? FOCUS_DEFAULT_MINUTES);
  const [phase, setPhase] = useState<Phase>(() =>
    initial.open
      ? { kind: 'running', endsAt: Date.parse(initial.open.endsAt), minutes: initial.open.minutes }
      : { kind: 'idle' },
  );
  const [now, setNow] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finishing = useRef(false);

  // The end of a sitting or a break, checked on every tick of the clock.
  const onTick = useEffectEvent((at: number) => {
    setNow(at);
    if (phase.kind === 'running' && at >= phase.endsAt && !finishing.current) {
      finishing.current = true;
      chime();
      void stop(true);
    } else if (phase.kind === 'break' && at >= phase.endsAt) {
      chime();
      setPhase({ kind: 'idle' });
    }
  });

  // The clock. `now` stays null until the first tick so the server render and
  // the first client render agree.
  useEffect(() => {
    const first = window.setTimeout(() => onTick(Date.now()), 0);
    const every = window.setInterval(() => onTick(Date.now()), 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, []);

  // The live count, re-read every half minute.
  useEffect(() => {
    const every = window.setInterval(() => {
      apiGet('/api/me/focus', FocusPayloadSchema)
        .then((fresh) => setPayload(fresh))
        .catch(() => undefined);
    }, LIVE_REFRESH_MS);
    return () => window.clearInterval(every);
  }, []);

  const remaining =
    phase.kind === 'running' || phase.kind === 'break'
      ? now === null
        ? phase.minutes * 60_000
        : phase.endsAt - now
      : 0;

  // The tab title counts down too, so the timer is visible from another tab.
  useEffect(() => {
    if (phase.kind !== 'running' && phase.kind !== 'break') return;
    const previous = document.title;
    document.title = `${clock(remaining)} · ${phase.kind === 'break' ? c.finished.breakLabel : c.running}`;
    return () => {
      document.title = previous;
    };
  }, [remaining, phase.kind]);

  async function start(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const fresh = await apiPost('/api/me/focus/start', FocusPayloadSchema, { minutes });
      setPayload(fresh);
      if (fresh.open) {
        finishing.current = false;
        setPhase({ kind: 'running', endsAt: Date.parse(fresh.open.endsAt), minutes: fresh.open.minutes });
      }
    } catch {
      setError(c.errors.failed);
    } finally {
      setBusy(false);
    }
  }

  async function stop(natural: boolean): Promise<void> {
    setBusy(true);
    setConfirming(false);
    setError(null);
    try {
      const result = await apiPost('/api/me/focus/stop', FocusStopResultSchema, {});
      setPayload(result.payload);
      if (result.completed) {
        setPhase({
          kind: 'break',
          endsAt: Date.now() + FOCUS_BREAK_MINUTES * 60_000,
          minutes: FOCUS_BREAK_MINUTES,
          credited: result.minutes,
        });
      } else {
        setPhase({ kind: 'stopped', minutes: result.minutes });
      }
    } catch {
      setError(c.errors.failed);
      if (natural) finishing.current = false;
    } finally {
      setBusy(false);
    }
  }

  const maxWeek = Math.max(1, ...payload.week.map((day) => day.minutes));

  return (
    <>
      <section className="eg-hero" data-hue="violet">
        <div className="eg-hero__shapes" aria-hidden="true">
          <span className="eg-shape eg-shape--ring" />
          <span className="eg-shape eg-shape--blob" />
        </div>
        <span className="eg-hero__pill">
          <Users className="size-3.5" aria-hidden="true" />
          {c.live.pill}
        </span>
        <div className="eg-hero__main">
          <span className="eg-live" data-on={payload.live > 0} aria-hidden="true" />
          <p className="eg-hero__total">
            <span className="eg-hero__num">
              <CountUp to={payload.live + (phase.kind === 'running' ? 1 : 0)} />
            </span>
            <span className="eg-hero__label">
              {payload.live === 0 && phase.kind !== 'running' ? c.live.alone : c.live.label}
            </span>
          </p>
        </div>
        <dl className="eg-hero__stats">
          <div>
            <dt>{c.stats.todayMinutes}</dt>
            <dd>{payload.today.minutes}</dd>
          </div>
          <div>
            <dt>{c.stats.todaySessions}</dt>
            <dd>{payload.today.sessions}</dd>
          </div>
          <div>
            <dt>{c.stats.totalMinutes}</dt>
            <dd>{payload.total.minutes}</dd>
          </div>
          <div>
            <dt>{c.stats.totalSessions}</dt>
            <dd>{payload.total.sessions}</dd>
          </div>
        </dl>
      </section>

      <section className="eg-card eg-focus">
        {phase.kind === 'running' ? (
          <>
            <Ring
              tone="run"
              progress={remaining / (phase.minutes * 60_000)}
              label={clock(remaining)}
              sub={c.running}
            />
            <p className="eg-muted-line eg-focus__tip">{c.tip}</p>
            {confirming ? (
              <div className="eg-focus__actions">
                <p className="eg-focus__ask">{c.stopConfirm}</p>
                <button type="button" className="eg-btn eg-btn--lg" onClick={() => setConfirming(false)}>
                  {c.stopNo}
                </button>
                <button type="button" className="eg-btn eg-btn--danger eg-btn--lg" disabled={busy} onClick={() => void stop(false)}>
                  {c.stopYes}
                </button>
              </div>
            ) : (
              <div className="eg-focus__actions">
                <button type="button" className="eg-btn eg-btn--lg" disabled={busy} onClick={() => setConfirming(true)}>
                  <Square className="size-4" aria-hidden="true" />
                  {c.stop}
                </button>
              </div>
            )}
          </>
        ) : phase.kind === 'break' ? (
          <>
            <div className="eg-focus__done">
              <p className="eg-card__title">{c.finished.title}</p>
              <p className="eg-muted-line">
                {formatCopy(c.finished.body, { n: phase.credited })}
              </p>
            </div>
            <Ring
              tone="break"
              progress={remaining / (phase.minutes * 60_000)}
              label={clock(remaining)}
              sub={c.finished.breakLabel}
            />
            <div className="eg-focus__actions">
              <button type="button" className="eg-btn eg-btn--solid eg-btn--lg" disabled={busy} onClick={() => void start()}>
                <Play className="size-4" aria-hidden="true" />
                {c.finished.skipBreak}
              </button>
            </div>
          </>
        ) : (
          <>
            {phase.kind === 'stopped' ? (
              <div className="eg-focus__done">
                <p className="eg-card__title">{c.stopped.title}</p>
                <p className="eg-muted-line">{formatCopy(c.stopped.body, { n: phase.minutes })}</p>
              </div>
            ) : null}
            <Ring tone="idle" progress={1} label={clock(minutes * 60_000)} sub={c.pick} />
            <div className="eg-weekdays eg-focus__lengths" role="radiogroup" aria-label={c.pick}>
              {FOCUS_MINUTES.map((length) => (
                <button
                  key={length}
                  type="button"
                  role="radio"
                  aria-checked={minutes === length}
                  aria-pressed={minutes === length}
                  className="eg-weekday"
                  onClick={() => setMinutes(length)}
                >
                  {formatCopy(c.minutes, { n: length })}
                </button>
              ))}
            </div>
            <div className="eg-focus__actions">
              <button type="button" className="eg-btn eg-btn--solid eg-btn--lg" disabled={busy} onClick={() => void start()}>
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
                {busy ? c.starting : c.start}
              </button>
            </div>
          </>
        )}
        {error ? (
          <p className="eg-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <section className="eg-card">
        <header className="eg-card__head">
          <span className="eg-panel__icon" data-hue="violet" aria-hidden="true">
            <Timer className="size-5" />
          </span>
          <h2 className="eg-card__title">{c.stats.week}</h2>
          <span className="eg-card__meta">
            {payload.week.reduce((sum, day) => sum + day.minutes, 0)} {c.stats.minutes}
          </span>
        </header>
        <ol className="eg-bars">
          {payload.week.map((day) => (
            <li key={day.day} className="eg-bars__day">
              <span className="eg-bars__value eg-ltr-num">{day.minutes > 0 ? day.minutes : ''}</span>
              <span className="eg-bars__track">
                <span className="eg-bars__fill" style={{ blockSize: `${(day.minutes / maxWeek) * 100}%` }} />
              </span>
              <span className="eg-bars__name">{weekdayShort.format(new Date(`${day.day}T00:00:00Z`))}</span>
            </li>
          ))}
        </ol>
        <p className="eg-muted-line">
          <Coffee className="inline size-4" aria-hidden="true" /> {formatCopy(c.minutes, { n: FOCUS_BREAK_MINUTES })} —{' '}
          {c.finished.breakLabel}
        </p>
      </section>
    </>
  );
}
