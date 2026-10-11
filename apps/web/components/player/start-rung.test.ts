import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { capForWidth, knownBandwidth, readSavedBandwidth, saveBandwidth, startRung } from './start-rung';

const store = new Map<string, string>();
beforeAll(() => {
  // jsdom here has no usable `localStorage` — see `book-order-panel.test.tsx`.
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  });
});
afterEach(() => store.clear());

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

/** hls.js order: lightest first. Averages as our encoder writes them. */
const LADDER = [
  { bitrate: 900_000, averageBitrate: 450_000 }, // 360
  { bitrate: 1_500_000, averageBitrate: 750_000 }, // 480
  { bitrate: 3_000_000, averageBitrate: 1_400_000 }, // 720
  { bitrate: 5_000_000, averageBitrate: 3_700_000 }, // 1080
];

describe('startRung', () => {
  it('opens on the lightest rung when nothing is known', () => {
    expect(startRung(LADDER, null)).toBe(0);
  });

  it('picks the tallest rung whose first six-second segment arrives within a second and a half', () => {
    // 600 kbit/s: even 360 (450k × 6 s = 4.5 s) is over — still the lightest, nothing lighter exists.
    expect(startRung(LADDER, 600_000)).toBe(0);
    // 3 Mbit/s: 480 (0.75 × 6 / 3 = 1.5 s) fits; 720 (2.8 s) does not.
    expect(startRung(LADDER, 3_000_000)).toBe(1);
    // 6 Mbit/s: 720 (1.4 s) fits; 1080 (3.7 s) does not.
    expect(startRung(LADDER, 6_000_000)).toBe(2);
    // 20 Mbit/s: 1080 (1.1 s).
    expect(startRung(LADDER, 20_000_000)).toBe(3);
  });

  it('weighs a rung by its declared peak when the master gives no average', () => {
    expect(startRung([{ bitrate: 900_000 }, { bitrate: 3_000_000 }], 6_000_000)).toBe(0);
    expect(startRung([{ bitrate: 900_000 }, { bitrate: 3_000_000 }], 12_000_000)).toBe(1);
  });

  it('never opens above hls.js\'s player-size cap', () => {
    expect(startRung(LADDER, 20_000_000, 1)).toBe(1);
  });

  it('has only one choice for a lecture published as it is', () => {
    expect(startRung([{ bitrate: 5_000_000, averageBitrate: 3_700_000 }], 20_000_000)).toBe(0);
  });
});

describe('capForWidth', () => {
  const WIDTHS = [{ width: 640 }, { width: 854 }, { width: 1280 }, { width: 1920 }];

  it('stops at the first rung as wide as the player, like hls.js\'s own cap', () => {
    expect(capForWidth(WIDTHS, 390 * 3)).toBe(2); // a phone at 3× — 1170 px
    expect(capForWidth(WIDTHS, 928)).toBe(2);
    expect(capForWidth(WIDTHS, 640)).toBe(0);
    expect(capForWidth(WIDTHS, 2560)).toBe(3);
  });

  it('does not cap at all when the player has no size yet', () => {
    expect(capForWidth(WIDTHS, 0)).toBe(3);
  });
});

describe('knownBandwidth', () => {
  it('knows nothing without the browser\'s hint — every iPhone — even with a measurement saved', () => {
    saveBandwidth(8_000_000, NOW);
    expect(knownBandwidth(undefined, NOW + 1000)).toBeNull();
    expect(knownBandwidth({ downlink: 0 }, NOW + 1000)).toBeNull();
  });

  it('uses the hint, lowered — never raised — by what was measured here', () => {
    expect(knownBandwidth({ downlink: 2.5 }, NOW)).toBe(2_500_000);
    saveBandwidth(1_000_000, NOW);
    expect(knownBandwidth({ downlink: 10 }, NOW + 1000)).toBe(1_000_000);
    // A cache-inflated measurement cannot push the start up.
    saveBandwidth(218_000_000, NOW);
    expect(knownBandwidth({ downlink: 10 }, NOW + 1000)).toBe(10_000_000);
  });
});

describe('the remembered measurement', () => {
  it('round-trips', () => {
    saveBandwidth(8_000_000, NOW);
    expect(readSavedBandwidth(NOW + 1000)).toBe(8_000_000);
  });

  it('forgets a week-old measurement — a different line by now', () => {
    saveBandwidth(8_000_000, NOW);
    expect(readSavedBandwidth(NOW + 8 * DAY)).toBeNull();
  });

  it('ignores anything that is not a measurement', () => {
    saveBandwidth(Number.NaN, NOW);
    saveBandwidth(0, NOW);
    expect(readSavedBandwidth(NOW)).toBeNull();
    store.set('ayman:player:bandwidth', '{not json');
    expect(readSavedBandwidth(NOW)).toBeNull();
    store.set('ayman:player:bandwidth', JSON.stringify({ bps: 1e6, at: NOW + DAY }));
    expect(readSavedBandwidth(NOW)).toBeNull();
  });
});
