import { describe, expect, it } from 'vitest';
import { isApplePlatform } from './platform';

// Real, representative User-Agent strings — not hand-simplified — so the
// regex is exercised against the actual noise (WebKit/Gecko/build tokens)
// a browser really sends, not a sanitised stand-in.
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

// Modern iPadOS (13+) reports as "Macintosh", with no "iPad" substring at
// all — this string is, byte for byte, the same shape as real macOS Safari's
// UA. That's the whole point of this test case: the detector must still
// classify it as Apple despite being indistinguishable from a desktop Mac.
const IPAD_MODERN_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

const MACOS_SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

const MACOS_CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

const WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

describe('isApplePlatform', () => {
  it('recognises an iPhone UA', () => {
    expect(isApplePlatform(IPHONE_UA)).toBe(true);
  });

  it('recognises a modern iPad UA that reports itself as Macintosh', () => {
    expect(isApplePlatform(IPAD_MODERN_UA)).toBe(true);
  });

  it('recognises macOS Safari', () => {
    expect(isApplePlatform(MACOS_SAFARI_UA)).toBe(true);
  });

  it('recognises macOS Chrome (same OS token, different browser)', () => {
    expect(isApplePlatform(MACOS_CHROME_UA)).toBe(true);
  });

  it('rejects Android', () => {
    expect(isApplePlatform(ANDROID_UA)).toBe(false);
  });

  it('rejects Windows', () => {
    expect(isApplePlatform(WINDOWS_UA)).toBe(false);
  });

  it('defaults to false (hidden) for an undefined User-Agent — the SSR case', () => {
    expect(isApplePlatform(undefined)).toBe(false);
  });

  it('defaults to false (hidden) for a null User-Agent', () => {
    expect(isApplePlatform(null)).toBe(false);
  });

  it('defaults to false (hidden) for an empty string', () => {
    expect(isApplePlatform('')).toBe(false);
  });
});
