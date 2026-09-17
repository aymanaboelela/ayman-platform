import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OFFICIAL_PROFILES,
  OFFICIAL_WHATSAPP_CHANNEL,
  OFFICIAL_WHATSAPP_E164,
} from '@ayman/contracts/site-profiles';

/**
 * The fallback the footer and `/links` use when `site_settings.contact` is
 * empty — which is not the rare case it sounds like.
 *
 * `next build` runs inside `docker build` with no API reachable, and both
 * surfaces are prerendered, so `getPublicSettingsOrDefaults()`'s catch bakes
 * `contact: {}` into the shipped image. Whatever this module returns is what
 * the first visitor after every deploy actually sees.
 *
 * Read at module load, so each case resets the registry and re-imports.
 */
const KEYS = [
  'TENANT_KEY',
  'TENANT_YOUTUBE',
  'TENANT_INSTAGRAM',
  'TENANT_TIKTOK',
  'TENANT_FACEBOOK',
  'TENANT_WHATSAPP_CHANNEL',
  'TENANT_WHATSAPP',
] as const;

async function loadWith(env: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(env)) process.env[key] = value;
  vi.resetModules();
  return import('./tenant-contact');
}

let saved: Partial<Record<(typeof KEYS)[number], string | undefined>>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
});

afterEach(() => {
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
});

describe('Ayman’s stack', () => {
  it('renders his six destinations when nothing is configured', async () => {
    // The regression this file exists for: removing the shipped fallback made
    // this an empty object, and the first request after every deploy showed
    // «تابعني» as a heading above an empty list.
    const { TENANT_CONTACT_FALLBACK } = await loadWith({});

    expect(TENANT_CONTACT_FALLBACK).toEqual({
      youtube: OFFICIAL_PROFILES.youtube,
      instagram: OFFICIAL_PROFILES.instagram,
      tiktok: OFFICIAL_PROFILES.tiktok,
      facebook: OFFICIAL_PROFILES.facebook,
      whatsappChannel: OFFICIAL_WHATSAPP_CHANNEL,
      whatsapp: OFFICIAL_WHATSAPP_E164,
    });
  });

  it('has no null anywhere, because a null is an empty row on his site', async () => {
    const { TENANT_CONTACT_FALLBACK } = await loadWith({ TENANT_KEY: 'ayman' });

    expect(Object.values(TENANT_CONTACT_FALLBACK).filter((value) => value === null)).toEqual([]);
  });
});

describe('any other instructor’s stack', () => {
  it('inherits NOTHING — an empty list, never Ayman’s accounts', async () => {
    const { TENANT_CONTACT_FALLBACK } = await loadWith({ TENANT_KEY: 'mohamed-hassan' });

    expect(TENANT_CONTACT_FALLBACK).toEqual({
      youtube: null,
      instagram: null,
      tiktok: null,
      facebook: null,
      whatsappChannel: null,
      whatsapp: null,
    });
  });

  it('uses its own values where it has them, and null where it does not', async () => {
    const { TENANT_CONTACT_FALLBACK } = await loadWith({
      TENANT_KEY: 'x',
      TENANT_YOUTUBE: 'https://www.youtube.com/@x',
      TENANT_WHATSAPP: '+201000000000',
    });

    expect(TENANT_CONTACT_FALLBACK.youtube).toBe('https://www.youtube.com/@x');
    expect(TENANT_CONTACT_FALLBACK.whatsapp).toBe('+201000000000');
    expect(TENANT_CONTACT_FALLBACK.instagram).toBeNull();
  });

  it('never carries Ayman’s number or accounts, however partial the config', async () => {
    const { TENANT_CONTACT_FALLBACK } = await loadWith({
      TENANT_KEY: 'y',
      TENANT_FACEBOOK: 'https://www.facebook.com/y',
    });
    const values = Object.values(TENANT_CONTACT_FALLBACK);

    expect(values).not.toContain(OFFICIAL_WHATSAPP_E164);
    expect(values).not.toContain(OFFICIAL_PROFILES.youtube);
    expect(values).not.toContain(OFFICIAL_WHATSAPP_CHANNEL);
  });

  it('trims, so a value pasted with a newline is still a URL', async () => {
    const { TENANT_CONTACT_FALLBACK } = await loadWith({
      TENANT_KEY: 'x',
      TENANT_TIKTOK: '  https://www.tiktok.com/@x\n',
    });

    expect(TENANT_CONTACT_FALLBACK.tiktok).toBe('https://www.tiktok.com/@x');
  });

  it('treats an empty string as unset, which is what compose actually passes', async () => {
    // `${TENANT_YOUTUBE:-}` substitutes an EMPTY STRING, not an absent key.
    const { TENANT_CONTACT_FALLBACK } = await loadWith({ TENANT_KEY: 'x', TENANT_YOUTUBE: '' });

    expect(TENANT_CONTACT_FALLBACK.youtube).toBeNull();
  });
});
