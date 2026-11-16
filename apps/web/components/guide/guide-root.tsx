'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { helperPlaceOf, isDialogPath } from './guide-gate';
import { GuideDialog } from './guide-dialog';
import { GuideHelper } from './guide-helper';
import { GuidePill } from './guide-pill';
import type { GuideRootProps } from './guide-launcher';
import { readGuideState, writeGuideState, type GuideState } from './guide-state';
import { createVoicePlayer, type GuideVoice, type VoiceAudio } from './guide-voice';
import './guide.css';

/**
 * The guide, once it has been asked for — the entry of the lazily loaded
 * chunk (`guide-launcher.tsx` is the only importer, through `import()`).
 *
 * It owns two things and draws one of three:
 *
 *   · the STATE of the guide in progress, mirrored to `sessionStorage` on
 *     every change so it survives the walk to `/register` and the hard
 *     navigations after it;
 *   · the one voice player, so the dialog and the helper circle share a single
 *     audio element and a single mute switch.
 *
 * and, by where the student is standing:
 *
 *   · beside a form the guide is talking about → the helper circle;
 *   · on a page where the dialog may show       → the dialog, or its pill;
 *   · anywhere else (a lesson, a quiz, a legal page) → nothing at all.
 *
 * Everything it draws is portalled to `<body>`. In the student shell this
 * component sits inside `.route-fade`, whose finished animation leaves a
 * `transform` behind and so becomes the containing block for every
 * `position: fixed` descendant; a pill pinned «to the window» there is pinned
 * to the page and scrolls away with it.
 */
export function GuideRoot({ surface, face, onEnd }: GuideRootProps) {
  const pathname = usePathname();
  const [state, setState] = useState<GuideState | null>(() => readGuideState());
  const voice = useVoice();

  const update = useCallback((next: GuideState | null) => {
    writeGuideState(next);
    setState(next);
  }, []);

  const end = useCallback(() => {
    voice.player.stop();
    update(null);
  }, [update, voice.player]);

  const place = state ? helperPlaceOf(pathname, state.selection.course) : null;

  /*
   * The checkout reported the claim sent and the student has now left that
   * page: the guide's job is over. Over on LEAVING rather than on success, so
   * the closing line stays beside the confirmation for as long as they are
   * reading it. Derived, not stored — there is no second copy of «ended» to
   * fall out of step with the state.
   */
  const live = state !== null && !(state.done && place !== 'checkout') ? state : null;

  // Nothing left in progress (ended, finished, or the tab's storage was
  // cleared under it): clear what is stored and hand the slot back, so the
  // launcher holds nothing and a later page mounts nothing.
  const over = live === null;
  useEffect(() => {
    if (!over) return;
    writeGuideState(null);
    onEnd();
  }, [over, onEnd]);

  // A line must never keep talking over a page it is not about.
  useEffect(() => () => voice.player.stop(), [pathname, voice.player]);

  if (live === null) return null;

  if (place !== null) {
    return (
      <GuideHelper
        key={place}
        place={place}
        surface={surface}
        face={face}
        voice={voice}
        done={live.done}
        onDone={() => update({ ...live, done: true })}
      />
    );
  }

  if (!isDialogPath(surface, pathname)) return null;

  if (!live.open) {
    return (
      <GuidePill
        face={face}
        onOpen={() => {
          // The tap that brings the dialog back is a gesture: the line it
          // opens on may be spoken.
          voice.player.unlock();
          update({ ...live, open: true });
        }}
      />
    );
  }

  return (
    <GuideDialog
      state={live}
      face={face}
      voice={voice}
      onChange={update}
      onMinimise={() => {
        voice.player.stop();
        update({ ...live, open: false });
      }}
      onClose={end}
    />
  );
}

/**
 * The one player for this mount, and its state as React state.
 *
 * Disposed on unmount, which pauses it and drops its `src` so the element
 * holds no decoded clip after the guide is gone.
 */
function useVoice(): GuideVoice {
  // `createAudio` is not called here — the element is made on the first press.
  const [player] = useState(() =>
    createVoicePlayer({
      createAudio: () => new Audio() as unknown as VoiceAudio,
      storage: localStore(),
    }),
  );

  useEffect(() => () => player.dispose(), [player]);

  const snapshot = useSyncExternalStore(player.subscribe, player.snapshot, player.snapshot);
  return useMemo(() => ({ ...snapshot, player }), [snapshot, player]);
}

function localStore(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

