import { parseUserAgent } from './user-agent';

// Real UA strings, not hand-invented ones — copied from browser devtools /
// well-known reference lists, so the regexes are checked against what
// browsers actually send.
const CHROME_MACOS =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SAFARI_MACOS =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15';
const SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1';
const CHROME_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1';
const FIREFOX_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0';
const EDGE_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
const CHROME_ANDROID_MOBILE =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const CHROME_ANDROID_TABLET =
  'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SAFARI_IPAD =
  'Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1';
const CHROME_LINUX =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

describe('parseUserAgent', () => {
  it('labels desktop Chrome on macOS', () => {
    expect(parseUserAgent(CHROME_MACOS)).toEqual({
      deviceName: 'Chrome على macOS',
      deviceType: 'desktop',
    });
  });

  it('labels desktop Safari on macOS, distinguishing it from Chrome', () => {
    expect(parseUserAgent(SAFARI_MACOS)).toEqual({
      deviceName: 'Safari على macOS',
      deviceType: 'desktop',
    });
  });

  it('labels Safari on iOS as mobile', () => {
    expect(parseUserAgent(SAFARI_IOS)).toEqual({
      deviceName: 'Safari على iOS',
      deviceType: 'mobile',
    });
  });

  it('labels Chrome on iOS as Chrome, not Safari, despite sharing the Safari/ token', () => {
    expect(parseUserAgent(CHROME_IOS)).toEqual({
      deviceName: 'Chrome على iOS',
      deviceType: 'mobile',
    });
  });

  it('labels Firefox on Windows', () => {
    expect(parseUserAgent(FIREFOX_WINDOWS)).toEqual({
      deviceName: 'Firefox على Windows',
      deviceType: 'desktop',
    });
  });

  it('labels Edge as Edge, not Chrome, despite sharing the Chrome/ token', () => {
    expect(parseUserAgent(EDGE_WINDOWS)).toEqual({
      deviceName: 'Edge على Windows',
      deviceType: 'desktop',
    });
  });

  it('labels Chrome on Android phone as mobile', () => {
    expect(parseUserAgent(CHROME_ANDROID_MOBILE)).toEqual({
      deviceName: 'Chrome على Android',
      deviceType: 'mobile',
    });
  });

  it('labels Chrome on an Android tablet as tablet, not mobile', () => {
    expect(parseUserAgent(CHROME_ANDROID_TABLET)).toEqual({
      deviceName: 'Chrome على Android',
      deviceType: 'tablet',
    });
  });

  it('labels Safari on iPad as tablet', () => {
    expect(parseUserAgent(SAFARI_IPAD)).toEqual({
      deviceName: 'Safari على iOS',
      deviceType: 'tablet',
    });
  });

  it('labels Chrome on Linux desktop', () => {
    expect(parseUserAgent(CHROME_LINUX)).toEqual({
      deviceName: 'Chrome على Linux',
      deviceType: 'desktop',
    });
  });

  it('falls back to an unknown label for a null/empty user agent', () => {
    expect(parseUserAgent(null)).toEqual({ deviceName: 'جهاز غير معروف', deviceType: 'unknown' });
    expect(parseUserAgent(undefined)).toEqual({
      deviceName: 'جهاز غير معروف',
      deviceType: 'unknown',
    });
    expect(parseUserAgent('')).toEqual({ deviceName: 'جهاز غير معروف', deviceType: 'unknown' });
  });

  it('falls back to unknown browser/OS labels for an unrecognisable string, without throwing', () => {
    expect(parseUserAgent('SomeWeirdBot/1.0')).toEqual({
      deviceName: 'متصفح غير معروف على نظام غير معروف',
      deviceType: 'desktop',
    });
  });
});
