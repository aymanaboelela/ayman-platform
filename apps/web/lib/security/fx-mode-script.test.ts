import { afterEach, describe, expect, it, vi } from 'vitest';
import { FX_MODE, FX_VERDICT_TTL_MS, PREPAINT_SCRIPT } from './prepaint-script';
import { decideLite, parseFxMode, type DeviceHints } from '@/lib/weak-device';

/**
 * The prepaint script and `decideLite` are two copies of one rule — one runs
 * before first paint and feeds the stylesheet, the other feeds the hooks — so
 * a page whose CSS is lite while its JS runs full (or the reverse) is exactly
 * what a drift between them would ship. Run the real string over the matrix.
 */
const NOW = 1_800_000_000_000;

function runScript(hints: DeviceHints, mode: string | null, verdict: string | null): boolean {
  document.documentElement.removeAttribute('data-fx');
  window.localStorage.clear();
  if (mode !== null) window.localStorage.setItem('fx:mode', mode);
  if (verdict !== null) window.localStorage.setItem('fx:weak-device', verdict);
  vi.stubGlobal('navigator', hints);
  new Function(FX_MODE)();
  return document.documentElement.getAttribute('data-fx') === 'lite';
}

describe('FX_MODE (prepaint) agrees with decideLite', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-fx');
  });

  const hintCases: DeviceHints[] = [
    {},
    { hardwareConcurrency: 0, deviceMemory: 0 },
    { hardwareConcurrency: 2 },
    { hardwareConcurrency: 4, deviceMemory: 8 },
    { hardwareConcurrency: 6, deviceMemory: 4 },
    { hardwareConcurrency: 8, deviceMemory: 8 },
    { hardwareConcurrency: 16 },
    { hardwareConcurrency: 16, deviceMemory: 8, connection: { saveData: true } },
    { hardwareConcurrency: 16, deviceMemory: 8, connection: { saveData: false } },
  ];
  const modes = [null, 'lite', 'full', 'garbage'];
  const verdicts = [
    null,
    'nonsense',
    String(NOW - 60_000),
    String(NOW - FX_VERDICT_TTL_MS - 1),
    String(NOW + 60_000),
  ];

  it('over every combination of hints, choice and verdict', () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    for (const hints of hintCases) {
      for (const mode of modes) {
        for (const verdict of verdicts) {
          const expected = decideLite({ mode: parseFxMode(mode), hints, verdict, now: NOW });
          expect(runScript(hints, mode, verdict), JSON.stringify({ hints, mode, verdict })).toBe(expected);
        }
      }
    }
  });

  it('a storage that throws still lets the hints decide', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('blocked');
      },
    });
    vi.stubGlobal('navigator', { hardwareConcurrency: 2 });
    new Function(FX_MODE)();
    expect(document.documentElement.getAttribute('data-fx')).toBe('lite');
  });

  it('ships inside the one inline script the layout renders', () => {
    expect(PREPAINT_SCRIPT.endsWith(FX_MODE)).toBe(true);
  });
});
