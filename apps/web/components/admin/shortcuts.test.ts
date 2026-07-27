import { describe, expect, it } from 'vitest';
import { SHORTCUTS, formatCombo, matchesCombo } from './shortcuts';

describe('SHORTCUTS registry', () => {
  it('has no duplicate ids', () => {
    expect(new Set(SHORTCUTS.map((s) => s.id)).size).toBe(SHORTCUTS.length);
  });

  it('has no two entries bound to the same combo', () => {
    const keys = SHORTCUTS.map(
      (s) => `${s.combo.mod ? 'mod+' : ''}${s.combo.shift ? 'shift+' : ''}${s.combo.key}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every entry a label and a permission', () => {
    for (const shortcut of SHORTCUTS) {
      expect(shortcut.labelAr.length).toBeGreaterThan(0);
      expect(shortcut.permission).toMatch(/^[a-z-]+:[a-z-]+$/);
    }
  });
});

describe('formatCombo', () => {
  it('renders the mac glyph on mac and the word elsewhere', () => {
    expect(formatCombo({ mod: true, key: 'k' }, 'mac')).toEqual(['⌘', 'K']);
    expect(formatCombo({ mod: true, key: 'k' }, 'other')).toEqual(['Ctrl', 'K']);
  });

  it('includes shift when present', () => {
    expect(formatCombo({ mod: true, shift: true, key: 'p' }, 'mac')).toEqual(['⌘', '⇧', 'P']);
  });
});

describe('matchesCombo', () => {
  const event = (init: Partial<KeyboardEvent>) => init as KeyboardEvent;

  it('accepts metaKey on mac-style events and ctrlKey elsewhere', () => {
    expect(
      matchesCombo(event({ key: 'k', metaKey: true, ctrlKey: false, shiftKey: false }), {
        mod: true,
        key: 'k',
      }),
    ).toBe(true);
    expect(
      matchesCombo(event({ key: 'k', metaKey: false, ctrlKey: true, shiftKey: false }), {
        mod: true,
        key: 'k',
      }),
    ).toBe(true);
  });

  it('is case-insensitive on the key', () => {
    expect(
      matchesCombo(event({ key: 'K', metaKey: true, ctrlKey: false, shiftKey: false }), {
        mod: true,
        key: 'k',
      }),
    ).toBe(true);
  });

  it('rejects when shift is required but absent, and vice versa', () => {
    expect(
      matchesCombo(event({ key: 'p', metaKey: true, ctrlKey: false, shiftKey: false }), {
        mod: true,
        shift: true,
        key: 'p',
      }),
    ).toBe(false);
    expect(
      matchesCombo(event({ key: 'k', metaKey: true, ctrlKey: false, shiftKey: true }), {
        mod: true,
        key: 'k',
      }),
    ).toBe(false);
  });
});
