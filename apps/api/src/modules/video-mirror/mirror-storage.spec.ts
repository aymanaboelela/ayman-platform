/**
 * The pre-signed part URLs must live on the ENDPOINT's own host — the one
 * origin the web CSP allows for uploads. A bucket-in-the-host URL is blocked
 * by the browser before it leaves, and reads exactly like a network failure.
 */
import { MirrorStorage } from './mirror-storage';

describe('MirrorStorage pre-signed URLs', () => {
  it('are path-style, on the configured endpoint host', async () => {
    const endpoint = 'https://acct.r2.cloudflarestorage.com';
    const storage = new MirrorStorage({
      endpoint,
      bucket: 'ayman-video',
      accessKeyId: 'id',
      secretAccessKey: 'secret',
      publicUrl: 'https://video.example.com',
    } as ConstructorParameters<typeof MirrorStorage>[0]);

    const [part] = await storage.presignPartNumbers('raw/a/source', 'upload-1', [1], 60);
    const url = new URL(part!.url);
    expect(url.origin).toBe(endpoint);
    expect(url.pathname.startsWith('/ayman-video/raw/a/source')).toBe(true);
  });
});
