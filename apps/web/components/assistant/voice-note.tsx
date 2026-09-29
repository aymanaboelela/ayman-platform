'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Mic, Pause, Play } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { cn } from '@ayman/ui/lib/cn';

const c = copy.assistant.chat;

/** How many bars the waveform draws. */
const BARS = 30;

/**
 * Tells every other voice note on the page that this one started — the same
 * courtesy WhatsApp shows: two notes talking over each other is never wanted.
 */
const PLAY_EVENT = 'chat-voice-play';

/** Seconds → `m:ss`, Western digits like every other number on the platform. */
export function voiceClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * A waveform's SHAPE, derived from the file's path — decoration, and honest
 * about it.
 *
 * The real amplitude would mean downloading and decoding every note in the
 * thread the moment it opens, which is exactly what `preload="none"` exists to
 * prevent (see `MessageAttachmentView`). What the bars need to be is stable (the
 * same note looks the same every time) and different from the next note, so
 * they are seeded from something unique to the file. What they MEASURE is the
 * playhead: the bars before it fill in.
 */
export function waveformBars(seed: string, count = BARS): number[] {
  let hash = 5381;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) + hash + seed.charCodeAt(index)) >>> 0;
  }
  const bars: number[] = [];
  for (let index = 0; index < count; index += 1) {
    // xorshift — cheap, deterministic, and spread enough to look like speech.
    hash ^= hash << 13;
    hash >>>= 0;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    hash >>>= 0;
    // A gentle envelope so the ends taper like a real recording does.
    const envelope = 0.55 + 0.45 * Math.sin((Math.PI * (index + 0.5)) / count);
    bars.push(Math.round((0.22 + 0.78 * ((hash % 1000) / 1000) * envelope) * 100) / 100);
  }
  return bars;
}

/**
 * A voice note as a player that belongs in a chat — a round play button, a
 * waveform that fills as it plays, the length beside it.
 *
 * ## Still a real `<audio>`, and still `preload="none"`
 *
 * Only the CHROME is drawn here. Decoding, buffering and codecs stay the
 * browser's, and nothing is fetched until play is pressed — a thread with
 * twenty notes opens exactly as cheaply as it did with the native control.
 *
 * ## Why the length comes from the message
 *
 * `MediaRecorder` writes no duration into a live WebM header, so the element
 * reports `Infinity` until it has read the whole file. The recorder's own
 * count travels with the message (`durationSeconds`) and is what the clock and
 * the scrubber are scaled to; the element's figure is only used when it is a
 * real number.
 *
 * ## Seeking is a range input
 *
 * Laid invisibly over the waveform, so the bars are what a finger drags across
 * and the input is what a keyboard and a screen reader operate — arrow keys,
 * a name, a value — without a single custom key handler.
 */
export function VoiceNote({
  src,
  durationSeconds,
  tone,
}: {
  src: string;
  durationSeconds: number | null;
  tone: 'own' | 'other';
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [measured, setMeasured] = useState<number | null>(null);
  const bars = waveformBars(src);

  const total = durationSeconds ?? measured ?? 0;
  const progress = total > 0 ? Math.min(1, position / total) : 0;

  useEffect(() => {
    function onOtherPlay(event: Event) {
      if ((event as CustomEvent<string>).detail === src) return;
      audioRef.current?.pause();
    }
    window.addEventListener(PLAY_EVENT, onOtherPlay);
    return () => window.removeEventListener(PLAY_EVENT, onOtherPlay);
  }, [src]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: src }));
      // A rejected play() is a browser refusing (no gesture, no codec); the
      // button simply stays on «play», which is the truth.
      void audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }

  function seek(seconds: number) {
    const audio = audioRef.current;
    setPosition(seconds);
    if (audio) audio.currentTime = seconds;
  }

  return (
    <div className={cn('chat-voice', tone === 'own' ? 'chat-voice--own' : 'chat-voice--other')}>
      <button
        type="button"
        onClick={toggle}
        className="chat-voice__play"
        aria-label={playing ? c.voicePause : c.voicePlay}
      >
        {playing ? (
          <Pause className="size-4" aria-hidden="true" fill="currentColor" />
        ) : (
          <Play className="chat-voice__play-icon size-4" aria-hidden="true" fill="currentColor" />
        )}
      </button>

      <div className="chat-voice__track">
        <div className="chat-voice__bars" aria-hidden="true">
          {bars.map((height, index) => (
            <span
              // The index IS the identity: the bars are a pure function of
              // `src` and never reorder.
              key={index}
              className="chat-voice__bar"
              data-on={(index + 0.5) / bars.length <= progress ? 'true' : 'false'}
              style={{ '--chat-bar': height } as CSSProperties}
            />
          ))}
        </div>
        <input
          type="range"
          className="chat-voice__seek"
          min={0}
          max={total > 0 ? total : 1}
          step={0.1}
          value={Math.min(position, total > 0 ? total : 1)}
          disabled={total <= 0}
          onChange={(event) => seek(Number(event.target.value))}
          aria-label={c.voiceSeek}
          aria-valuetext={`${voiceClock(position)} / ${voiceClock(total)}`}
        />
      </div>

      <span className="chat-voice__clock">
        {voiceClock(playing || position > 0 ? position : total)}
      </span>
      <span className="chat-voice__mic" aria-hidden="true">
        <Mic className="size-3.5" />
      </span>

      <audio
        ref={audioRef}
        src={src}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setPosition(0);
        }}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          const duration = event.currentTarget.duration;
          if (Number.isFinite(duration) && duration > 0) setMeasured(duration);
        }}
        className="hidden"
      />
    </div>
  );
}
