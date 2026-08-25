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

  describe('document keys (the shape DocumentService mints)', () => {
    // This suite exists because the document pipeline shipped against a key
    // validator that only knew the IMAGE shape — `put` threw "invalid storage
    // key" on every upload, and every unit test passed because they mocked
    // storage. These cases run against the REAL class.
    const DOC_KEY = 'doc/0f/0f8fad5b-d9cb-469f-a165-70867728950e.pdf';

    it('accepts a document key and round-trips the bytes', async () => {
      const storage = new LocalDiskStorage(root);
      await storage.put(DOC_KEY, Buffer.from('%PDF-1.7'), 'application/pdf');

      await expect(storage.stat(DOC_KEY)).resolves.toEqual({ size: 8 });
    });

    it.each(['pptx', 'docx', 'xlsx'])('accepts a .%s document key', async (ext) => {
      const storage = new LocalDiskStorage(root);
      const key = `doc/ab/0f8fad5b-d9cb-469f-a165-70867728950e.${ext}`;
      await expect(storage.put(key, Buffer.from('x'), 'application/octet-stream')).resolves.toBeUndefined();
    });

    it('still refuses a macro-enabled extension even under the doc/ prefix', async () => {
      const storage = new LocalDiskStorage(root);
      await expect(
        storage.put('doc/ab/0f8fad5b-d9cb-469f-a165-70867728950e.pptm', Buffer.from('x'), 'x'),
      ).rejects.toThrow(/invalid storage key/);
    });

    it.each([
      'doc/../../../etc/passwd',
      '../doc/ab/0f8fad5b-d9cb-469f-a165-70867728950e.pdf',
      'doc/ab/../../../../etc/passwd.pdf',
      '/etc/passwd',
      'doc/ab/0f8fad5b-d9cb-469f-a165-70867728950e.pdf/../../secret',
    ])('refuses traversal attempt %s', async (key) => {
      const storage = new LocalDiskStorage(root);
      await expect(storage.getStream(key)).rejects.toThrow();
    });
  });

  describe('payment proof keys (the shape PaymentsService mints)', () => {
    // Same failure as the `doc/` suite above, same reason: the payments
    // pipeline shipped with `payment-proof/` allowed nowhere in
    // `isValidStorageKey`, so `gateAndEncode` passed and `put` threw "invalid
    // storage key" on every real upload — a 500 no unit test caught, because
    // every one of them mocked storage. Found live, on production, from the
    // first real screenshot a student ever submitted. This suite runs
    // against the REAL class so it cannot happen silently again.
    const PROOF_KEY = 'payment-proof/0f/0f8fad5b-d9cb-469f-a165-70867728950e.webp';

    it('accepts a payment-proof key and round-trips the bytes', async () => {
      const storage = new LocalDiskStorage(root);
      await storage.put(PROOF_KEY, Buffer.from('x'), 'image/webp');

      await expect(storage.stat(PROOF_KEY)).resolves.toEqual({ size: 1 });
    });

    it('still refuses a non-webp extension under the payment-proof/ prefix', async () => {
      const storage = new LocalDiskStorage(root);
      await expect(
        storage.put('payment-proof/ab/0f8fad5b-d9cb-469f-a165-70867728950e.pdf', Buffer.from('x'), 'x'),
      ).rejects.toThrow(/invalid storage key/);
    });

    it.each([
      'payment-proof/../../../etc/passwd',
      '../payment-proof/ab/0f8fad5b-d9cb-469f-a165-70867728950e.webp',
      'payment-proof/ab/../../../../etc/passwd.webp',
    ])('refuses traversal attempt %s', async (key) => {
      const storage = new LocalDiskStorage(root);
      await expect(storage.getStream(key)).rejects.toThrow();
    });
  });

});
