import type Hls from 'hls.js';
import type { HlsConfig, Loader, LoaderCallbacks, LoaderConfiguration, LoaderContext } from 'hls.js';
import { VIDEO_KEY_NONCE_HEADER, videoIdFromKeyUri, videoKeyMaskMessage } from '@ayman/contracts/video';

/**
 * The client half of the wrapped key — see `videoKeyMaskMessage` in contracts
 * for why the key route no longer answers a plain request.
 *
 * hls.js fetches an AES-128 key through `config.loader` with a context that
 * carries `keyInfo`; playlists and segments go through the same class without
 * it and are passed through untouched. For a key on OUR route, this adds a
 * fresh nonce header and unwraps the answer before hls.js ever sees it, so
 * the decryptor gets the real 16 bytes and nothing else in the player changes.
 */

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** XOR `wrapped` with SHA-256(mask message)[0..16]. Its own inverse. */
export async function unwrapVideoKey(wrapped: ArrayBuffer, videoId: string, nonce: string): Promise<ArrayBuffer> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(videoKeyMaskMessage(videoId, nonce))),
  );
  const input = new Uint8Array(wrapped);
  const out = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i += 1) out[i] = input[i]! ^ digest[i]!;
  return out.buffer;
}

export function newNonce(): string {
  return hex(crypto.getRandomValues(new Uint8Array(16)));
}

type LoaderClass = new (config: HlsConfig) => Loader<LoaderContext>;

/**
 * `config.loader` for every hls.js instance that may play an uploaded lecture.
 * Built from the imported module because hls.js itself is loaded lazily — the
 * base class does not exist until `import('hls.js')` resolves.
 */
export function videoKeyLoader(HlsClass: typeof Hls): LoaderClass {
  const Base = HlsClass.DefaultConfig.loader as LoaderClass;

  return class VideoKeyLoader extends Base {
    override load(context: LoaderContext, config: LoaderConfiguration, callbacks: LoaderCallbacks<LoaderContext>): void {
      const videoId = 'keyInfo' in context ? videoIdFromKeyUri(context.url) : null;
      if (videoId === null) {
        super.load(context, config, callbacks);
        return;
      }

      const nonce = newNonce();
      context.headers = { ...context.headers, [VIDEO_KEY_NONCE_HEADER]: nonce };
      super.load(context, config, {
        ...callbacks,
        onSuccess: (response, stats, ctx, details) => {
          if (!(response.data instanceof ArrayBuffer)) {
            callbacks.onError({ code: 0, text: 'key response was not binary' }, ctx, details, stats);
            return;
          }
          unwrapVideoKey(response.data, videoId, nonce)
            .then((data) => callbacks.onSuccess({ ...response, data }, stats, ctx, details))
            .catch(() => callbacks.onError({ code: 0, text: 'key unwrap failed' }, ctx, details, stats));
        },
      });
    }
  };
}
