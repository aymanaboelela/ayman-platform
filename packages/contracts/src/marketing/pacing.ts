/**
 * How fast a WhatsApp campaign is allowed to go — the whole of it, as pure
 * functions over an injected clock and an injected random.
 *
 * ## Why this is a contract module and not three lines in the sender
 *
 * Nothing else in this feature is as consequential and as untestable-in-place.
 * The sender talks to a real WhatsApp socket; the pacing decides whether the
 * instructor's personal number survives the campaign. Getting "resume at
 * 10:00 tomorrow" wrong by an hour is invisible in review and obvious to
 * WhatsApp, and the only way to have any confidence in it is to be able to
 * run the year through it in a unit test. So the sender asks this module
 * "when is the next one due", and holds no arithmetic of its own.
 *
 * ## The four brakes, and what each one is actually for
 *
 * · **the gap** (30–90s, randomised) — a fixed interval is a fingerprint. Two
 *   hundred messages exactly 30.0s apart is not something a person does, and
 *   it is the cheapest signal there is to detect. The randomisation is the
 *   point of the range, not the length of it.
 * · **the batch pause** (30 messages, then 10 minutes) — a human sending to a
 *   class does it in bursts with breaks. It also caps the damage of a bad
 *   template: a wrong link stops after 30 people, not 200.
 * · **the daily cap** (200) — the one brake that actually decides whether a
 *   number gets banned. Everything above only shapes the traffic within a day.
 * · **the window** (10:00–22:00 Cairo) — a message at 3am gets blocked and
 *   reported, and a block is the signal that costs the number.
 *
 * ## Cairo, via `Intl`, not via a fixed +02:00
 *
 * Egypt reintroduced daylight saving in 2023 (last Friday of April → last
 * Thursday of October). A hard-coded offset would put the window an hour out
 * for five months of the year — i.e. it would start sending at 09:00 in the
 * summer and stop at 21:00, which is exactly the kind of quiet wrongness that
 * never gets noticed. `Intl` carries the real rules and Node ships full ICU.
 */

/** IANA zone the whole product means when it says "the hour". */
const CAIRO = 'Africa/Cairo';

export interface Pacing {
  /** Shortest gap between two sends, in seconds. */
  minDelaySeconds: number;
  /** Longest gap. Equal to the minimum means "no jitter", which is allowed
   *  and is not recommended — see the module note on fingerprints. */
  maxDelaySeconds: number;
  /** Messages per burst before the long pause. */
  batchSize: number;
  /** How long that pause is, in minutes. */
  batchPauseMinutes: number;
  /** Hard stop per Cairo calendar day. */
  dailyCap: number;
  /** First hour of the sending window, Cairo, inclusive (0–23). */
  windowStartHour: number;
  /** Last hour, Cairo, EXCLUSIVE — 22 means the last message can go out at
   *  21:59 and none at 22:00. */
  windowEndHour: number;
}

/**
 * The conservative defaults, and the ones the admin form starts from.
 *
 * ~70 messages an hour in practice (30 sends at a ~60s mean, then 10 idle
 * minutes), so the 200/day cap is reached in roughly three hours of an
 * eleven-hour window. That headroom is deliberate: a campaign that finishes
 * its day's quota by lunchtime leaves the number looking like a person who
 * used WhatsApp in the morning, not like one that transmitted for eleven hours.
 */
export const DEFAULT_PACING: Pacing = {
  minDelaySeconds: 30,
  maxDelaySeconds: 90,
  batchSize: 30,
  batchPauseMinutes: 10,
  dailyCap: 200,
  windowStartHour: 10,
  windowEndHour: 22,
};

/** The counters a campaign carries between sends. */
export interface RunState {
  /** Messages sent since the last batch pause. */
  sentInBatch: number;
  /** Messages sent on `dayKey`. */
  sentToday: number;
  /** The Cairo calendar day `sentToday` counts, `YYYY-MM-DD`, or `null`
   *  before the first send. */
  dayKey: string | null;
}

/** Cairo wall-clock fields for an instant. */
export interface CairoParts {
  /** `YYYY-MM-DD`, the campaign's day key. */
  day: string;
  year: number;
  month: number;
  date: number;
  hour: number;
  minute: number;
}

const PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: CAIRO,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

interface WallFields {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function fields(at: Date): WallFields {
  const raw = new Map<string, number>();
  for (const part of PARTS.formatToParts(at)) {
    if (part.type !== 'literal') raw.set(part.type, Number(part.value));
  }
  const read = (key: string): number => raw.get(key) ?? 0;
  // `hour12: false` still yields 24 for midnight in some ICU versions.
  const hour = read('hour');
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: hour === 24 ? 0 : hour,
    minute: read('minute'),
    second: read('second'),
  };
}

export function cairoParts(at: Date): CairoParts {
  const f = fields(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    day: `${f.year}-${pad(f.month)}-${pad(f.day)}`,
    year: f.year,
    month: f.month,
    date: f.day,
    hour: f.hour,
    minute: f.minute,
  };
}

/** Minutes Cairo is ahead of UTC at `at` (+120 in winter, +180 in summer). */
function offsetMinutes(at: Date): number {
  const f = fields(at);
  const asIfUtc = Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second);
  return (asIfUtc - at.getTime() + at.getMilliseconds()) / 60000;
}

/**
 * The instant at which Cairo's wall clock reads the given fields.
 *
 * Two passes: guess with the offset at the naive instant, then re-check with
 * the offset at the corrected one. That second pass is what makes the two
 * changeover days come out right, and it is the reason this is not a
 * one-liner.
 */
export function fromCairoWall(
  year: number,
  month: number,
  date: number,
  hour: number,
  minute = 0,
): Date {
  const naive = Date.UTC(year, month - 1, date, hour, minute);
  const first = new Date(naive - offsetMinutes(new Date(naive)) * 60000);
  const second = new Date(naive - offsetMinutes(first) * 60000);
  return second;
}

/** Cairo midnight-to-midnight day `n` days after the one containing `at`. */
function dayShifted(at: Date, n: number): CairoParts {
  const p = cairoParts(at);
  // Through UTC arithmetic on the CAIRO date, so month ends and leap years
  // are the platform's problem and not this file's.
  const shifted = new Date(Date.UTC(p.year, p.month - 1, p.date + n));
  const pad = (v: number) => String(v).padStart(2, '0');
  return {
    day: `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    date: shifted.getUTCDate(),
    hour: 0,
    minute: 0,
  };
}

/**
 * `at` itself if it falls inside the sending window, otherwise the start of
 * the next window.
 *
 * Before the window on the same day → this morning's opening. At or after it
 * → tomorrow's. A campaign is never "late": it just waits.
 */
export function withinWindow(at: Date, pacing: Pacing): Date {
  const p = cairoParts(at);
  if (p.hour < pacing.windowStartHour) {
    return fromCairoWall(p.year, p.month, p.date, pacing.windowStartHour);
  }
  if (p.hour >= pacing.windowEndHour) {
    const next = dayShifted(at, 1);
    return fromCairoWall(next.year, next.month, next.date, pacing.windowStartHour);
  }
  return at;
}

/** Why the next message is scheduled when it is. Surfaced to the admin screen
 *  so a campaign that looks stuck can explain itself. */
export type PacingReason = 'gap' | 'batch-pause' | 'daily-cap' | 'outside-window';

export interface NextSend {
  at: Date;
  reason: PacingReason;
  state: RunState;
}

/**
 * Counters as of `now`, with the daily one rolled over if the Cairo day has
 * turned. Exported because the "may I send right now" check needs it too, and
 * a campaign resumed after a week must not think it has already sent 200
 * messages today.
 */
export function rolled(state: RunState, now: Date): RunState {
  const today = cairoParts(now).day;
  if (state.dayKey === today) return state;
  return { sentInBatch: state.sentInBatch, sentToday: 0, dayKey: today };
}

/**
 * Whether a message may go out at `now`, given the counters.
 *
 * The scheduler already holds a `nextSendAt`, so this is the second, cheap
 * guard rather than the primary one: it catches the two cases a stored
 * timestamp cannot, namely a clock that has crossed out of the window while
 * the row waited, and a daily cap that was lowered after the row was
 * scheduled.
 */
export function maySendAt(now: Date, pacing: Pacing, state: RunState): boolean {
  const hour = cairoParts(now).hour;
  if (hour < pacing.windowStartHour || hour >= pacing.windowEndHour) return false;
  return rolled(state, now).sentToday < pacing.dailyCap;
}

/**
 * When the message AFTER the one just sent should go out.
 *
 * `jitter` is a caller-supplied value in `[0, 1)` — `Math.random()` in
 * production, a fixed number in tests. Injected rather than called here for
 * the ordinary reason: a scheduler whose output cannot be predicted cannot be
 * asserted on, and this is the part of the feature most worth asserting on.
 *
 * The order of the three brakes is the design. The daily cap outranks the
 * batch pause, which outranks the gap — otherwise a campaign that hits its
 * cap mid-burst would schedule a ten-minute pause and then be blocked anyway,
 * and the admin screen would say «راحة» for eleven hours.
 */
export function nextSend(now: Date, pacing: Pacing, state: RunState, jitter: number): NextSend {
  const counted: RunState = (() => {
    const r = rolled(state, now);
    return { sentInBatch: r.sentInBatch + 1, sentToday: r.sentToday + 1, dayKey: r.dayKey };
  })();

  if (counted.sentToday >= pacing.dailyCap) {
    const next = dayShifted(now, 1);
    return {
      at: fromCairoWall(next.year, next.month, next.date, pacing.windowStartHour),
      reason: 'daily-cap',
      // Tomorrow starts a fresh burst as well as a fresh day: resuming
      // mid-batch after an overnight gap would send 200 and then pause ten
      // minutes for no reason anybody could observe.
      state: { sentInBatch: 0, sentToday: counted.sentToday, dayKey: counted.dayKey },
    };
  }

  if (pacing.batchSize > 0 && counted.sentInBatch >= pacing.batchSize) {
    const at = new Date(now.getTime() + pacing.batchPauseMinutes * 60000);
    const clamped = withinWindow(at, pacing);
    return {
      at: clamped,
      reason: clamped.getTime() === at.getTime() ? 'batch-pause' : 'outside-window',
      state: { sentInBatch: 0, sentToday: counted.sentToday, dayKey: counted.dayKey },
    };
  }

  const span = Math.max(0, pacing.maxDelaySeconds - pacing.minDelaySeconds);
  const seconds = pacing.minDelaySeconds + Math.floor(jitter * (span + 1));
  const at = new Date(now.getTime() + seconds * 1000);
  const clamped = withinWindow(at, pacing);
  return {
    at: clamped,
    reason: clamped.getTime() === at.getTime() ? 'gap' : 'outside-window',
    state: counted,
  };
}

/**
 * Rough wall-clock time to push `remaining` messages through, in minutes —
 * what the confirm dialog shows before anybody presses «ابدأ».
 *
 * Deliberately an estimate and deliberately shown: «٤٥٠٠ متلقّي» means
 * nothing on its own, and «حوالي ٢٣ يوم» is the number that makes somebody
 * pick a smaller audience. Counts the overnight gaps, ignores the current
 * time of day.
 */
export function estimateMinutes(remaining: number, pacing: Pacing): number {
  if (remaining <= 0) return 0;

  const meanGap = (pacing.minDelaySeconds + pacing.maxDelaySeconds) / 2;
  const windowMinutes = Math.max(1, (pacing.windowEndHour - pacing.windowStartHour) * 60);
  const burstMinutes = (count: number): number => {
    if (count <= 0) return 0;
    const pauses = pacing.batchSize > 0 ? Math.floor((count - 1) / pacing.batchSize) : 0;
    return Math.min(windowMinutes, (count * meanGap) / 60 + pauses * pacing.batchPauseMinutes);
  };

  const fullDays = Math.floor(remaining / pacing.dailyCap);
  const tail = remaining % pacing.dailyCap;

  // Every day whose cap is spent costs a whole calendar day, not just its
  // sending minutes: the quota is exhausted a few hours in and the campaign
  // then waits for the window to reopen. Counting only the active minutes is
  // what made a 23-day run read as 15.
  if (tail > 0) return Math.round(fullDays * 1440 + burstMinutes(tail));
  return Math.round((fullDays - 1) * 1440 + burstMinutes(pacing.dailyCap));
}
