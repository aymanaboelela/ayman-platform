'use client';

/**
 * The sound of «أوضة المذاكرة» — every tone synthesised with Web Audio, so
 * there is no file to host, cache or let fail on a slow line.
 *
 * ## One context, opened by a tap
 *
 * Browsers only let a page make sound after a gesture, and iOS Safari only
 * while the context is RESUMED inside that gesture. The old chime built a fresh
 * `AudioContext` when the timer ran out — inside a `setInterval`, with no
 * gesture anywhere near it — so on a phone the end of a sitting was silent.
 * Here one context lives for the page and `unlock()` is called from every
 * button the student presses.
 *
 * ## The end is scheduled on the audio clock
 *
 * A hidden tab's timers are throttled to once a minute after a few minutes, so
 * a chime fired from the tick could ring up to a minute late. `scheduleAlarm`
 * books the chime on the audio thread at the second the sitting ends, which
 * no tab throttling touches; the tick only rings it when nothing was booked
 * (a reload mid-sitting, before any tap has opened the context).
 */

export const FOCUS_ALARMS = ['bell', 'crystal', 'marimba', 'digital', 'calm', 'none'] as const;
export type FocusAlarm = (typeof FOCUS_ALARMS)[number];

export const FOCUS_AMBIENTS = ['none', 'rain', 'waves', 'brown', 'clock'] as const;
export type FocusAmbient = (typeof FOCUS_AMBIENTS)[number];

export interface FocusSoundPrefs {
  alarm: FocusAlarm;
  ambient: FocusAmbient;
  /** 0–1, the master level. */
  volume: number;
}

export const DEFAULT_SOUND_PREFS: FocusSoundPrefs = { alarm: 'bell', ambient: 'none', volume: 0.7 };

/** Something booked on the audio clock that can still be called off. */
export interface SoundHandle {
  cancel(): void;
}

const NOOP: SoundHandle = { cancel: () => undefined };

/* ── preferences: per browser, a convenience — never anything that matters ── */

const PREFS_KEY = 'focus-sound:v1';
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedPrefs: FocusSoundPrefs = DEFAULT_SOUND_PREFS;

function parsePrefs(raw: string | null): FocusSoundPrefs {
  if (!raw) return DEFAULT_SOUND_PREFS;
  try {
    const value = JSON.parse(raw) as Partial<FocusSoundPrefs>;
    return {
      alarm: FOCUS_ALARMS.includes(value.alarm as FocusAlarm) ? (value.alarm as FocusAlarm) : DEFAULT_SOUND_PREFS.alarm,
      ambient: FOCUS_AMBIENTS.includes(value.ambient as FocusAmbient)
        ? (value.ambient as FocusAmbient)
        : DEFAULT_SOUND_PREFS.ambient,
      volume:
        typeof value.volume === 'number' && Number.isFinite(value.volume)
          ? Math.min(1, Math.max(0, value.volume))
          : DEFAULT_SOUND_PREFS.volume,
    };
  } catch {
    return DEFAULT_SOUND_PREFS;
  }
}

/** `useSyncExternalStore` snapshot — the same object until the stored string changes. */
export function readSoundPrefs(): FocusSoundPrefs {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(PREFS_KEY);
  } catch {
    // Storage blocked (private window, embedded preview): the defaults stand.
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedPrefs = parsePrefs(raw);
  }
  return cachedPrefs;
}

export function serverSoundPrefs(): FocusSoundPrefs {
  return DEFAULT_SOUND_PREFS;
}

export function subscribeSoundPrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function writeSoundPrefs(next: Partial<FocusSoundPrefs>): void {
  const merged = { ...readSoundPrefs(), ...next };
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
  } catch {
    // Not remembered across visits — still applied for this one.
    cachedRaw = JSON.stringify(merged);
    cachedPrefs = merged;
  }
  if (next.volume !== undefined) setVolume(merged.volume);
  listeners.forEach((listener) => listener());
}

/* ── the context ─────────────────────────────────────────────────────────── */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<string, AudioBuffer>();

function audio(): { c: AudioContext; out: GainNode } | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = curve(readSoundPrefs().volume);
    master.connect(ctx.destination);
  }
  return master ? { c: ctx, out: master } : null;
}

/** Ears hear loudness on a log scale; a squared slider feels even. */
function curve(volume: number): number {
  return volume * volume;
}

/** Call from inside a click. Opens (or re-opens) the context while the gesture is live. */
export function unlockAudio(): void {
  const a = audio();
  if (a && a.c.state !== 'running') void a.c.resume().catch(() => undefined);
}

function running(): boolean {
  return ctx?.state === 'running';
}

export function setVolume(volume: number): void {
  if (!ctx || !master) return;
  master.gain.setTargetAtTime(curve(volume), ctx.currentTime, 0.05);
}

/* ── the alarms: short, musical, each its own character ──────────────────── */

type Voice = { osc: OscillatorNode; gain: GainNode };

/** One enveloped partial: a quick attack, an exponential tail. */
function tone(
  c: AudioContext,
  out: AudioNode,
  { freq, at, peak, attack = 0.01, decay, type = 'sine' }: { freq: number; at: number; peak: number; attack?: number; decay: number; type?: OscillatorType },
): Voice {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + attack + decay + 0.05);
  return { osc, gain };
}

function bell(c: AudioContext, out: AudioNode, at: number): Voice[] {
  // A struck bell: inharmonic partials, the high ones dying first.
  const partials: Array<[number, number, number]> = [
    [1, 0.32, 2.8],
    [2, 0.14, 2.2],
    [2.76, 0.12, 1.6],
    [5.4, 0.06, 0.9],
    [8.93, 0.03, 0.5],
  ];
  const voices: Voice[] = [];
  [0, 1.3].forEach((offset, strike) => {
    const base = strike === 0 ? 587.33 : 440;
    partials.forEach(([ratio, peak, decay]) =>
      voices.push(tone(c, out, { freq: base * ratio, at: at + offset, peak, attack: 0.004, decay })),
    );
  });
  return voices;
}

function crystal(c: AudioContext, out: AudioNode, at: number): Voice[] {
  const notes = [1046.5, 1318.5, 1568, 2093];
  const voices: Voice[] = [];
  [0, 0.9].forEach((offset) =>
    notes.forEach((freq, index) => {
      const t = at + offset + index * 0.11;
      voices.push(tone(c, out, { freq, at: t, peak: 0.16, attack: 0.005, decay: 1.1 }));
      voices.push(tone(c, out, { freq: freq * 2.01, at: t, peak: 0.04, attack: 0.005, decay: 0.5 }));
    }),
  );
  return voices;
}

function marimba(c: AudioContext, out: AudioNode, at: number): Voice[] {
  const melody: Array<[number, number]> = [
    [659.25, 0],
    [783.99, 0.16],
    [987.77, 0.32],
    [783.99, 0.48],
    [1318.5, 0.72],
  ];
  const voices: Voice[] = [];
  melody.forEach(([freq, offset]) => {
    voices.push(tone(c, out, { freq, at: at + offset, peak: 0.3, attack: 0.003, decay: 0.55 }));
    // The mallet: a bright partial gone in a blink.
    voices.push(tone(c, out, { freq: freq * 3.98, at: at + offset, peak: 0.06, attack: 0.002, decay: 0.07 }));
  });
  return voices;
}

function digital(c: AudioContext, out: AudioNode, at: number): Voice[] {
  // The classic watch alarm — softened through a low-pass so it nags without hurting.
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 3200;
  filter.connect(out);
  const voices: Voice[] = [];
  for (let round = 0; round < 3; round += 1) {
    for (let beep = 0; beep < 2; beep += 1) {
      const t = at + round * 0.6 + beep * 0.14;
      voices.push(tone(c, filter, { freq: 1760, at: t, peak: 0.09, attack: 0.004, decay: 0.08, type: 'square' }));
    }
  }
  return voices;
}

function calm(c: AudioContext, out: AudioNode, at: number): Voice[] {
  // A soft chord that swells in and fades — for whoever hates being startled.
  const chord = [261.63, 329.63, 392, 493.88, 587.33];
  return chord.flatMap((freq, index) => [
    tone(c, out, { freq, at: at + index * 0.06, peak: 0.09, attack: 0.7, decay: 2.6 }),
    tone(c, out, { freq: freq * 1.003, at: at + index * 0.06, peak: 0.05, attack: 0.7, decay: 2.6, type: 'triangle' }),
  ]);
}

const ALARMS: Record<Exclude<FocusAlarm, 'none'>, (c: AudioContext, out: AudioNode, at: number) => Voice[]> = {
  bell,
  crystal,
  marimba,
  digital,
  calm,
};

function handle(voices: Voice[]): SoundHandle {
  return {
    cancel() {
      voices.forEach(({ osc, gain }) => {
        try {
          osc.stop();
        } catch {
          // Already stopped.
        }
        gain.disconnect();
      });
    },
  };
}

/** Plays an alarm now — the preview, and the fallback when nothing was booked. */
export function playAlarm(alarm: FocusAlarm): SoundHandle {
  const a = audio();
  if (!a || alarm === 'none') return NOOP;
  if (!running()) void a.c.resume().catch(() => undefined);
  return handle(ALARMS[alarm](a.c, a.out, a.c.currentTime + 0.03));
}

/**
 * Books the alarm for wall-clock `atMs` on the audio thread. Returns null when
 * the context is not running yet — the caller then rings from its own tick.
 */
export function scheduleAlarm(alarm: FocusAlarm, atMs: number): SoundHandle | null {
  if (alarm === 'none') return NOOP;
  const a = audio();
  if (!a || !running()) return null;
  const delay = (atMs - Date.now()) / 1000;
  if (delay <= 0) return null;
  return handle(ALARMS[alarm](a.c, a.out, a.c.currentTime + delay));
}

/* ── the room: a loop under the sitting ──────────────────────────────────── */

function noiseBuffer(c: AudioContext, kind: 'white' | 'brown'): AudioBuffer {
  const key = `noise:${kind}`;
  const cached = buffers.get(key);
  if (cached) return cached;
  const length = c.sampleRate * 4;
  const buffer = c.createBuffer(2, length, c.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      if (kind === 'white') {
        data[i] = white * 0.5;
      } else {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      }
    }
    // Brown noise wanders, so the last sample is nowhere near the first and the
    // loop would click every four seconds. Tilting the whole buffer closes the gap.
    if (kind === 'brown') {
      const gap = data[length - 1]! - data[0]!;
      for (let i = 0; i < length; i += 1) data[i]! -= (gap * i) / (length - 1);
    }
  }
  buffers.set(key, buffer);
  return buffer;
}

/** Four seconds of scattered drops — looped, it is never the same pattern twice in a minute. */
function dropsBuffer(c: AudioContext): AudioBuffer {
  const cached = buffers.get('drops');
  if (cached) return cached;
  const length = c.sampleRate * 4;
  const buffer = c.createBuffer(2, length, c.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    let i = 0;
    while (i < length) {
      i += Math.floor(c.sampleRate * (0.008 + Math.random() * 0.05));
      const size = Math.floor(c.sampleRate * (0.002 + Math.random() * 0.006));
      const level = 0.15 + Math.random() * 0.5;
      for (let j = 0; j < size && i + j < length; j += 1) {
        data[i + j] = (data[i + j] ?? 0) + (Math.random() * 2 - 1) * level * Math.exp((-6 * j) / size);
      }
    }
  }
  buffers.set('drops', buffer);
  return buffer;
}

/** A wall clock: «تك» on the second, a lower «توك» on the next. */
function clockBuffer(c: AudioContext): AudioBuffer {
  const cached = buffers.get('clock');
  if (cached) return cached;
  const length = c.sampleRate * 2;
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  const strikes: Array<[number, number]> = [
    [0, 2400],
    [c.sampleRate, 1900],
  ];
  strikes.forEach(([start, freq]) => {
    const size = Math.floor(c.sampleRate * 0.03);
    for (let j = 0; j < size; j += 1) {
      const t = j / c.sampleRate;
      data[start + j] =
        (Math.sin(2 * Math.PI * freq * t) * 0.6 + (Math.random() * 2 - 1) * 0.25) * Math.exp(-t * 220);
    }
  });
  buffers.set('clock', buffer);
  return buffer;
}

interface Room {
  id: FocusAmbient;
  gain: GainNode;
  sources: AudioScheduledSourceNode[];
}

let room: Room | null = null;

function loop(c: AudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
  const source = c.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}

function buildRoom(c: AudioContext, id: Exclude<FocusAmbient, 'none'>, out: GainNode): AudioScheduledSourceNode[] {
  if (id === 'brown') {
    const source = loop(c, noiseBuffer(c, 'brown'));
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    source.connect(filter).connect(out);
    return [source];
  }
  if (id === 'rain') {
    const hiss = loop(c, noiseBuffer(c, 'white'));
    const band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1400;
    band.Q.value = 0.5;
    const hissLevel = c.createGain();
    hissLevel.gain.value = 0.35;
    hiss.connect(band).connect(hissLevel).connect(out);

    const drops = loop(c, dropsBuffer(c));
    const soft = c.createBiquadFilter();
    soft.type = 'lowpass';
    soft.frequency.value = 5000;
    const dropsLevel = c.createGain();
    dropsLevel.gain.value = 0.5;
    drops.connect(soft).connect(dropsLevel).connect(out);
    return [hiss, drops];
  }
  if (id === 'waves') {
    const sea = loop(c, noiseBuffer(c, 'brown'));
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 650;
    const swell = c.createGain();
    swell.gain.value = 0.55;
    // One slow LFO moves both the brightness and the level: a wave rolls in, then draws back.
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.09;
    const toCutoff = c.createGain();
    toCutoff.gain.value = 450;
    const toLevel = c.createGain();
    toLevel.gain.value = 0.4;
    lfo.connect(toCutoff).connect(filter.frequency);
    lfo.connect(toLevel).connect(swell.gain);
    sea.connect(filter).connect(swell).connect(out);
    return [sea, lfo];
  }
  const tick = loop(c, clockBuffer(c));
  const level = c.createGain();
  level.gain.value = 0.55;
  tick.connect(level).connect(out);
  return [tick];
}

/** Starts (or swaps) the loop under the sitting, fading across. `'none'` fades it out. */
export function setAmbient(id: FocusAmbient): void {
  if (room?.id === id) return;
  stopAmbient();
  if (id === 'none') return;
  const a = audio();
  if (!a) return;
  if (!running()) void a.c.resume().catch(() => undefined);
  const gain = a.c.createGain();
  gain.gain.setValueAtTime(0.0001, a.c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.5, a.c.currentTime + 1.5);
  gain.connect(a.out);
  const sources = buildRoom(a.c, id, gain);
  sources.forEach((source) => source.start());
  room = { id, gain, sources };
}

export function stopAmbient(): void {
  if (!room || !ctx) {
    room = null;
    return;
  }
  const { gain, sources } = room;
  const end = ctx.currentTime + 0.6;
  gain.gain.cancelScheduledValues(ctx.currentTime);
  gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  sources.forEach((source) => {
    try {
      source.stop(end + 0.05);
    } catch {
      // Already stopped.
    }
  });
  window.setTimeout(() => gain.disconnect(), 800);
  room = null;
}

export function ambientPlaying(): FocusAmbient {
  return room?.id ?? 'none';
}

/** A short buzz on phones that have one — the end is felt even on silent. */
export function buzz(): void {
  try {
    navigator.vibrate?.([200, 100, 200, 100, 320]);
  } catch {
    // Not everywhere.
  }
}
