'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { arenaCopy } from '@ayman/contracts/copy/arena';
import type { ArenaPlayer } from '@ayman/contracts/arena';
import { UserAvatar } from '@/components/app/user-avatar';
import type { ArenaSound } from './use-arena-sound';

const c = arenaCopy;

/** ساعة بتدق — الشاشات اللي فيها عدّاد بترندر كل `every` مللي بس وهي ظاهرة. */
export function useNow(every = 250, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(timer);
  }, [every, active]);
  return now;
}

/**
 * اللاعب: الأفاتار نفسه (`User.image` بنفس مكوّن المنصة) جوّه حلقة بلون
 * ناحيته — تيل ليك، وردي للمنافس.
 */
export function Fighter({
  player,
  side,
  size,
  state,
}: {
  player: ArenaPlayer;
  side: 'you' | 'opponent';
  size: number;
  state?: 'thinking' | 'locked' | 'offline' | 'scored';
}) {
  return (
    <span className="ca-fighter" data-side={side} data-state={state} style={{ '--size': `${size}px` } as CSSProperties}>
      <span className="ca-fighter__ring" aria-hidden="true" />
      <UserAvatar name={player.name} image={player.image} size={size} />
    </span>
  );
}

/** شعار الساحة: سيفين متقاطعين في درع — SVG، بيتلوّن بـcurrentColor. */
export function ArenaEmblem({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <path
        d="M32 4 54 12v18c0 14-9.5 24.5-22 30C19.5 54.5 10 44 10 30V12Z"
        fill="currentColor"
        opacity="0.18"
      />
      <path
        d="M32 4 54 12v18c0 14-9.5 24.5-22 30C19.5 54.5 10 44 10 30V12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="m20 18 22 22m-4 0 6 6m-4-10 4-4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M44 18 22 40m4 0-6 6m4-10-4-4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/**
 * حلقة العدّاد. `fraction` من ١ لـ٠، والرقم جوّه بالثواني. آخر ٥ ثواني
 * بتحمر وبتنبض.
 */
export function CountdownRing({
  fraction,
  seconds,
  paused,
  size = 76,
}: {
  fraction: number;
  /** `null` = مفيش عدّ (السؤال اتقفل) — الحلقة من غير رقم. */
  seconds: number | null;
  paused?: boolean;
  size?: number;
}) {
  const radius = 42;
  const length = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, fraction));
  return (
    <span
      className="ca-ring"
      data-urgent={!paused && seconds !== null && seconds <= 5 ? '' : undefined}
      data-paused={paused ? '' : undefined}
      style={{ '--size': `${size}px` } as CSSProperties}
      role="timer"
      aria-live="off"
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="ca-ring__track" cx="50" cy="50" r={radius} />
        <circle
          className="ca-ring__bar"
          cx="50"
          cy="50"
          r={radius}
          strokeDasharray={length}
          strokeDashoffset={length * (1 - clamped)}
        />
      </svg>
      {seconds !== null ? <span className="ca-ring__text">{seconds}</span> : null}
    </span>
  );
}

/** كونفيتي بالـCSS — للفوز بس، ومقفول مع `prefers-reduced-motion`. */
export function Confetti({ pieces = 36 }: { pieces?: number }) {
  return (
    <span className="ca-confetti" aria-hidden="true">
      {Array.from({ length: pieces }, (_, i) => (
        <i
          key={i}
          style={
            {
              '--x': `${(i * 37) % 100}%`,
              '--d': `${(i % 9) * 90}ms`,
              '--r': `${(i * 53) % 360}deg`,
              '--t': String(i % 5),
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

export function SoundButton({ sound }: { sound: ArenaSound }) {
  return (
    <button
      type="button"
      className="ca-icon-btn"
      onClick={() => {
        sound.unlock();
        sound.toggle();
      }}
      aria-pressed={sound.enabled}
      aria-label={sound.enabled ? c.play.soundOn : c.play.soundOff}
      title={sound.enabled ? c.play.soundOn : c.play.soundOff}
    >
      {sound.enabled ? <Volume2 className="size-5" aria-hidden="true" /> : <VolumeX className="size-5" aria-hidden="true" />}
    </button>
  );
}

/** رقم بأرقام لاتيني، معزول عن اتجاه الكلام حواليه. */
export function Num({ value, className }: { value: number | string; className?: string }) {
  return <bdi className={['ca-num', className].filter(Boolean).join(' ')}>{value}</bdi>;
}
