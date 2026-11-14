import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type Hls from 'hls.js';
import type { LoaderCallbacks, LoaderContext } from 'hls.js';
import { VIDEO_KEY_NONCE_HEADER, videoKeyMaskMessage } from '@ayman/contracts/video';
import { unwrapVideoKey, videoKeyLoader } from './video-key-loader';

const ID = 'a'.repeat(32);
const KEY = Buffer.alloc(16, 7);

/** What the API's `maskVideoKey` sends — same vector its spec pins. */
function wrapLikeTheApi(nonce: string): ArrayBuffer {
  const mask = createHash('sha256').update(videoKeyMaskMessage(ID, nonce)).digest();
  return Uint8Array.from(KEY, (byte, i) => byte ^ mask[i]!).buffer;
}

describe('unwrapVideoKey', () => {
  it('matches the API vector byte for byte', async () => {
    const wrapped = Buffer.from('7e324a8b18460cd2bdc6fcde7b8d324d', 'hex');
    const out = await unwrapVideoKey(Uint8Array.from(wrapped).buffer, ID, '0'.repeat(32));
    expect(Buffer.from(out)).toEqual(KEY);
  });
});

describe('videoKeyLoader', () => {
  /** A stand-in for hls.js's XhrLoader: records the context, answers with `answer(context)`. */
  function fakeHls(answer: (context: LoaderContext) => ArrayBuffer) {
    const seen: LoaderContext[] = [];
    class Base {
      load(context: LoaderContext, _config: unknown, callbacks: LoaderCallbacks<LoaderContext>) {
        seen.push(context);
        callbacks.onSuccess({ url: context.url, data: answer(context) }, {} as never, context, null);
      }
    }
    return { Hls: { DefaultConfig: { loader: Base } } as unknown as typeof Hls, seen };
  }

  function load(HlsClass: typeof Hls, context: LoaderContext) {
    const Loader = videoKeyLoader(HlsClass);
    const loader = new Loader({} as never);
    return new Promise<ArrayBuffer | string>((resolve, reject) => {
      loader.load(context, {} as never, {
        onSuccess: (response) => resolve(response.data as ArrayBuffer | string),
        onError: (error) => reject(new Error(error.text)),
        onTimeout: () => reject(new Error('timeout')),
      });
    });
  }

  it('sends a fresh nonce for a key on our route and hands hls.js the real key', async () => {
    const { Hls, seen } = fakeHls((context) => wrapLikeTheApi(context.headers![VIDEO_KEY_NONCE_HEADER]!));
    const context = { url: `https://x.com/api/videos/${ID}/key`, responseType: 'arraybuffer', keyInfo: {} } as unknown as LoaderContext;
    const data = await load(Hls, context);
    expect(Buffer.from(data as ArrayBuffer)).toEqual(KEY);
    expect(seen[0]!.headers![VIDEO_KEY_NONCE_HEADER]).toMatch(/^[0-9a-f]{32}$/);
  });

  it('leaves playlists and segments exactly as they were', async () => {
    const body = new Uint8Array([1, 2, 3]).buffer;
    const { Hls, seen } = fakeHls(() => body);
    const context = { url: 'https://video.x.com/abc/0/seg_000.ts', responseType: 'arraybuffer' } as unknown as LoaderContext;
    expect(await load(Hls, context)).toBe(body);
    expect(seen[0]!.headers).toBeUndefined();
  });
});
