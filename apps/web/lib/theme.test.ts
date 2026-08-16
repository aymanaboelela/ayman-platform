import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PREPAINT_SCRIPT } from './security/prepaint-script';
import { applyTheme, getServerTheme, readStoredTheme, setTheme } from './theme';

/**
 * ⚠️ A REAL `localStorage`, installed by hand.
 *
 * Node 22+ ships its own `localStorage` global, and on this runner it is bound
 * without a backing file — so it exists, shadows jsdom's, and every method on
 * it is `undefined`. The symptom is `localStorage.getItem is not a function`
 * inside code that is perfectly correct in a browser.
 */
beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  });
});

/**
 * ⚠️ LIGHT IS THE PLATFORM'S DEFAULT, and every assertion here is about a
 * failure that is INVISIBLE to the person who made it: whoever changes this
 * back is on a light machine, so the platform still comes up light for them
 * while every student with a phone in dark mode gets a dark platform they never
 * asked for. That is exactly what was reported, and exactly what does not turn
 * anything red.
 */
afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('the theme store', () => {
  it('defaults to light with nothing stored', () => {
    expect(readStoredTheme()).toBe('light');
    expect(getServerTheme()).toBe('light');
  });

  it('treats the legacy "system" value as the default rather than as a mode', () => {
    localStorage.setItem('theme', 'system');
    expect(readStoredTheme()).toBe('light');
  });

  it('remembers dark once it is chosen', () => {
    setTheme('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(readStoredTheme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  /* Removing the attribute hands the page back to `prefers-color-scheme`,
     which is the behaviour this store exists to prevent — nearly every themed
     selector in the codebase is `:root:not([data-theme='light'])`. */
  it('always leaves an explicit attribute on the root', () => {
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    setTheme('dark');
    setTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});

describe('the prepaint script', () => {
  const run = () => {
    document.documentElement.removeAttribute('data-theme');
    (0, eval)(PREPAINT_SCRIPT);
    return document.documentElement.getAttribute('data-theme');
  };

  it('stamps light before first paint when nothing is stored', () => {
    expect(run()).toBe('light');
  });

  it('stamps dark for the reader who chose it', () => {
    localStorage.setItem('theme', 'dark');
    expect(run()).toBe('dark');
  });

  it('ignores anything that is not exactly "dark"', () => {
    localStorage.setItem('theme', 'system');
    expect(run()).toBe('light');
  });
});
