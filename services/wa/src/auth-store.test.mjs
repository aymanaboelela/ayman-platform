import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearAuthDir } from './auth-store.mjs';

/** A directory shaped like a real paired session. */
async function pairedDir() {
  const dir = await mkdtemp(join(tmpdir(), 'wa-auth-'));
  await writeFile(join(dir, 'creds.json'), '{"registered":true}');
  await mkdir(join(dir, 'keys'));
  await writeFile(join(dir, 'keys', 'app-state-sync-key-1.json'), '{}');
  return dir;
}

test('empties the directory', async () => {
  const dir = await pairedDir();
  await clearAuthDir(dir);
  assert.deepEqual(await readdir(dir), []);
});

test('leaves the directory itself in place — it is a mount point', async () => {
  const dir = await pairedDir();
  const { removed } = await clearAuthDir(dir);
  // The whole point: readdir has to still succeed afterwards. If the
  // directory had been removed this would throw ENOENT, and on the server it
  // would have thrown EBUSY long before getting here.
  assert.deepEqual(await readdir(dir), []);
  assert.deepEqual(removed.sort(), ['creds.json', 'keys']);
});

test('removes nested key material, not just the top-level file', async () => {
  const dir = await pairedDir();
  await clearAuthDir(dir);
  await assert.rejects(readdir(join(dir, 'keys')), (error) => error.code === 'ENOENT');
});

test('a directory that was never paired is not an error', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wa-auth-'));
  assert.deepEqual(await clearAuthDir(dir), { removed: [] });
});

test('a missing directory is not an error — the volume may be empty on first boot', async () => {
  const result = await clearAuthDir(join(tmpdir(), 'wa-auth-does-not-exist-9f3a'));
  assert.deepEqual(result, { removed: [] });
});

test('never calls rm on the directory itself', async () => {
  const asked = [];
  await clearAuthDir('/var/lib/ayman/wa', {
    readdir: async () => ['creds.json', 'keys'],
    rm: async (path) => {
      asked.push(path);
    },
  });
  assert.deepEqual(asked, ['/var/lib/ayman/wa/creds.json', '/var/lib/ayman/wa/keys']);
  assert.ok(!asked.includes('/var/lib/ayman/wa'));
});

test('reports what it managed to delete when one entry fails', async () => {
  await assert.rejects(
    clearAuthDir('/var/lib/ayman/wa', {
      readdir: async () => ['creds.json', 'keys'],
      rm: async (path) => {
        if (path.endsWith('keys')) throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
      },
    }),
    (error) => error.code === 'EACCES',
  );
});

test('a read failure that is not ENOENT is surfaced, never swallowed', async () => {
  await assert.rejects(
    clearAuthDir('/var/lib/ayman/wa', {
      readdir: async () => {
        throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
      },
    }),
    (error) => error.code === 'EACCES',
  );
});
