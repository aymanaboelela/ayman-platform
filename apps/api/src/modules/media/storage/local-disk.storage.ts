import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { isValidStorageKey } from '@ayman/contracts/admin/media';
import type { MediaStorage } from './media-storage';

/**
 * A11 — two independent checks, because either alone has been bypassed before:
 *   1. the key must match one of the exact generated shapes
 *      (`isValidStorageKey`: an image key OR a document key), and
 *   2. the resolved absolute path must still sit inside the media root.
 * The second catches anything a future key-shape change lets through — and it
 * is why adding the document shape to the first check did not weaken this.
 */
@Injectable()
export class LocalDiskStorage implements MediaStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolveKey(key: string): string {
    if (!isValidStorageKey(key)) {
      throw new Error(`invalid storage key: ${key.slice(0, 64)}`);
    }
    const resolved = path.resolve(this.root, key);
    if (resolved !== this.root && !resolved.startsWith(this.root + path.sep)) {
      throw new Error('storage key escapes the media root');
    }
    return resolved;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const target = this.resolveKey(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body, { flag: 'wx' }); // wx: never overwrite an existing key
  }

  async getStream(key: string): Promise<Readable> {
    return createReadStream(this.resolveKey(key));
  }

  async stat(key: string): Promise<{ size: number } | null> {
    try {
      const info = await stat(this.resolveKey(key));
      return { size: info.size };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }
}
