import { copy } from '@ayman/contracts/copy/admin';
import { ADMIN_NAV } from './nav-items';

export interface Combo {
  mod?: boolean;
  shift?: boolean;
  key: string;
}

export interface Shortcut {
  id: string;
  labelAr: string;
  combo: Combo;
  group: 'navigate' | 'act';
  href?: string;
  permission: string;
}

/**
 * ONE registry, read by BOTH the palette (which renders each combo in a
 * `<Kbd>`) and the global key handler (which fires it). Two lists would
 * drift, and the symptom — a palette advertising a shortcut that does
 * nothing — is worse than no shortcut at all.
 */
export const SHORTCUTS: readonly Shortcut[] = [
  {
    id: 'nav.students',
    labelAr: copy.admin.nav.students,
    combo: { mod: true, shift: true, key: 's' },
    group: 'navigate',
    href: '/admin/students',
    permission: 'student:read',
  },
  {
    id: 'nav.attempts',
    labelAr: copy.admin.nav.attempts,
    combo: { mod: true, shift: true, key: 'a' },
    group: 'navigate',
    href: '/admin/attempts',
    permission: 'attempt:read',
  },
  {
    id: 'nav.taxonomy',
    labelAr: copy.admin.nav.taxonomy,
    combo: { mod: true, shift: true, key: 't' },
    group: 'navigate',
    href: '/admin/taxonomy',
    permission: 'taxonomy:read',
  },
  {
    id: 'nav.home',
    labelAr: copy.admin.nav.home,
    combo: { mod: true, shift: true, key: 'h' },
    group: 'navigate',
    href: '/admin/home',
    permission: 'home:read',
  },
  {
    id: 'nav.media',
    labelAr: copy.admin.nav.media,
    combo: { mod: true, shift: true, key: 'm' },
    group: 'navigate',
    href: '/admin/media',
    permission: 'media:read',
  },
  {
    id: 'nav.flags',
    labelAr: copy.admin.nav.flags,
    combo: { mod: true, shift: true, key: 'f' },
    group: 'navigate',
    href: '/admin/flags',
    permission: 'flags:read',
  },
  {
    id: 'nav.audit',
    labelAr: copy.admin.nav.audit,
    combo: { mod: true, shift: true, key: 'l' },
    group: 'navigate',
    href: '/admin/audit',
    permission: 'audit:read',
  },
  {
    id: 'act.newNavItem',
    labelAr: copy.admin.shortcuts.newNavItem,
    combo: { mod: true, shift: true, key: 'n' },
    group: 'act',
    href: '/admin/navigation',
    permission: 'nav:write',
  },
  {
    id: 'act.upload',
    labelAr: copy.admin.shortcuts.upload,
    combo: { mod: true, shift: true, key: 'u' },
    group: 'act',
    href: '/admin/media',
    permission: 'media:write',
  },
] as const;

const MAC_GLYPHS: Record<string, string> = { mod: '⌘', shift: '⇧' };
const OTHER_WORDS: Record<string, string> = { mod: 'Ctrl', shift: 'Shift' };

export function formatCombo(combo: Combo, platform: 'mac' | 'other'): string[] {
  const table = platform === 'mac' ? MAC_GLYPHS : OTHER_WORDS;
  const parts: string[] = [];
  if (combo.mod) parts.push(table.mod!);
  if (combo.shift) parts.push(table.shift!);
  parts.push(combo.key.toUpperCase());
  return parts;
}

/**
 * `mod` matches metaKey OR ctrlKey — one registry serves both platforms.
 * Comparison is on `event.key` lowercased, not `event.code`: `code` reports
 * the physical key, so on an Arabic keyboard layout the user pressing the
 * key labelled S would fail a `KeyS` comparison.
 */
export function matchesCombo(event: KeyboardEvent, combo: Combo): boolean {
  const modPressed = event.metaKey || event.ctrlKey;
  if (Boolean(combo.mod) !== modPressed) return false;
  if (Boolean(combo.shift) !== event.shiftKey) return false;
  return event.key.toLowerCase() === combo.key.toLowerCase();
}

/** Palette + global-handler entries a given session may actually use. */
export function visibleShortcuts(permissions: readonly string[]): Shortcut[] {
  return SHORTCUTS.filter((shortcut) => permissions.includes(shortcut.permission));
}

export { ADMIN_NAV };
