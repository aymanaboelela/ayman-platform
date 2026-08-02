import { NotFoundException } from '@nestjs/common';
import { PlayerService } from './player.service';

/**
 * The gate has to run BEFORE storage is touched. "We checked, then read" and
 * "we read, then checked" are indistinguishable from the outside right up
 * until the check has a bug — so these assert on `getStream` never having been
 * called, not merely on the rejection.
 */
describe('PlayerService.resourceStream', () => {
  const access = { require: jest.fn() };
  const prisma = { lessonResource: { findFirst: jest.fn() } };
  const storage = { getStream: jest.fn(), stat: jest.fn() };
  const media = { resolve: jest.fn() };

  // The gate is not exercised here: `access.require` is stubbed wholesale, and
  // these cases are about what happens AFTER it returns.
  const gate = { resolveCourse: jest.fn(), isAvailable: jest.fn() };
  const service = new PlayerService(
    prisma as never,
    access as never,
    gate as never,
    media as never,
    storage as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('goes through the access gate before touching storage', async () => {
    access.require.mockRejectedValue(new NotFoundException());

    await expect(service.resourceStream('u1', 'l1', 'r1')).rejects.toThrow(NotFoundException);
    expect(prisma.lessonResource.findFirst).not.toHaveBeenCalled();
    expect(storage.getStream).not.toHaveBeenCalled();
  });

  it('scopes the lookup to the lesson the gate authorized, not the URL', async () => {
    access.require.mockResolvedValue({ lessonId: 'l1' });
    prisma.lessonResource.findFirst.mockResolvedValue(null);

    await expect(service.resourceStream('u1', 'l1', 'r-other')).rejects.toThrow(NotFoundException);
    expect(prisma.lessonResource.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r-other', lessonId: 'l1' } }),
    );
    expect(storage.getStream).not.toHaveBeenCalled();
  });

  it('404s a video resource — it has no bytes of ours, and must not redirect', async () => {
    access.require.mockResolvedValue({ lessonId: 'l1' });
    prisma.lessonResource.findFirst.mockResolvedValue({
      kind: 'video',
      storageKey: null,
      mime: null,
      filename: null,
    });

    await expect(service.resourceStream('u1', 'l1', 'r1')).rejects.toThrow(NotFoundException);
    expect(storage.getStream).not.toHaveBeenCalled();
  });

  it('404s a link resource for the same reason', async () => {
    access.require.mockResolvedValue({ lessonId: 'l1' });
    prisma.lessonResource.findFirst.mockResolvedValue({
      kind: 'link',
      storageKey: null,
      mime: null,
      filename: null,
    });

    await expect(service.resourceStream('u1', 'l1', 'r1')).rejects.toThrow(NotFoundException);
  });

  it('404s when the row exists but the bytes are gone from storage', async () => {
    access.require.mockResolvedValue({ lessonId: 'l1' });
    prisma.lessonResource.findFirst.mockResolvedValue({
      kind: 'document',
      storageKey: 'doc/ab/x.pdf',
      mime: 'application/pdf',
      filename: 'x.pdf',
    });
    storage.stat.mockResolvedValue(null);

    await expect(service.resourceStream('u1', 'l1', 'r1')).rejects.toThrow(NotFoundException);
    expect(storage.getStream).not.toHaveBeenCalled();
  });

  it('returns our own mime and size, never anything the uploader supplied', async () => {
    access.require.mockResolvedValue({ lessonId: 'l1' });
    prisma.lessonResource.findFirst.mockResolvedValue({
      kind: 'presentation',
      storageKey: 'doc/ab/x.pdf',
      mime: 'application/pdf',
      filename: 'المحاضرة.pdf',
    });
    storage.stat.mockResolvedValue({ size: 4096 });
    const fakeStream = { pipe: jest.fn() };
    storage.getStream.mockResolvedValue(fakeStream);

    const result = await service.resourceStream('u1', 'l1', 'r1');

    expect(result).toEqual({
      stream: fakeStream,
      mime: 'application/pdf',
      filename: 'المحاضرة.pdf',
      // From `stat`, not from the row's own size_bytes: the Content-Length we
      // send has to describe the bytes we are actually about to send.
      size: 4096,
    });
    expect(storage.getStream).toHaveBeenCalledWith('doc/ab/x.pdf');
  });
});
