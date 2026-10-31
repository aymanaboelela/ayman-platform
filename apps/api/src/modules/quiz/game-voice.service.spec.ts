import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { NotFoundException } from '@nestjs/common';
import { LocalDiskStorage } from '../media/storage/local-disk.storage';
import type { MediaStorage } from '../media/storage/media-storage';
import type { PrismaService } from '../../prisma/prisma.service';
import type { GameService } from './game.service';
import { GameVoiceService } from './game-voice.service';
import { introText, libraryKey, textOf } from './game-voice.text';

/**
 * The recorded library is read before Azure, and with no Azure key at all —
 * that is the whole point of recording it: playing his voice never calls a
 * vendor. Both sides must agree on the key, which is why it is derived from
 * the screen text in one shared module.
 */
describe('GameVoiceService — recorded library', () => {
  const stemHtml = '<p>What is <b>HTTPS</b>?</p>';
  const files = new Map<string, Buffer>();
  const storage = {
    stat: jest.fn(async (key: string) => (files.has(key) ? { size: files.get(key)!.length } : null)),
    getStream: jest.fn(async (key: string) => Readable.from(files.get(key)!)),
    put: jest.fn(),
  } as unknown as MediaStorage;
  const prisma = {
    questionVersion: { findUnique: jest.fn(async () => ({ stemHtml })) },
    questionOption: { findFirst: jest.fn(async () => null) },
  } as unknown as PrismaService;
  const game = { assertDealtOrInPool: jest.fn(async () => undefined) } as unknown as GameService;
  const service = new GameVoiceService(prisma, game, storage);
  const fetchSpy = jest.spyOn(global, 'fetch');

  const read = async (stream: Readable) => {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString();
  };

  beforeEach(() => {
    files.clear();
    fetchSpy.mockClear();
    delete process.env.AZURE_SPEECH_KEY;
    delete process.env.AZURE_SPEECH_REGION;
    delete process.env.GAME_VOICE_LIBRARY;
  });

  it('plays the recorded stem from storage, keyed on the screen text, with no Azure key', async () => {
    files.set(libraryKey('What is HTTPS ?'), Buffer.from('his voice'));
    expect(textOf(stemHtml)).toBe('What is HTTPS ?');
    await expect(read(await service.clip('u1', 'q1', 'stem'))).resolves.toBe('his voice');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('plays the host intro for question n', async () => {
    files.set(libraryKey(introText(1)), Buffer.from('intro one'));
    await expect(read(await service.clip('u1', 'q1', 'intro-1'))).resolves.toBe('intro one');
  });

  it('an English question asks for letter-en-<n>, and gets the recorded A, not «أ»', async () => {
    files.set(libraryKey('A'), Buffer.from('letter A'));
    files.set(libraryKey('أ'), Buffer.from('letter alef'));
    await expect(read(await service.clip('u1', 'q1', 'letter-en-0'))).resolves.toBe('letter A');
    await expect(read(await service.clip('u1', 'q1', 'letter-0'))).resolves.toBe('letter alef');
    await expect(service.clip('u1', 'q1', 'letter-en-9')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a question nobody recorded is a 404, so the browser reads it — not a call to a vendor', async () => {
    await expect(service.clip('u1', 'q1', 'stem')).rejects.toBeInstanceOf(NotFoundException);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a recorded clip on the REAL disk storage is found — its key is a valid storage key', async () => {
    // The mock above accepts any key; the real `LocalDiskStorage` throws on a
    // shape `isValidStorageKey` does not know, `stat()` swallows it, and every
    // clip 404'd on prod while the files sat on the volume.
    const root = mkdtempSync(path.join(tmpdir(), 'game-voice-'));
    const key = libraryKey('What is HTTPS ?');
    mkdirSync(path.join(root, path.dirname(key)), { recursive: true });
    writeFileSync(path.join(root, key), 'his voice on disk');
    const disk = new GameVoiceService(prisma, game, new LocalDiskStorage(root));
    await expect(read(await disk.clip('u1', 'q1', 'stem'))).resolves.toBe('his voice on disk');
    rmSync(root, { recursive: true, force: true });
  });

  it('GAME_VOICE_LIBRARY=off turns the library off', async () => {
    process.env.GAME_VOICE_LIBRARY = 'off';
    files.set(libraryKey('What is HTTPS ?'), Buffer.from('his voice'));
    await expect(service.clip('u1', 'q1', 'stem')).rejects.toBeInstanceOf(NotFoundException);
  });
});
