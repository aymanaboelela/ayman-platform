/**
 * HOW the key leaves the API — wrapped for our player, plain for an iPhone,
 * and a 404 for a downloader handed the playlist and a cookie. Asserted on
 * the bytes and the status, not on which helper ran.
 */
import { createHash } from 'node:crypto';
import { HttpException, NotFoundException, type StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { videoKeyMaskMessage } from '@ayman/contracts/video';
import { maskVideoKey } from '../video-mirror/video-key';
import { VideoKeyController } from './video-key.controller';
import type { VideoKeyService } from './video-key.service';
import type { VideoKeyWatchService } from './video-key-watch.service';

const VIDEO = 'a'.repeat(32);
const KEY = Buffer.alloc(16, 7);
const NONCE = '0'.repeat(32);
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36';
const IPHONE = 'AppleCoreMedia/1.0.0.20H71 (iPhone; U; CPU OS 16_7_10 like Mac OS X; en_us)';

function build(watch: Partial<VideoKeyWatchService> = {}) {
  const calls = { key: 0, admit: [] as string[] };
  const controller = new VideoKeyController(
    {
      key: async () => {
        calls.key += 1;
        return KEY;
      },
    } as unknown as VideoKeyService,
    {
      admit: async (userId: string) => {
        calls.admit.push(userId);
      },
      ...watch,
    } as unknown as VideoKeyWatchService,
  );
  return { controller, calls };
}

const response = { setHeader: () => undefined } as unknown as Response;
const student = { id: 'u1', role: 'student' } as never;
const admin = { id: 'a1', role: 'admin' } as never;

async function bytes(file: Promise<StreamableFile>): Promise<Buffer> {
  const stream = (await file).getStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

describe('VideoKeyController', () => {
  it('answers our player with the key wrapped under its nonce — never the key itself', async () => {
    const { controller } = build();
    const out = await bytes(controller.key(student, VIDEO, NONCE, CHROME, response));
    expect(out.equals(KEY)).toBe(false);
    expect(out.toString('hex')).toBe('7e324a8b18460cd2bdc6fcde7b8d324d');
    expect(maskVideoKey(out, VIDEO, NONCE)).toEqual(KEY);
  });

  it('pins the same vector the player spec unwraps', () => {
    const mask = createHash('sha256').update(videoKeyMaskMessage(VIDEO, NONCE)).digest();
    expect(maskVideoKey(KEY, VIDEO, NONCE)).toEqual(Buffer.from(KEY.map((b, i) => b ^ mask[i]!)));
  });

  it('refuses a plain request from a desktop downloader before touching the database', async () => {
    const { controller, calls } = build();
    await expect(controller.key(student, VIDEO, undefined, CHROME, response)).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.key(student, VIDEO, 'not-a-nonce', 'yt-dlp/2026.10.01', response)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(calls.key).toBe(0);
  });

  it('still hands an iPhone that plays HLS itself the plain key (owner\'s call)', async () => {
    const { controller } = build();
    expect(await bytes(controller.key(student, VIDEO, undefined, IPHONE, response))).toEqual(KEY);
  });

  it('counts every key a student takes, and not staff previewing a course', async () => {
    const { controller, calls } = build();
    await bytes(controller.key(student, VIDEO, NONCE, CHROME, response));
    await bytes(controller.key(admin, VIDEO, NONCE, CHROME, response));
    expect(calls.admit).toEqual(['u1']);
  });

  it('passes the watch service\'s 429 through, with no key', async () => {
    const { controller } = build({
      admit: async () => {
        throw new HttpException('too many key requests', 429);
      },
    });
    await expect(controller.key(student, VIDEO, NONCE, CHROME, response)).rejects.toMatchObject({ status: 429 });
  });
});
