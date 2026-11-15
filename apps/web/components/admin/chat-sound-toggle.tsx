'use client';

import { useSyncExternalStore } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { cn } from '@ayman/ui/lib/cn';
import { isChatSoundOn, setChatSoundOn, subscribeChatSound } from '@/lib/chat-sound';

const c = copy.assistant.inbox;

/** «صوت الرسايل» on/off, for this browser. Turning it on plays the chime once,
 *  so he hears what he just enabled. */
export function ChatSoundToggle() {
  const on = useSyncExternalStore(subscribeChatSound, isChatSoundOn, () => true);
  const label = on ? c.soundOn : c.soundOff;
  return (
    <button
      type="button"
      onClick={() => setChatSoundOn(!on)}
      aria-pressed={on}
      title={label}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[length:var(--fs-text-xs)]',
        'transition-colors duration-[160ms] ease-out',
        on ? 'border-accent/40 bg-accent/10 text-accent-text' : 'border-line text-fg-muted hover:text-fg',
      )}
    >
      {on ? <Volume2 className="size-3.5" aria-hidden="true" /> : <VolumeX className="size-3.5" aria-hidden="true" />}
      {label}
    </button>
  );
}
