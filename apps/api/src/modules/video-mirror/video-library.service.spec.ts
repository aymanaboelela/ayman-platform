/**
 * «الفيديوهات» — the list and the delete.
 *
 * Asserted on the EFFECT: which folders are offered for deletion, what is
 * refused, and that rows go before files — not on which method was called.
 */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { AuditService } from '../../audit/audit.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { VideoLibraryService } from './video-library.service';
import type { VideoMirrorService } from './video-mirror.service';
import type { VideoArchiveService } from './video-archive.service';
import type { VideoUploadService } from './video-upload.service';

const UP = (c: string): string => c.repeat(32);

interface Row {
  lessonId: string;
  externalId: string;
  provider: 'upload' | 'youtube';
  mirrorStatus: 'uploading' | 'pending' | 'mirroring' | 'ready' | 'failed' | 'disabled';
  mirrorBytes: bigint | null;
  sourceBytes: bigint | null;
}

function build(options: {
  rows: Row[];
  ladders?: Record<string, number>;
  sources?: Record<string, number>;
  parked?: string[];
  kept?: string[];
}) {
  const rows = [...options.rows];
  const ladders = { ...(options.ladders ?? {}) };
  const sources = { ...(options.sources ?? {}) };
  const log: string[] = [];

  const kept = [...(options.kept ?? [])];
  const released: { id: string; keep: boolean }[] = [];
  const upserts: string[] = [];
  const prisma = {
    archivedVideo: {
      findMany: async () =>
        kept.map((externalId) => ({
          externalId,
          sourceName: 'old.mp4',
          durationSeconds: 60,
          mirrorHeight: 720,
          mirrorBytes: 10n,
          posterKey: null,
          fromLessonTitle: 'قديم',
          fromCourseTitle: 'برمجة',
          archivedAt: new Date('2026-09-01T00:00:00Z'),
        })),
      findUnique: async (args: { where: { externalId: string } }) =>
        kept.includes(args.where.externalId)
          ? { externalId: args.where.externalId, sourceName: 'old.mp4', durationSeconds: 60, mirrorHeight: 720, mirrorBytes: 10n, posterKey: null }
          : null,
      delete: async () => ({}),
      deleteMany: async (args: { where: { externalId: string } }) => {
        log.push(`kept:${args.where.externalId}`);
        return { count: 1 };
      },
    },
    lesson: {
      findMany: async () => [],
      findUnique: async (args: { where: { id: string } }) =>
        args.where.id === 'l9'
          ? {
              kind: 'video',
              title: 'درس ٩',
              section: { course: { id: 'c1', title: 'برمجة' } },
              video: { provider: 'upload', externalId: UP('8'), sourceName: 'x.mp4', durationSeconds: 5, mirrorHeight: 720, mirrorBytes: 1n, mirrorStatus: 'ready', posterKey: null },
            }
          : null,
    },
    $transaction: async (ops: unknown[]) => ops,
    lessonVideo: {
      upsert: async (args: { update: { externalId: string } }) => {
        upserts.push(args.update.externalId);
        return {};
      },
      findMany: async (args: { where?: { provider?: string; externalId?: string } }) =>
        rows
          .filter((row) => args.where?.provider === undefined || row.provider === args.where.provider)
          .filter((row) => args.where?.externalId === undefined || row.externalId === args.where.externalId)
          .map((row) => ({
            ...row,
            sourceName: 'lecture.mp4',
            durationSeconds: 3600,
            mirrorHeight: row.mirrorStatus === 'ready' ? 1080 : null,
            updatedAt: new Date('2026-09-28T00:00:00Z'),
            lesson: {
              id: row.lessonId,
              title: `درس ${row.lessonId}`,
              section: { title: 'الوحدة الأولى', course: { id: 'c1', title: 'برمجة' } },
            },
          })),
      deleteMany: async (args: { where: { externalId: string } }) => {
        log.push(`rows:${args.where.externalId}`);
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          if (rows[i]!.externalId === args.where.externalId) rows.splice(i, 1);
        }
        return { count: 1 };
      },
    },
  };

  const usage = (map: Record<string, number>, id: string) =>
    id in map ? { bytes: map[id]!, lastModified: new Date('2026-09-01T00:00:00Z') } : { bytes: 0, lastModified: null };

  const storage = {
    listMirroredIds: async () => new Set(Object.keys(ladders)),
    listSourceIds: async () => new Set(Object.keys(sources)),
    prefixUsage: async (prefix: string) =>
      prefix.startsWith('v/') ? usage(ladders, prefix.slice(2)) : usage(sources, prefix.slice(4)),
    deletePrefix: async (prefix: string) => {
      log.push(`files:${prefix}`);
    },
    deleteObject: async (key: string) => {
      log.push(`source:${key}`);
    },
  };

  const audits: unknown[] = [];
  const service = new VideoLibraryService(
    prisma as unknown as PrismaService,
    { objectStorage: storage } as unknown as VideoMirrorService,
    { parkedReplacedIds: async () => new Set(options.parked ?? []) } as unknown as VideoUploadService,
    { record: async (entry: unknown) => audits.push(entry) } as unknown as AuditService,
    {
      release: async (video: { externalId: string }, keep: boolean) => {
        released.push({ id: video.externalId, keep });
      },
    } as unknown as VideoArchiveService,
  );
  return { service, log, audits, rows, released, upserts };
}

const row = (lessonId: string, externalId: string, extra: Partial<Row> = {}): Row => ({
  lessonId,
  externalId,
  provider: 'upload',
  mirrorStatus: 'ready',
  mirrorBytes: 1_500_000_000n,
  sourceBytes: 4_000_000_000n,
  ...extra,
});

describe('VideoLibraryService.list', () => {
  it('sizes a ready lecture by its ladder and anything else by its original', async () => {
    const { service } = build({
      rows: [row('l1', UP('a')), row('l2', UP('b'), { mirrorStatus: 'pending', mirrorBytes: null })],
    });
    const library = await service.list();
    expect(library.items.map((item) => item.sizeBytes)).toEqual([1_500_000_000, 4_000_000_000]);
    expect(library.items[0]?.courseTitle).toBe('برمجة');
  });

  /*
   * The whole reason the screen exists: a deleted lesson takes its row and
   * leaves its folder. Those are offered; a folder ANY row uses is not — a
   * YouTube copy included — and neither is the video a live upload replaces.
   */
  it('offers folders no lesson points at, and nothing else', async () => {
    const { service } = build({
      rows: [row('l1', UP('a')), row('l2', 'dQw4w9WgXcQ', { provider: 'youtube' })],
      ladders: { [UP('a')]: 10, dQw4w9WgXcQ: 20, [UP('c')]: 300, [UP('d')]: 40 },
      sources: { [UP('e')]: 5 },
      parked: [UP('d')],
    });
    const library = await service.list();
    expect(library.orphans.map((orphan) => orphan.videoId)).toEqual([UP('c'), UP('e')]);
    expect(library.totalBytes).toBe(1_500_000_000 + 300 + 5);
    expect(library.storageRead).toBe(true);
  });
});

describe('VideoLibraryService.remove', () => {
  it('deletes the rows before the files, then the original too', async () => {
    const { service, log, audits } = build({ rows: [row('l1', UP('a'))], ladders: { [UP('a')]: 10 } });
    await expect(service.remove(UP('a'))).resolves.toEqual({ videoId: UP('a'), lessonIds: ['l1'] });
    expect(log).toEqual([`rows:${UP('a')}`, `kept:${UP('a')}`, `files:v/${UP('a')}`, `source:raw/${UP('a')}/source`]);
    expect(audits).toHaveLength(1);
  });

  it('deletes a leftover folder no lesson uses', async () => {
    const { service, log } = build({ rows: [], ladders: { [UP('c')]: 300 } });
    await expect(service.remove(UP('c'))).resolves.toEqual({ videoId: UP('c'), lessonIds: [] });
    expect(log).toEqual([`kept:${UP('c')}`, `files:v/${UP('c')}`, `source:raw/${UP('c')}/source`]);
  });

  it('refuses a YouTube lecture — its copy is what the blocked tablets watch', async () => {
    const { service, log } = build({ rows: [row('l2', 'dQw4w9WgXcQ', { provider: 'youtube' })] });
    await expect(service.remove('dQw4w9WgXcQ')).rejects.toBeInstanceOf(BadRequestException);
    expect(log).toEqual([]);
  });

  it('refuses while the video is still uploading or encoding', async () => {
    const { service, log } = build({ rows: [row('l1', UP('a'), { mirrorStatus: 'mirroring' })] });
    await expect(service.remove(UP('a'))).rejects.toBeInstanceOf(ConflictException);
    expect(log).toEqual([]);
  });

  it('refuses the video a live upload would put back if cancelled', async () => {
    const { service, log } = build({ rows: [], ladders: { [UP('d')]: 40 }, parked: [UP('d')] });
    await expect(service.remove(UP('d'))).rejects.toBeInstanceOf(ConflictException);
    expect(log).toEqual([]);
  });

  it('answers 404 for a video that is nowhere, and 400 for a malformed id', async () => {
    const { service } = build({ rows: [] });
    await expect(service.remove(UP('f'))).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('../etc')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('«محفوظة»', () => {
  it('lists kept videos apart, and never offers their folders as leftovers', async () => {
    const { service } = build({ rows: [], ladders: { [UP('9')]: 10, [UP('c')]: 300 }, kept: [UP('9')] });
    const library = await service.list();
    expect(library.archived.map((video) => video.videoId)).toEqual([UP('9')]);
    expect(library.orphans.map((orphan) => orphan.videoId)).toEqual([UP('c')]);
  });

  /*
   * The way back must not be a one-way door itself: whatever the lesson was
   * playing is KEPT, never deleted, when a kept video takes its place.
   */
  it('puts a kept video back, and keeps the one it displaces', async () => {
    const { service, upserts, released } = build({ rows: [], kept: [UP('9')] });
    await expect(service.restore(UP('9'), 'l9')).resolves.toEqual({ videoId: UP('9'), lessonId: 'l9' });
    expect(upserts).toEqual([UP('9')]);
    expect(released).toEqual([{ id: UP('8'), keep: true }]);
  });

  it('deleting a kept video removes its row and its files', async () => {
    const { service, log } = build({ rows: [], ladders: { [UP('9')]: 10 }, kept: [UP('9')] });
    await service.remove(UP('9'));
    expect(log).toEqual([`kept:${UP('9')}`, `files:v/${UP('9')}`, `source:raw/${UP('9')}/source`]);
  });
});
