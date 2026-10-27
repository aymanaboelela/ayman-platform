/**
 * Stops a socket that has been replaced from writing into the auth directory.
 *
 * ## The race this closes
 *
 * `useMultiFileAuthState` hands back an object whose `keys.set` and
 * `saveCreds` write straight into `WA_AUTH_DIR`. Those writes are driven by
 * the SOCKET — pre-key uploads, session ratchets, `creds.update` — and a
 * socket does not stop producing them the instant we decide it is dead.
 *
 * So «اربط رقم تاني» (unlink → clear → link) could go:
 *
 *   1. `/unlink` logs the old session out and empties the directory;
 *   2. the old socket, still draining, flushes a session key or `creds.json`
 *      back into it;
 *   3. `/link` builds a new socket on a directory that now holds half of the
 *      OLD number's credentials — which either resumes the old number or
 *      closes 401 before a QR is ever issued.
 *
 * Step 2 is invisible and timing-dependent, which is the worst kind of
 * "works on the second try". Wrapping every write in a generation check turns
 * a late write from a replaced socket into a no-op, so a clear stays a clear.
 *
 * Reads are not fenced: a stale socket reading is harmless, and refusing it
 * would only make its shutdown noisier.
 *
 * @template {{ keys: { get: Function, set: Function } }} S
 * @param {S} state  the `state` from `useMultiFileAuthState`
 * @param {() => Promise<void>} saveCreds  its `saveCreds`
 * @param {() => boolean} isCurrent  true while this socket is still the live one
 * @returns {{ state: S, saveCreds: () => Promise<void> }}
 */
export function fenceAuthState(state, saveCreds, isCurrent) {
  const keys = state.keys;
  return {
    state: {
      ...state,
      keys: {
        ...keys,
        get: (...args) => keys.get(...args),
        set: async (...args) => {
          if (!isCurrent()) return;
          await keys.set(...args);
        },
      },
    },
    saveCreds: async () => {
      if (!isCurrent()) return;
      await saveCreds();
    },
  };
}
