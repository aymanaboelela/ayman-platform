'use client';

import { useEffect, useRef, useState, type ComponentType, type CSSProperties } from 'react';
import {
  AlarmClock,
  Bell,
  BellOff,
  Clock,
  CloudRain,
  Feather,
  Music,
  Sparkles,
  Volume1,
  Volume2,
  VolumeX,
  Waves,
  Wind,
} from 'lucide-react';
import { engagementCopy } from '@ayman/contracts/copy/engagement';
import {
  FOCUS_ALARMS,
  FOCUS_AMBIENTS,
  playAlarm,
  setAmbient,
  stopAmbient,
  unlockAudio,
  writeSoundPrefs,
  type FocusAlarm,
  type FocusAmbient,
  type FocusSoundPrefs,
  type SoundHandle,
} from './focus-sound';

const c = engagementCopy.focus.sound;

type Icon = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

const ALARM_ICONS: Record<FocusAlarm, Icon> = {
  bell: Bell,
  crystal: Sparkles,
  marimba: Music,
  digital: AlarmClock,
  calm: Feather,
  none: BellOff,
};

const AMBIENT_ICONS: Record<FocusAmbient, Icon> = {
  none: VolumeX,
  rain: CloudRain,
  waves: Waves,
  brown: Wind,
  clock: Clock,
};

/** How long a tile shows it is sounding: about the length of the longest alarm. */
const PREVIEW_MS = 2600;
/** An ambient tapped outside a sitting plays this long, then fades. */
const AMBIENT_PREVIEW_MS = 5000;

/** Four bars that dance while a tile is sounding. Pure CSS; still under reduced motion. */
export function Eq() {
  return (
    <span className="fs-eq" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}

/**
 * The sound panel under the timer: what rings at the end, what plays under the
 * sitting, and how loud. Every tile sounds when it is picked — choosing a
 * sound by its name alone is choosing blind.
 *
 * `live` is true while a sitting runs: the room sound then changes for real
 * instead of previewing, and the parent re-books the alarm.
 */
export function FocusSoundPanel({
  prefs,
  live,
  roomOn,
  onAlarm,
  onAmbient,
}: {
  prefs: FocusSoundPrefs;
  live: boolean;
  /** The room sound is actually playing under a sitting (not muted). */
  roomOn: boolean;
  onAlarm: (alarm: FocusAlarm) => void;
  onAmbient: (ambient: FocusAmbient) => void;
}) {
  const [sounding, setSounding] = useState<string | null>(null);
  const preview = useRef<SoundHandle | null>(null);
  const timer = useRef<number | null>(null);

  // Leaving the page mid-preview must not leave a loop playing.
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      preview.current?.cancel();
    },
    [],
  );

  function settle(key: string, ms: number, after?: () => void): void {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setSounding(key);
    timer.current = window.setTimeout(() => {
      setSounding(null);
      timer.current = null;
      after?.();
    }, ms);
  }

  function pickAlarm(alarm: FocusAlarm): void {
    unlockAudio();
    preview.current?.cancel();
    writeSoundPrefs({ alarm });
    onAlarm(alarm);
    if (alarm === 'none') {
      setSounding(null);
      return;
    }
    preview.current = playAlarm(alarm);
    settle(`alarm:${alarm}`, PREVIEW_MS);
  }

  function pickAmbient(ambient: FocusAmbient): void {
    unlockAudio();
    writeSoundPrefs({ ambient });
    setAmbient(ambient);
    onAmbient(ambient);
    if (live || ambient === 'none') {
      if (timer.current !== null) window.clearTimeout(timer.current);
      setSounding(null);
      return;
    }
    settle(`ambient:${ambient}`, AMBIENT_PREVIEW_MS, () => stopAmbient());
  }

  const VolumeIcon = prefs.volume === 0 ? VolumeX : prefs.volume < 0.5 ? Volume1 : Volume2;

  return (
    <section className="eg-card fs-panel" aria-labelledby="fs-title">
      <header className="fs-panel__head">
        <span className="eg-panel__icon" data-hue="violet" aria-hidden="true">
          <Volume2 className="size-5" />
        </span>
        <h2 id="fs-title" className="eg-card__title">
          {c.title}
        </h2>
        <label className="fs-volume">
          <VolumeIcon className="size-4" aria-hidden={true} />
          <span className="sr-only">{c.volume}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(prefs.volume * 100)}
            style={{ '--fill': `${Math.round(prefs.volume * 100)}%` } as CSSProperties}
            onChange={(event) => writeSoundPrefs({ volume: Number(event.target.value) / 100 })}
            onPointerUp={() => {
              unlockAudio();
              preview.current?.cancel();
              if (prefs.alarm !== 'none') preview.current = playAlarm(prefs.alarm);
            }}
          />
        </label>
      </header>

      <div className="fs-group">
        <div className="fs-group__head">
          <h3 className="fs-group__title">{c.alarm}</h3>
          <p className="fs-group__hint">{c.alarmHint}</p>
        </div>
        <div className="fs-tiles" role="radiogroup" aria-label={c.alarm}>
          {FOCUS_ALARMS.map((alarm) => {
            const Glyph = ALARM_ICONS[alarm];
            const on = sounding === `alarm:${alarm}`;
            return (
              <button
                key={alarm}
                type="button"
                role="radio"
                aria-checked={prefs.alarm === alarm}
                className="fs-tile"
                data-kind="alarm"
                data-sound={alarm}
                data-sounding={on || undefined}
                onClick={() => pickAlarm(alarm)}
              >
                <span className="fs-tile__icon" aria-hidden="true">
                  <Glyph className="size-5" />
                </span>
                <span className="fs-tile__name">{c.alarms[alarm]}</span>
                {on ? <Eq /> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="fs-group">
        <div className="fs-group__head">
          <h3 className="fs-group__title">{c.ambient}</h3>
          <p className="fs-group__hint">{c.ambientHint}</p>
        </div>
        <div className="fs-tiles" role="radiogroup" aria-label={c.ambient}>
          {FOCUS_AMBIENTS.map((ambient) => {
            const Glyph = AMBIENT_ICONS[ambient];
            const on = ambient !== 'none' && (sounding === `ambient:${ambient}` || (roomOn && prefs.ambient === ambient));
            return (
              <button
                key={ambient}
                type="button"
                role="radio"
                aria-checked={prefs.ambient === ambient}
                className="fs-tile"
                data-kind="ambient"
                data-sound={ambient}
                data-sounding={on || undefined}
                onClick={() => pickAmbient(ambient)}
              >
                <span className="fs-tile__icon" aria-hidden="true">
                  <Glyph className="size-5" />
                </span>
                <span className="fs-tile__name">{c.ambients[ambient]}</span>
                {on ? <Eq /> : null}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
