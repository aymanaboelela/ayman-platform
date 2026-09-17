import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Forgets the pairing credentials — by emptying the directory, never by
 * removing it.
 *
 * ## ⚠️ `fs.rm(AUTH_DIR, { recursive: true })` DOES NOT WORK HERE, AND FAILS SILENTLY
 *
 * `WA_AUTH_DIR` is `/var/lib/ayman/wa`, which `docker-compose.yml` mounts the
 * `wasession` volume onto — so the directory IS the mount point. `rm` walks
 * top-down: it calls `rmdir` on the target first, and `rmdir` on a mount point
 * returns **EBUSY** whether or not it is empty. Node reports that as a
 * rejection and never descends, so **nothing inside is deleted**.
 *
 * Measured on a real mount, on the exact call the sidecar used to make:
 *
 *     rm REJECTED: EBUSY - rmdir '…/mnt'
 *     dir still exists: true
 *     contents after: ["creds.json","keys"]
 *
 * That rejection was swallowed by a `.catch(() => undefined)`, which is what
 * turned a broken clear into an invisible one. Reported as «مش بيعمل، بيحمل
 * بس»: WhatsApp had revoked the device, every reconnect replayed the same dead
 * credentials, the socket closed 401 before a QR could be issued, and both
 * «اربط رقم جديد» and «امسح البيانات وابدأ من الأول» were powerless to break
 * the cycle because neither of them could actually delete anything. The device
 * page sat at «مفيش رقم مربوط · closed: 401» permanently.
 *
 * Deleting the CHILDREN instead touches no mount point: each entry is an
 * ordinary file or directory on the volume's own filesystem.
 *
 * @param {string} dir  the auth directory (`WA_AUTH_DIR`)
 * @param {object} [io] injected for the test; the real calls by default
 * @param {typeof readdir} [io.readdir]
 * @param {typeof rm} [io.rm]
 * @returns {Promise<{ removed: string[] }>} what it deleted, for the log line
 */
export async function clearAuthDir(dir, io = {}) {
  const { readdir: read = readdir, rm: remove = rm } = io;

  let entries;
  try {
    entries = await read(dir);
  } catch (error) {
    // Never paired on this volume, or the volume is not mounted yet. Either
    // way there are no credentials to forget, which is the caller's goal.
    if (error?.code === 'ENOENT') return { removed: [] };
    throw error;
  }

  // Sequential rather than `Promise.all`: a partial clear is the one outcome
  // worse than a failed one — it can leave `creds.json` behind while the keys
  // it indexes are gone — so the first failure stops the walk and is reported
  // with everything that had already gone, instead of racing the rest.
  const removed = [];
  for (const entry of entries) {
    await remove(join(dir, entry), { recursive: true, force: true });
    removed.push(entry);
  }
  return { removed };
}
