import { describe, expect, it } from 'vitest';
import { isLegacyNativeHlsClient, videoIdFromKeyUri, videoKeyMaskMessage, VIDEO_KEY_NONCE_RE } from './video';

const ID = 'a'.repeat(32);

describe('the wrapped video key contract', () => {
  it('pins the mask message both sides hash — changing it breaks every player in the field', () => {
    expect(videoKeyMaskMessage(ID, '0'.repeat(32))).toBe(`ayman:video-key-mask:v1:${ID}:${'0'.repeat(32)}`);
  });

  it('reads the video id out of the key URI the pipeline writes, and nothing else', () => {
    expect(videoIdFromKeyUri(`https://x.com/api/videos/${ID}/key`)).toBe(ID);
    expect(videoIdFromKeyUri(`/api/videos/${ID}/key?x=1`)).toBe(ID);
    expect(videoIdFromKeyUri(`https://x.com/api/videos/${ID}/keys`)).toBeNull();
    expect(videoIdFromKeyUri('https://video.x.com/abc/0/seg_000.ts')).toBeNull();
  });

  it('accepts only a 32-hex nonce', () => {
    expect(VIDEO_KEY_NONCE_RE.test('0'.repeat(32))).toBe(true);
    expect(VIDEO_KEY_NONCE_RE.test('0'.repeat(31))).toBe(false);
    expect(VIDEO_KEY_NONCE_RE.test('Z'.repeat(32))).toBe(false);
  });

  it('lets an iPhone (Safari or its media stack) through unwrapped, and not a desktop downloader', () => {
    expect(isLegacyNativeHlsClient('AppleCoreMedia/1.0.0.20H71 (iPhone; U; CPU OS 16_7_10 like Mac OS X; en_us)')).toBe(true);
    expect(
      isLegacyNativeHlsClient('Mozilla/5.0 (iPhone; CPU iPhone OS 16_7 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'),
    ).toBe(true);
    expect(isLegacyNativeHlsClient('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36')).toBe(false);
    expect(isLegacyNativeHlsClient('yt-dlp/2026.10.01')).toBe(false);
    expect(isLegacyNativeHlsClient(undefined)).toBe(false);
  });
});
