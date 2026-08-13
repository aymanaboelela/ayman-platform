'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { copy } from '@ayman/contracts/copy';

const c = copy.offline;

/**
 * Which of the two failures this actually is.
 *
 * ## The page is precached, so the wording cannot be
 *
 * `sw.js` hands this page back whenever a navigation `fetch` rejects — and it
 * cannot know why. Two very different things reject it:
 *
 *   - the device has no connection, which is what the page has always said; and
 *   - the SERVER is briefly unreachable, which is every deploy window (see the
 *     retry in `sw.js`), and during which the student's connection is perfect.
 *
 * Telling someone on full 4G that their internet is out sends them to reboot a
 * router. `navigator.onLine` is the browser's own answer to the question, read
 * in the browser, on a page whose HTML was baked at install time and is
 * identical for everyone.
 *
 * ## `useSyncExternalStore`, not `useEffect` + `setState`
 *
 * The same device the assistant widget uses for its hydration gate, and for the
 * same two reasons: an effect that immediately re-renders is a commit the
 * student can sometimes see, and `react-hooks/set-state-in-effect` rejects it.
 * Here it also earns its keep — `online`/`offline` are real events, so this is
 * a genuine external store rather than a constant, and the wording corrects
 * itself the moment the radio comes back.
 *
 * The server snapshot is `false` (assume offline). That is the conservative
 * answer for a page whose entire purpose is being shown without a network, and
 * it is what the precached HTML has always said.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

export function OfflineMessage() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => false,
  );

  /*
   * Come back on its own when the connection does.
   *
   * Bound to the `online` EVENT rather than to the value, deliberately: this
   * fires on the transition from offline to online and nowhere else, so a
   * student whose server is down cannot be put in a reload loop — for them
   * `navigator.onLine` was true the whole time and this never runs.
   */
  useEffect(() => {
    const reload = () => window.location.reload();
    window.addEventListener('online', reload);
    return () => window.removeEventListener('online', reload);
  }, []);

  return (
    <div className="space-y-2">
      <h1 className="text-[length:var(--fs-title-3)] font-semibold text-fg">
        {online ? c.serverTitle : c.title}
      </h1>
      <p className="text-[length:var(--fs-text-sm)] leading-relaxed text-fg-muted">
        {online ? c.serverBody : c.body}
      </p>
    </div>
  );
}
