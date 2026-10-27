import { BadRequestException, ConflictException } from '@nestjs/common';
import { SocialPostsService } from './social-posts.service';
import type { Candidate } from './social-sources';

const news = (id: string): Candidate => ({
  sourceKey: `news:${id}`,
  kind: 'news',
  facts: { kind: 'news', title: `خبر ${id}`, excerpt: 'تفاصيل', coverKey: null },
  path: `/news/${id}`,
});

function harness(candidates: Candidate[], existing: string[] = []) {
  const prisma = {
    socialPost: {
      findMany: jest.fn().mockResolvedValue(existing.map((sourceKey) => ({ sourceKey }))),
      createMany: jest.fn().mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const sources = { all: jest.fn().mockResolvedValue(candidates) };
  const connection = {
    row: jest.fn().mockResolvedValue({ hashtags: '#تفوق' }),
    markScanned: jest.fn().mockResolvedValue(undefined),
    channels: jest.fn(),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const storage = { put: jest.fn(), delete: jest.fn().mockResolvedValue(undefined), stat: jest.fn(), getStream: jest.fn() };
  const media = { resolve: (key: string) => `https://media.example.com/media/${key}` };
  const service = new SocialPostsService(
    prisma as never,
    audit as never,
    sources as never,
    connection as never,
    {} as never,
    {} as never,
    storage,
    media,
  );
  return { service, prisma, sources, connection, audit, storage };
}

describe('SocialPostsService.scan — draft generation', () => {
  it('drafts each new event once, with a composed caption and an absolute link', async () => {
    const h = harness([news('a'), news('b')]);
    const result = await h.service.scan(new Date('2026-10-27T10:00:00Z'));

    expect(result).toEqual({ created: 2 });
    const { data, skipDuplicates } = h.prisma.socialPost.createMany.mock.calls[0][0];
    expect(skipDuplicates).toBe(true);
    expect(data.map((row: { sourceKey: string }) => row.sourceKey)).toEqual(['news:a', 'news:b']);
    expect(data[0].link).toMatch(/^https?:\/\/[^/]+\/news\/a$/);
    expect(data[0].caption).toContain('خبر a');
    expect(data[0].caption).toContain('#تفوق');
    expect(data[0].status).toBeUndefined();
    expect(h.connection.markScanned).toHaveBeenCalled();
  });

  it('never drafts an event that already has a row — skipped ones included', async () => {
    const h = harness([news('a'), news('b')], ['news:a']);
    const result = await h.service.scan();
    expect(result).toEqual({ created: 1 });
    const { data } = h.prisma.socialPost.createMany.mock.calls[0][0];
    expect(data.map((row: { sourceKey: string }) => row.sourceKey)).toEqual(['news:b']);
  });

  it('writes nothing when every event is known', async () => {
    const h = harness([news('a')], ['news:a']);
    expect(await h.service.scan()).toEqual({ created: 0 });
    expect(h.prisma.socialPost.createMany).not.toHaveBeenCalled();
  });

  it('reports what the database actually inserted when a racing scan got there first', async () => {
    const h = harness([news('a'), news('b')]);
    h.prisma.socialPost.createMany.mockResolvedValue({ count: 1 });
    expect(await h.service.scan()).toEqual({ created: 1 });
  });
});

describe('SocialPostsService.patch', () => {
  const id = '018f0000-0000-7000-8000-000000000001';

  it('scheduling with a time moves a draft onto the calendar', async () => {
    const h = harness([]);
    h.prisma.socialPost.findUnique.mockResolvedValueOnce({ status: 'draft', scheduledAt: null, format: 'square', imageKey: null });
    jest.spyOn(h.service, 'get').mockResolvedValue({} as never);
    await h.service.patch(id, { scheduledAt: '2026-10-28T17:00:00.000Z' });
    const data = h.prisma.socialPost.update.mock.calls[0][0].data;
    expect(data.status).toBe('scheduled');
    expect(data.scheduledAt).toEqual(new Date('2026-10-28T17:00:00.000Z'));
  });

  it('refuses to schedule without a time', async () => {
    const h = harness([]);
    h.prisma.socialPost.findUnique.mockResolvedValueOnce({ status: 'draft', scheduledAt: null, format: 'square', imageKey: null });
    await expect(h.service.patch(id, { status: 'scheduled' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a format change drops the stale picture, so it cannot be published in the wrong shape', async () => {
    const h = harness([]);
    h.prisma.socialPost.findUnique.mockResolvedValueOnce({
      status: 'scheduled',
      scheduledAt: new Date(),
      format: 'square',
      imageKey: 'sp/018f0000-0000-7000-8000-00000000000a.jpg',
    });
    jest.spyOn(h.service, 'get').mockResolvedValue({} as never);
    await h.service.patch(id, { format: 'story' });
    expect(h.prisma.socialPost.update.mock.calls[0][0].data).toMatchObject({ imageKey: null, imageFormat: null, format: 'story' });
    expect(h.storage.delete).toHaveBeenCalledWith('sp/018f0000-0000-7000-8000-00000000000a.jpg');
  });

  it('never edits a published post', async () => {
    const h = harness([]);
    h.prisma.socialPost.findUnique.mockResolvedValueOnce({ status: 'published', scheduledAt: null, format: 'square', imageKey: null });
    await expect(h.service.patch(id, { caption: 'x' })).rejects.toBeInstanceOf(ConflictException);
  });
});
