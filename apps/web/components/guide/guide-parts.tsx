'use client';

import Image from 'next/image';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { guideCopy, type GuideVoiceKey } from '@ayman/contracts/copy/guide';
import { formatCopy } from '@ayman/contracts/format';
import { IS_AYMAN, aymanOnly, tenantName } from '@/lib/tenant';
import { TEACHES_CODE } from '@/lib/tenant-subject';
import type { GuideFace } from './guide-launcher';
import type { GuideVoice } from './guide-voice';

/**
 * The pieces the dialog, the pill and the helper circle all draw: who is
 * speaking, what they say, and the mascot.
 */

const c = guideCopy;

/**
 * The teacher's name — his on his stack, the deployment's own on any other.
 * `tenantName(copy…)`, never a literal: CLAUDE.md §2 rule 1.
 */
export const TEACHER_NAME = tenantName(copy.site.instructor);

/**
 * The scope attribute every portalled root of the guide carries.
 *
 * `data-cinema` is what `guide.css` hangs the original stack's blue-and-orange
 * ramp and display face on. Inside the student shell `study.css` already sets
 * both, keyed on the shell's presence — but the guide also opens on the
 * marketing pages and beside the register form, where there is no shell, and
 * it has to look like one thing in all three places.
 */
export const GUIDE_SCOPE = { 'data-cinema': IS_AYMAN ? '' : undefined } as const;

/**
 * The teacher's face, or a monogram where the stack has no mark.
 *
 * `sizes` is pinned to the rendered box: the default `100vw` would have the
 * browser fetch a full-width candidate for a circle the size of a thumbnail.
 * Decorative (`alt=""`) — the name is printed beside it wherever it appears.
 */
export function GuideFaceImage({
  face,
  size,
  className,
}: {
  face: GuideFace | null;
  size: number;
  className?: string;
}) {
  if (face === null) {
    return (
      <span className={['guide-face guide-face--mono', className].filter(Boolean).join(' ')} aria-hidden="true">
        {TEACHER_NAME.trim().charAt(0)}
      </span>
    );
  }
  return (
    <Image
      className={['guide-face', className].filter(Boolean).join(' ')}
      src={face.src}
      width={face.width}
      height={face.height}
      sizes={`${size}px`}
      alt=""
    />
  );
}

/**
 * The tour guide on the road — the small dragon, on the original stack only.
 *
 * The dragon is part of HIS platform's identity (the landing scene, `/rank`),
 * so it sits behind `aymanOnly` exactly as `rank-dragon.tsx` gates the same
 * artwork. Any other stack gets a plain marker on the same road: the same
 * position, the same movement, nobody else's mascot.
 */
const DRAGON = aymanOnly({ src: '/rank/dragon-3.webp', width: 297, height: 320 } as const);

export function GuideWalker() {
  if (!DRAGON) return <span className="guide-walker__pin" aria-hidden="true" />;
  return (
    <Image
      className="guide-walker__art"
      src={DRAGON.src}
      width={DRAGON.width}
      height={DRAGON.height}
      sizes="44px"
      alt=""
    />
  );
}

/**
 * A spoken line's text, with the one placeholder the script has filled in.
 *
 * One line is worded for a subject: `stream` asks «البرمجة بندرسها عربي ولا
 * لغات؟». On a stack that teaches something else it is shown in its neutral
 * wording instead — that stack has no recording of it to contradict.
 */
export function lineText(key: GuideVoiceKey): string {
  if (key === 'stream' && !TEACHES_CODE) return c.streamNeutral;
  return formatCopy(c.voice[key], { name: TEACHER_NAME });
}

/**
 * The blue line: what the teacher says at this step, as TEXT, with a play
 * button beside it when a recording exists.
 *
 * The text is the message and is always there; `aria-live="polite"` announces
 * a new line to a screen reader, which is the same thing the voice does for
 * everybody else. The button is drawn only where pressing it can do
 * something — a stack with no clips has no dead play button.
 */
export function SpeechLine({
  id,
  line,
  voice,
}: {
  id?: string;
  line: GuideVoiceKey;
  voice: GuideVoice;
}) {
  const playable = voice.player.canPlay(line);
  const playing = voice.playing === line;

  return (
    <div className="guide-say">
      {playable ? (
        <button
          type="button"
          className="guide-say__play"
          aria-label={playing ? c.stopVoice : c.listen}
          aria-pressed={playing}
          onClick={() => voice.player.toggle(line)}
        >
          {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
        </button>
      ) : null}
      <p id={id} className="guide-say__text" aria-live="polite">
        {lineText(line)}
        {playing ? (
          <span className="guide-wave" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
        ) : null}
      </p>
    </div>
  );
}

/** «كتم الصوت» — only where there is a voice to mute. */
export function MuteButton({ voice, className }: { voice: GuideVoice; className: string }) {
  return (
    <button
      type="button"
      className={className}
      aria-label={voice.muted ? c.unmute : c.mute}
      aria-pressed={voice.muted}
      onClick={() => voice.player.setMuted(!voice.muted)}
    >
      {voice.muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
    </button>
  );
}
