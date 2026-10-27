import { ConflictException } from '@nestjs/common';
import { GraphApiError, type MetaGraphClient, type PublishedRef } from './meta-graph.client';
import { MAX_AUTO_ATTEMPTS, SocialPublisherService, publishToChannels, type PublishablePost } from './social-publisher.service';
import type { PublishTarget } from './social-connection.service';

const target: PublishTarget = { pageId: '123', instagramUserId: '777', token: 'T' };

const basePost: PublishablePost = {
  id: '018f0000-0000-7000-8000-000000000001',
  format: 'square',
  caption: 'مبروك',
  imageKey: 'sp/018f0000-0000-7000-8000-00000000000a.jpg',
  imageFormat: 'square',
  facebookPostId: null,
  instagramMediaId: null,
};

function fakeGraph(overrides: Partial<Record<'facebookPhoto' | 'facebookStory' | 'instagramMedia', jest.Mock>> = {}) {
  const ok = (id: string): PublishedRef => ({ id, permalink: `https://example.com/${id}` });
  return {
    facebookPhoto: overrides.facebookPhoto ?? jest.fn().mockResolvedValue(ok('fb-1')),
    facebookStory: overrides.facebookStory ?? jest.fn().mockResolvedValue({ id: 'fb-story', permalink: null }),
    instagramMedia: overrides.instagramMedia ?? jest.fn().mockResolvedValue(ok('ig-1')),
    pageInfo: jest.fn(),
  };
}

describe('publishToChannels', () => {
  it('posts to both channels and is complete', async () => {
    const graph = fakeGraph();
    const outcome = await publishToChannels(graph as unknown as MetaGraphClient, basePost, 'https://m/sp/x.jpg', target);
    expect(outcome.complete).toBe(true);
    expect(outcome.facebook?.id).toBe('fb-1');
    expect(outcome.instagram?.id).toBe('ig-1');
    expect(graph.facebookPhoto).toHaveBeenCalledWith(expect.objectContaining({ caption: 'مبروك', imageUrl: 'https://m/sp/x.jpg' }));
  });

  it('keeps what succeeded when one channel fails, and is not complete', async () => {
    const graph = fakeGraph({ instagramMedia: jest.fn().mockRejectedValue(new GraphApiError('media not ready')) });
    const outcome = await publishToChannels(graph as unknown as MetaGraphClient, basePost, 'u', target);
    expect(outcome.complete).toBe(false);
    expect(outcome.facebook?.id).toBe('fb-1');
    expect(outcome.error).toBe('Instagram: media not ready');
  });

  it('never posts to a channel twice: a retry skips the one that already has an id', async () => {
    const graph = fakeGraph();
    const outcome = await publishToChannels(
      graph as unknown as MetaGraphClient,
      { ...basePost, facebookPostId: 'fb-earlier' },
      'u',
      target,
    );
    expect(graph.facebookPhoto).not.toHaveBeenCalled();
    expect(graph.instagramMedia).toHaveBeenCalledTimes(1);
    expect(outcome.complete).toBe(true);
  });

  it('publishes a story through the story calls', async () => {
    const graph = fakeGraph();
    await publishToChannels(graph as unknown as MetaGraphClient, { ...basePost, format: 'story', imageFormat: 'story' }, 'u', target);
    expect(graph.facebookStory).toHaveBeenCalled();
    expect(graph.facebookPhoto).not.toHaveBeenCalled();
    expect(graph.instagramMedia).toHaveBeenCalledWith(expect.objectContaining({ story: true }));
  });

  it('a Page without Instagram is complete after Facebook alone', async () => {
    const graph = fakeGraph();
    const outcome = await publishToChannels(graph as unknown as MetaGraphClient, basePost, 'u', { ...target, instagramUserId: null });
    expect(graph.instagramMedia).not.toHaveBeenCalled();
    expect(outcome.complete).toBe(true);
  });
});

function harness(options: { claimed?: number; target?: PublishTarget | null; due?: Array<{ id: string }> } = {}) {
  const prisma = {
    socialPost: {
      updateMany: jest.fn().mockResolvedValue({ count: options.claimed ?? 1 }),
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue({ id: basePost.id }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ ...basePost, attempts: 0 }),
      findMany: jest.fn().mockResolvedValue(options.due ?? []),
    },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const connection = { target: jest.fn().mockResolvedValue(options.target === undefined ? target : options.target) };
  const graph = fakeGraph();
  const media = { resolve: (key: string) => `https://media.example.com/media/${key}` };
  const service = new SocialPublisherService(
    prisma as never,
    audit as never,
    connection as never,
    graph as unknown as MetaGraphClient,
    media,
  );
  return { service, prisma, audit, connection, graph };
}

describe('SocialPublisherService.publish', () => {
  it('marks the post published with both ids, and releases the lease', async () => {
    const h = harness();
    await h.service.publish(basePost.id, { manual: true });

    expect(h.graph.facebookPhoto).toHaveBeenCalledWith(
      expect.objectContaining({ imageUrl: `https://media.example.com/media/${basePost.imageKey}` }),
    );
    const data = h.prisma.socialPost.update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      status: 'published',
      publishMode: 'api',
      facebookPostId: 'fb-1',
      instagramMediaId: 'ig-1',
      lockedAt: null,
    });
    expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'social:publish', outcome: 'success' }));
  });

  it('answers 409 when another publish holds the post', async () => {
    const h = harness({ claimed: 0 });
    await expect(h.service.publish(basePost.id, { manual: true })).rejects.toBeInstanceOf(ConflictException);
    expect(h.graph.facebookPhoto).not.toHaveBeenCalled();
  });

  it('refuses without a connection', async () => {
    const h = harness({ target: null });
    await expect(h.service.publish(basePost.id, { manual: true })).rejects.toBeInstanceOf(ConflictException);
    expect(h.prisma.socialPost.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a picture drawn for the other format, and frees the lease', async () => {
    const h = harness();
    h.prisma.socialPost.findUniqueOrThrow.mockResolvedValue({ ...basePost, format: 'story', imageFormat: 'square', attempts: 0 });
    await expect(h.service.publish(basePost.id, { manual: true })).rejects.toBeInstanceOf(ConflictException);
    expect(h.graph.facebookStory).not.toHaveBeenCalled();
    expect(h.prisma.socialPost.update).toHaveBeenCalledWith({ where: { id: basePost.id }, data: { lockedAt: null } });
  });

  it('counts a failed scheduled publish, and keeps the post scheduled', async () => {
    const h = harness();
    h.graph.instagramMedia.mockRejectedValue(new GraphApiError('boom'));
    h.prisma.socialPost.findUniqueOrThrow.mockResolvedValue({ ...basePost, attempts: 1 });
    await h.service.publish(basePost.id, { manual: false });
    const data = h.prisma.socialPost.update.mock.calls[0][0].data;
    expect(data.status).toBeUndefined();
    expect(data.attempts).toBe(2);
    expect(data.lastError).toBe('Instagram: boom');
    expect(data.facebookPostId).toBe('fb-1');
  });
});

describe('SocialPublisherService.publishDue — the scheduler', () => {
  it('asks only for scheduled, due, pictured posts under the retry cap', async () => {
    const h = harness({ due: [] });
    const now = new Date('2026-10-27T10:00:00Z');
    await h.service.publishDue(now);
    const where = h.prisma.socialPost.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      status: 'scheduled',
      scheduledAt: { lte: now },
      attempts: { lt: MAX_AUTO_ATTEMPTS },
      imageKey: { not: null },
    });
  });

  it('publishes each due post through the same path as the button', async () => {
    const h = harness({ due: [{ id: basePost.id }] });
    const published = await h.service.publishDue(new Date());
    expect(published).toBe(1);
    expect(h.graph.facebookPhoto).toHaveBeenCalledTimes(1);
  });

  it('does nothing on a stack with no connection', async () => {
    const h = harness({ target: null, due: [{ id: basePost.id }] });
    expect(await h.service.publishDue(new Date())).toBe(0);
    expect(h.prisma.socialPost.findMany).not.toHaveBeenCalled();
  });

  it('keeps going when one post loses the race to the button', async () => {
    const h = harness({ due: [{ id: 'a' }, { id: 'b' }] });
    h.prisma.socialPost.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    expect(await h.service.publishDue(new Date())).toBe(1);
  });
});
