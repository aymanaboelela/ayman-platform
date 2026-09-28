'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Cloudflare Turnstile, for the register form.
 *
 * ## Asked for at submit, not on page load
 *
 * `execution: 'execute'` renders the widget without running it; `getToken()`
 * runs it when the student presses «إنشاء حساب». A token minted on load would
 * be five minutes old by the time a slow typist submits — Turnstile tokens
 * expire after 300 s and are single-use — and the request would fail for a
 * reason the student cannot see.
 *
 * `appearance: 'interaction-only'` keeps it invisible for almost everyone;
 * the box only appears when Cloudflare actually wants a click. That matters
 * here: a permanent checkbox under the form reads as unfinished.
 *
 * ## No key, no widget
 *
 * `siteKey` null means the stack has no Turnstile configured (the default).
 * Nothing loads, `getToken()` resolves to null, and the form behaves exactly
 * as it always did — the API does not check either.
 */

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  execute(widgetId: string): void;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('no turnstile')));
    script.onerror = () => {
      // Let a later attempt try again rather than caching the failure forever.
      scriptPromise = null;
      reject(new Error('turnstile failed to load'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function useTurnstile(siteKey: string | null | undefined) {
  // State, not a ref, so the hook hands back a plain callback: a returned ref
  // object makes the React compiler treat everything the form does with this
  // hook as reading a ref during render.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const widgetRef = useRef<string | null>(null);
  const pendingRef = useRef<{ resolve: (token: string) => void; reject: (error: Error) => void } | null>(
    null,
  );

  useEffect(() => {
    if (!siteKey || !container) return;
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || widgetRef.current) return;
        widgetRef.current = api.render(container, {
          sitekey: siteKey,
          execution: 'execute',
          appearance: 'interaction-only',
          language: 'ar',
          callback: (token: string) => {
            pendingRef.current?.resolve(token);
            pendingRef.current = null;
          },
          'error-callback': () => {
            pendingRef.current?.reject(new Error('turnstile error'));
            pendingRef.current = null;
          },
          'expired-callback': () => {
            if (widgetRef.current) api.reset(widgetRef.current);
          },
        });
      })
      .catch(() => {
        // Surfaced at submit: `getToken()` rejects and the form says so.
      });
    return () => {
      cancelled = true;
      if (widgetRef.current && window.turnstile) window.turnstile.remove(widgetRef.current);
      widgetRef.current = null;
    };
  }, [siteKey, container]);

  /** A fresh token, or null when the stack has no Turnstile. Rejects on failure. */
  const getToken = useCallback(async (): Promise<string | null> => {
    if (!siteKey) return null;
    const api = await loadTurnstile();
    const widgetId = widgetRef.current;
    if (!widgetId) throw new Error('turnstile not ready');
    return new Promise<string>((resolve, reject) => {
      // A widget that waits for a click nobody gives would leave the submit
      // button spinning forever; a minute is long enough to solve one.
      const timer = setTimeout(() => {
        pendingRef.current = null;
        reject(new Error('turnstile timed out'));
      }, 60_000);
      pendingRef.current = {
        resolve: (token) => {
          clearTimeout(timer);
          resolve(token);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };
      // A widget that already produced a token must be reset before it can
      // produce another; on a fresh one this is a no-op.
      api.reset(widgetId);
      api.execute(widgetId);
    });
  }, [siteKey]);

  /** Tokens are single-use: after any attempt, the next submit needs a new one. */
  const reset = useCallback(() => {
    if (widgetRef.current && window.turnstile) window.turnstile.reset(widgetRef.current);
  }, []);

  return { setContainer, getToken, reset };
}
