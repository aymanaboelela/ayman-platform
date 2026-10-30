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

/*
 * A listing page of more than ~500 objects does not parse: each ETag is two
 * XML entities and the SDK's parser stops at 1000 («Entity expansion limit
 * exceeded: 1002 > 1000»). It took down the bucket total, a leftover's size
 * and the delete on every real ladder, so every listing that returns objects
 * must ask for a smaller page — and still walk all of them.
 */
describe('MirrorStorage listings', () => {
  function withPages(pages: number[][]) {
    const storage = new MirrorStorage({
      endpoint: 'https://acct.r2.cloudflarestorage.com',
      bucket: 'ayman-video',
      accessKeyId: 'id',
      secretAccessKey: 'secret',
      publicUrl: 'https://video.example.com',
    } as ConstructorParameters<typeof MirrorStorage>[0]);
    const asked: (number | undefined)[] = [];
    (storage as unknown as { s3: { send: (command: { input: Record<string, unknown> }) => unknown } }).s3 = {
      send: async (command) => {
        if (!('MaxKeys' in command.input) && !('Delimiter' in command.input) && !('ContinuationToken' in command.input)) {
          return {};
        }
        asked.push(command.input.MaxKeys as number | undefined);
        const index = Number(command.input.ContinuationToken ?? 0);
        const sizes = pages[index] ?? [];
        return {
          Contents: sizes.map((Size, i) => ({ Key: `v/x/${index}-${i}.m4s`, Size })),
          IsTruncated: index + 1 < pages.length,
          NextContinuationToken: String(index + 1),
        };
      },
    };
    return { storage, asked };
  }

  it('totals every page of the bucket, never asking for a page the parser refuses', async () => {
    const { storage, asked } = withPages([[1, 2], [3], [4]]);
    expect(await storage.bucketBytes()).toBe(10);
    expect(asked).toHaveLength(3);
    for (const size of asked) expect(size).toBeLessThanOrEqual(500);
  });

  it('sizes and deletes a prefix in small pages too', async () => {
    const usage = withPages([[5], [6]]);
    expect((await usage.storage.prefixUsage('v/x')).bytes).toBe(11);
    const removal = withPages([[1]]);
    await removal.storage.deletePrefix('v/x');
    for (const size of [...usage.asked, ...removal.asked]) expect(size).toBeLessThanOrEqual(500);
  });
});
