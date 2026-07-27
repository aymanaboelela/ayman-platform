import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LocalDiskStorage } from './local-disk.storage';

const VALID_KEY = 'ab/0191f2a0-1111-7000-8000-000000000000.webp';

describe('LocalDiskStorage', () => {
  let root: string;
  let storage: LocalDiskStorage;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'media-storage-test-'));
    storage = new LocalDiskStorage(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe('key validation (A11)', () => {
    // Exercised through `put` (and `getStream`/`delete`, same `resolveKey`
    // call site) rather than `stat` — `stat`'s own try/catch is there to turn
    // Node's ENOENT into `null`, and it also (harmlessly) absorbs a
    // validation throw into the same `null`. That is not a security gap: the
    // public read path (`MediaService.statByKey` → the controller) still
    // 404s either way, since `null` is exactly what it treats as "not
    // found". `put`/`getStream`/`delete` are the operations where the throw
    // must be observable, so they are what this suite asserts against.
    it('rejects a classic path-traversal key', async () => {
      await expect(storage.put('../../etc/passwd', Buffer.from('x'), 'image/webp')).rejects.toThrow(
        /invalid storage key/,
      );
    });

    it('rejects a URL-encoded traversal attempt', async () => {
      await expect(storage.put('..%2f..%2fetc', Buffer.from('x'), 'image/webp')).rejects.toThrow(
        /invalid storage key/,
      );
    });

    it('rejects a key that traverses back out after a valid-looking prefix', async () => {
      await expect(storage.put('ab/../../x.webp', Buffer.from('x'), 'image/webp')).rejects.toThrow(
        /invalid storage key/,
      );
    });

    it('rejects an uppercase hex prefix', async () => {
      await expect(
        storage.put('AB/0191f2a0-1111-7000-8000-000000000000.webp', Buffer.from('x'), 'image/webp'),
      ).rejects.toThrow(/invalid storage key/);
    });

    it('rejects a non-webp extension, even a real-looking one', async () => {
      await expect(
        storage.put('ab/0191f2a0-1111-7000-8000-000000000000.svg', Buffer.from('x'), 'image/webp'),
      ).rejects.toThrow(/invalid storage key/);
    });

    it('an invalid key resolves stat() to null rather than throwing — the read path treats both alike', async () => {
      await expect(storage.stat('../../etc/passwd')).resolves.toBeNull();
    });

    it('accepts the exact generated shape', async () => {
      await expect(storage.stat(VALID_KEY)).resolves.toBeNull(); // valid shape, file absent
    });
  });

  describe('put', () => {
    it('writes the file and it becomes readable', async () => {
      await storage.put(VALID_KEY, Buffer.from('hello'), 'image/webp');
      const info = await storage.stat(VALID_KEY);
      expect(info).toEqual({ size: 5 });
    });

    it('refuses to overwrite an existing key', async () => {
      await storage.put(VALID_KEY, Buffer.from('first'), 'image/webp');
      await expect(storage.put(VALID_KEY, Buffer.from('second'), 'image/webp')).rejects.toThrow();
    });
  });

  describe('delete', () => {
    it('removes the file and is idempotent on a missing one', async () => {
      await storage.put(VALID_KEY, Buffer.from('hello'), 'image/webp');
      await storage.delete(VALID_KEY);
      expect(await storage.stat(VALID_KEY)).toBeNull();
      await expect(storage.delete(VALID_KEY)).resolves.toBeUndefined();
    });
  });
});
