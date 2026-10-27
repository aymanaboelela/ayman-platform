/**
 * «المونتاج» — handing a video over and putting it on a lesson.
 *
 * Asserted on the EFFECT: what the bucket holds afterwards, what the lesson's
 * video row says, and which video went to «محفوظة» — not on call order alone.
 */
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { montageSourceKey } from '@ayman/contracts/montage';
import type { AuditService } from '../../audit/audit.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { LessonService } from '../content/lesson.service';
import type { VideoArchiveService } from '../video-mirror/video-archive.service';
import type { VideoMirrorService } from '../video-mirror/video-mirror.service';
import { MontageService } from './montage.service';

const MONTAGE_ID = '0190f3a0-0000-7000-8000-000000000001';
const LESSON_ID = '0190f3a0-0000-7000-8000-0000000000aa';
const SECTION_ID = '0190f3a0-0000-7000-8000-0000000000bb';
const STORAGE_ID = 'c'.repeat(32);

interface Montage {
  id: string;
  title: string;
  note: string | null;
  fileName: string;
  storageId: string;
  uploadId: string | null;
  sizeBytes: bigint;
  status: 'uploading' | 'ready';
  uploadedBy: string | null;
  publishedLessonId: string | null;
  publishedAt: Date | null;
  createdAt: Date;
}

function build(options: {
  montage?: Partial<Montage> | null;
  lesson?: { kind: string; video: { provider: string; externalId: string; mirrorStatus: string } | null } | null;
  upsertFails?: boolean;
}) {
  const montage: Montage | null =
    options.montage === null
      ? null
      : {
          id: MONTAGE_ID,
          title: 'المحاضرة الأولى',
          note: null,
          fileName: 'lecture-1.mp4',
          storageId: STORAGE_ID,
          uploadId: null,
          sizeBytes: 2_000_000_000n,
          status: 'ready',
          uploadedBy: 'editor-1',
          publishedLessonId: null,
          publishedAt: null,
          createdAt: new Date('2026-10-27T00:00:00Z'),
          ...options.montage,
        };

  const bucket = new Set<string>(montage === null ? [] : [montageSourceKey(montage.storageId)]);
  const aborted: string[] = [];
  const released: { externalId: string; keep: boolean }[] = [];
  const created: { sectionId: string; input: Record<string, unknown> }[] = [];
  let videoRow: Record<string, unknown> | null = null;
  let montageUpdate: Record<string, unknown> | null = null;
  let montageDeleted = false;

  const lesson =
    options.lesson === undefined
      ? {
          kind: 'video',
          title: 'الدرس الأول',
          section: { course: { id: 'course-1', title: 'برمجة' } },
          video: { provider: 'upload', externalId: 'd'.repeat(32), mirrorStatus: 'ready', sourceName: 'old.mp4', durationSeconds: 60, mirrorHeight: 720, mirrorBytes: 10n, posterKey: null, fullDurationSeconds: null },
        }
      : options.lesson === null
        ? null
        : { title: 'الدرس الأول', section: { course: { id: 'course-1', title: 'برمجة' } }, ...options.lesson };

  const prisma = {
    montageVideo: {
      findUnique: async () => montage,
      findMany: async () => (montage === null ? [] : [montage]),
      update: async (args: { data: Record<string, unknown> }) => {
        montageUpdate = args.data;
        if (montage !== null) Object.assign(montage, args.data);
        return montage;
      },
      delete: async () => {
        montageDeleted = true;
        return montage;
      },
    },
    user: { findMany: async () => [{ id: 'editor-1', name: 'المونتير' }] },
    lesson: {
      findUnique: async () => lesson,
      findMany: async () => [],
    },
    courseSection: { findUnique: async () => ({ id: SECTION_ID }) },
    lessonVideo: {
      upsert: async (args: { create: Record<string, unknown> }) => {
        if (options.upsertFails === true) throw new Error('db down');
        videoRow = args.create;
        return args.create;
      },
    },
  } as unknown as PrismaService;

  const storage = {
    copyObject: async (from: string, to: string) => {
      if (!bucket.has(from)) throw new Error('no such key');
      bucket.add(to);
    },
    deleteObject: async (key: string) => {
      bucket.delete(key);
    },
    abortMultipart: async (key: string) => {
      aborted.push(key);
    },
    presignDownload: async (key: string, fileName: string) => `https://r2.example/${key}?name=${fileName}`,
  };
  const mirror = { objectStorage: storage } as unknown as VideoMirrorService;
  const archive = {
    release: async (video: { externalId: string }, keep: boolean) => {
      released.push({ externalId: video.externalId, keep });
    },
  } as unknown as VideoArchiveService;
  const lessons = {
    create: async (sectionId: string, input: Record<string, unknown>) => {
      created.push({ sectionId, input });
      return { id: 'new-lesson', courseId: 'course-2' };
    },
  } as unknown as LessonService;
  const audit = { record: async () => undefined } as unknown as AuditService;

  const service = new MontageService(prisma, mirror, archive, lessons, audit);
  return {
    service,
    bucket,
    aborted,
    released,
    created,
    video: () => videoRow,
    montageUpdate: () => montageUpdate,
    montageDeleted: () => montageDeleted,
  };
}

describe('MontageService.publish — «حطه في درس»', () => {
  it('gives an existing lesson its own copy, queues the encode, and keeps the hand-over', async () => {
    const t = build({});
    const result = await t.service.publish(MONTAGE_ID, { lessonId: LESSON_ID, encrypt: true }, 'admin-1');

    expect(result).toEqual({ courseId: 'course-1', lessonId: LESSON_ID });
    const video = t.video()!;
    expect(video.provider).toBe('upload');
    expect(video.mirrorStatus).toBe('pending');
    expect(video.sourceName).toBe('lecture-1.mp4');
    // The lesson's copy is under the regular upload root, so the worker finds it…
    expect(t.bucket.has(`raw/${video.externalId as string}/source`)).toBe(true);
    // …and the original is still there to download.
    expect(t.bucket.has(montageSourceKey(STORAGE_ID))).toBe(true);
    // What the lesson played before is kept, not deleted.
    expect(t.released).toEqual([{ externalId: 'd'.repeat(32), keep: true }]);
    expect(t.montageUpdate()).toMatchObject({ publishedLessonId: LESSON_ID });
  });

  it('makes a NEW draft lesson at the end of the section', async () => {
    const t = build({});
    const result = await t.service.publish(
      MONTAGE_ID,
      { sectionId: SECTION_ID, title: 'المحاضرة الأولى', encrypt: false },
      'admin-1',
    );

    expect(result).toEqual({ courseId: 'course-2', lessonId: 'new-lesson' });
    expect(t.created).toHaveLength(1);
    expect(t.created[0]!.sectionId).toBe(SECTION_ID);
    expect(t.created[0]!.input).toMatchObject({ title: 'المحاضرة الأولى', kind: 'video', isPublished: false });
    expect(t.video()!.encrypted).toBe(false);
    expect(t.released).toEqual([]);
  });

  it('leaves no stray copy in the bucket when the lesson row cannot be written', async () => {
    const t = build({ upsertFails: true });
    await expect(t.service.publish(MONTAGE_ID, { lessonId: LESSON_ID, encrypt: true }, 'admin-1')).rejects.toThrow('db down');
    expect([...t.bucket]).toEqual([montageSourceKey(STORAGE_ID)]);
    expect(t.released).toEqual([]);
  });

  it('refuses a hand-over still uploading, before copying anything', async () => {
    const t = build({ montage: { status: 'uploading', uploadId: 'mp-1' } });
    await expect(t.service.publish(MONTAGE_ID, { lessonId: LESSON_ID, encrypt: true }, 'admin-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(t.bucket.size).toBe(1);
  });

  it('refuses a lesson that is not a video lesson, or one mid-upload', async () => {
    const quiz = build({ lesson: { kind: 'quiz', video: null } });
    await expect(quiz.service.publish(MONTAGE_ID, { lessonId: LESSON_ID, encrypt: true }, 'a')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(quiz.bucket.size).toBe(1);

    const busy = build({ lesson: { kind: 'video', video: { provider: 'upload', externalId: 'e'.repeat(32), mirrorStatus: 'uploading' } } });
    await expect(busy.service.publish(MONTAGE_ID, { lessonId: LESSON_ID, encrypt: true }, 'a')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('answers 404 for a hand-over that does not exist', async () => {
    const t = build({ montage: null });
    await expect(t.service.publish(MONTAGE_ID, { lessonId: LESSON_ID, encrypt: true }, 'a')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('MontageService.remove', () => {
  it('deletes the original and the row — for the instructor', async () => {
    const t = build({});
    await t.service.remove(MONTAGE_ID, true);
    expect(t.bucket.size).toBe(0);
    expect(t.montageDeleted()).toBe(true);
    expect(t.aborted).toEqual([]);
  });

  it('refuses the editor once the video has arrived, and keeps every byte', async () => {
    const t = build({});
    await expect(t.service.remove(MONTAGE_ID, false)).rejects.toBeInstanceOf(ForbiddenException);
    expect(t.bucket.size).toBe(1);
    expect(t.montageDeleted()).toBe(false);
  });

  it('lets the editor cancel an upload that never finished, parts and all', async () => {
    const t = build({ montage: { status: 'uploading', uploadId: 'mp-1' } });
    await t.service.remove(MONTAGE_ID, false);
    expect(t.aborted).toEqual([montageSourceKey(STORAGE_ID)]);
    expect(t.montageDeleted()).toBe(true);
  });
});

describe('MontageService.list', () => {
  it('names the uploader and counts only sealed bytes', async () => {
    const t = build({});
    const list = await t.service.list();
    expect(list.videos[0]).toMatchObject({ title: 'المحاضرة الأولى', uploadedBy: 'المونتير', status: 'ready', lesson: null });
    expect(list.totalBytes).toBe(2_000_000_000);

    const half = build({ montage: { status: 'uploading', uploadId: 'mp-1' } });
    expect((await half.service.list()).totalBytes).toBe(0);
  });
});

describe('MontageService — the editor accounts', () => {
  function accounts(users: { id: string; role: string; phoneNumber: string | null }[]) {
    const writes: string[] = [];
    const prisma = {
      user: {
        findFirst: async (args: { where: { id: string; role: string } }) =>
          users.find((user) => user.id === args.where.id && user.role === args.where.role) ?? null,
        findMany: async () =>
          users
            .filter((user) => user.role === 'video_editor')
            .map((user) => ({ ...user, name: 'مونتير', bannedAt: null, createdAt: new Date() })),
        update: async () => {
          writes.push('user.update');
          return {};
        },
      },
      montageVideo: { groupBy: async () => [] },
      account: {
        upsert: async () => {
          writes.push('account.upsert');
          return {};
        },
      },
      session: { deleteMany: async () => writes.push('session.deleteMany') },
      sessionDevice: { deleteMany: async () => writes.push('sessionDevice.deleteMany') },
      $transaction: async (ops: unknown[]) => Promise.all(ops),
    } as unknown as PrismaService;
    const service = new MontageService(
      prisma,
      { objectStorage: null } as unknown as VideoMirrorService,
      {} as VideoArchiveService,
      {} as LessonService,
      { record: async () => undefined } as unknown as AuditService,
    );
    return { service, writes };
  }

  it('never sets a password on an account that is not an editor', async () => {
    const t = accounts([{ id: 'student-1', role: 'student', phoneNumber: '+201000000001' }]);
    await expect(t.service.setEditorPassword('student-1', 'montage2026', 'admin')).rejects.toBeInstanceOf(NotFoundException);
    expect(t.writes).toEqual([]);
  });

  it('a new password ends every session the editor had', async () => {
    const t = accounts([{ id: 'ed-1', role: 'video_editor', phoneNumber: '+201500000777' }]);
    const editor = await t.service.setEditorPassword('ed-1', 'montage2026', 'admin');
    expect(editor.id).toBe('ed-1');
    expect(t.writes).toEqual(expect.arrayContaining(['account.upsert', 'session.deleteMany']));
  });

  it('stopping an editor signs them out everywhere; never touches anyone else', async () => {
    const t = accounts([
      { id: 'ed-1', role: 'video_editor', phoneNumber: null },
      { id: 'owner-1', role: 'owner', phoneNumber: null },
    ]);
    await t.service.setEditorDisabled('ed-1', true, 'admin');
    expect(t.writes).toEqual(['user.update', 'session.deleteMany', 'sessionDevice.deleteMany']);
    await expect(t.service.setEditorDisabled('owner-1', true, 'admin')).rejects.toBeInstanceOf(NotFoundException);
  });
});
