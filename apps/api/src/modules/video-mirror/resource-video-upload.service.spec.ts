// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { Logger, NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { LessonPlayerSchema } from '@ayman/contracts/progress';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { EntitlementService } from '../entitlement/entitlement.service';
import { HomeworkService } from '../homework/homework.service';
import { PlayerService } from '../player/player.service';
import { VideoKeyService } from '../player/video-key.service';
import { LessonAccessService } from '../progress/lesson-access.service';
import { LessonGateService } from '../progress/lesson-gate.service';
import type { VideoArchiveService } from './video-archive.service';
import { ResourceVideoUploadService } from './resource-video-upload.service';
import { VideoMirrorService } from './video-mirror.service';

const transcodeUpload = jest.fn();
jest.mock('./upload-pipeline', () => ({
  ...jest.requireActual('./upload-pipeline'),
  transcodeUpload: (...args: unknown[]) => transcodeUpload(...args),
}));

/**
 * «رفع فيديو» جوّه مواد الدرس — against the REAL database.
 *
 * The bug this replaces was invisible to every mock: #580 wrote a row the
 * `lesson_resources` CHECKs forbid, its specs stubbed Prisma, and the first
 * place the two met was the instructor's screen — «مقدرناش نضيف المادة دي»
 * for every upload, at any size. So this suite writes through the real
 * constraints, end to end: the session opens a row, the upload seals it, the
 * worker's own code marks it ready, and the student who may open the lesson
 * gets its playlist and its key while one who may not gets neither.
 *
 * Only the bucket and the encoder are stubbed — they are the two things that
 * are not Postgres.
 */
describe('ResourceVideoUploadService — a material video, through the real constraints', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;

  const KEY = Buffer.alloc(16, 9);
  const storage = {
    createMultipart: async () => 'mp-1',
    presignParts: async (_key: string, _upload: string, count: number) =>
      Array.from({ length: count }, (_, index) => ({ partNumber: index + 1, url: `https://bucket.test/${index + 1}` })),
    completeMultipart: async () => undefined,
    sizeOf: async () => 300 * 1024 * 1024,
    downloadTo: async () => undefined,
    deletePrefix: async () => undefined,
    uploadLadder: async () => undefined,
    deleteObject: async () => undefined,
    abortMultipart: async () => undefined,
  };

  // The worker, with its bucket and encoder stubbed and nothing else.
  const mirror = Object.create(VideoMirrorService.prototype) as VideoMirrorService;
  Object.assign(mirror, {
    logger: new Logger('resource-video-upload-spec'),
    config: {},
    storage,
    prisma,
    encoder: {},
    appUrl: 'https://app.test',
    keySecret: 'x'.repeat(32),
  });
  Object.defineProperty(mirror, 'publicUrl', { get: () => 'https://video.test' });
  Object.defineProperty(mirror, 'objectStorage', { get: () => storage });
  Object.defineProperty(mirror, 'videoKey', { value: () => KEY });

  const purged: string[] = [];
  const archive = { purge: async (id: string) => void purged.push(id) } as unknown as VideoArchiveService;
  const uploads = new ResourceVideoUploadService(prisma, mirror, archive, new AuditService(prisma));

  const entitlement = new EntitlementService(prisma);
  const gate = new LessonGateService(prisma, new EntitlementService(prisma));
  const access = new LessonAccessService(prisma, gate, entitlement);
  const player = new PlayerService(
    prisma,
    access,
    gate,
    { resolve: (key: string) => `https://media.test/${key}` },
    { getStream: async () => { throw new Error('not used'); }, stat: async () => null } as never,
    new HomeworkService(prisma, null as never, null as never, null as never, null as never, null as never),
    mirror,
  );
  const keys = new VideoKeyService(prisma, access, mirror);

  let instructorId = '';
  let studentId = '';
  let strangerId = '';
  let lessonId = '';

  beforeAll(async () => {
    await prisma.$connect();
    const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const user = (prefix: string, name: string) =>
      prisma.user.create({ data: { id: `rv-${prefix}-${stamp}`, name, email: `rv-${prefix}-${stamp}@t.test` } });
    instructorId = (await user('i', 'مدرس')).id;
    studentId = (await user('s', 'طالب')).id;
    strangerId = (await user('o', 'غريب')).id;

    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();
    const course = await prisma.course.create({
      data: {
        slug: `rv-course-${stamp}`,
        title: 'كورس',
        status: 'published',
        publishedAt: new Date(),
        systemId: system.id,
        year: 2,
        subjectId: subject.id,
        instructorId,
        requiresGrant: false,
      },
    });
    const section = await prisma.courseSection.create({
      data: { courseId: course.id, title: 'الوحدة', position: 1, isPublished: true },
    });
    lessonId = (
      await prisma.lesson.create({
        data: {
          courseId: course.id,
          sectionId: section.id,
          title: 'المحاضرة',
          kind: 'video',
          position: 1,
          isPublished: true,
          // The lecture's OWN video — the thing a material upload must never touch.
          video: { create: { provider: 'youtube', externalId: 'dQw4w9WgXcQ', durationSeconds: 600 } },
        },
      })
    ).id;

    await prisma.enrollment.create({ data: { userId: studentId, courseId: course.id, source: 'free', status: 'active' } });
    await entitlement.ensurePlatformGrant(studentId);
  });

  afterAll(async () => {
    await prisma.course.deleteMany({ where: { instructorId } });
    await prisma.user.deleteMany({ where: { id: { in: [instructorId, studentId, strangerId] } } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('saves the material, encodes it, and plays it only to a student who may open the lesson', async () => {
    // 1. «أضف مادة» — the row exists before a byte moves, in `uploading`.
    const session = await uploads.start(lessonId, {
      title: 'حل الواجب',
      description: null,
      fileName: 'حل الواجب.mp4',
      sizeBytes: 300 * 1024 * 1024,
      contentType: 'video/mp4',
    });
    const opened = await prisma.lessonResource.findUniqueOrThrow({ where: { id: session.resourceId } });
    expect(opened).toMatchObject({
      lessonId,
      kind: 'video',
      title: 'حل الواجب',
      videoProvider: 'upload',
      videoExternalId: session.videoId,
      mirrorStatus: 'uploading',
      storageKey: null,
      filename: null,
    });
    expect(session.parts.length).toBeGreaterThan(1);

    // Still uploading: invisible to the student — it may never finish.
    const early = await player.lesson(studentId, lessonId);
    expect(early.resources.map((resource) => resource.id)).not.toContain(session.resourceId);

    // 2. The last part lands — the row joins the worker's queue.
    await uploads.complete(session.resourceId, {
      videoId: session.videoId,
      uploadId: session.uploadId,
      parts: [{ partNumber: 1, etag: '"e1"' }],
    });
    expect((await uploads.status(session.resourceId)).status).toBe('pending');
    const waiting = await player.lesson(studentId, lessonId);
    expect(waiting.resources.find((resource) => resource.id === session.resourceId)).toMatchObject({
      processing: true,
      mirror: null,
      viewPath: null,
    });

    // 3. The worker's own code takes it to `ready` — through the real CHECKs.
    transcodeUpload.mockResolvedValue({
      dir: '/tmp/x',
      files: [],
      maxHeight: 720,
      bytes: 120 * 1024 * 1024,
      durationSeconds: 754,
      cleanup: async () => undefined,
    });
    await mirror.transcodeOne(session.videoId);
    expect(await uploads.status(session.resourceId)).toMatchObject({ status: 'ready', maxHeight: 720, durationSeconds: 754 });

    // The lecture's own video is exactly what it was.
    const lecture = await prisma.lessonVideo.findUniqueOrThrow({ where: { lessonId } });
    expect(lecture).toMatchObject({ provider: 'youtube', externalId: 'dQw4w9WgXcQ', mirrorStatus: 'pending' });

    // 4. The enrolled student: the protected ladder, no file route, and the key.
    const payload = LessonPlayerSchema.parse(await player.lesson(studentId, lessonId));
    expect(payload.video).toMatchObject({ provider: 'youtube', youtubeId: 'dQw4w9WgXcQ' });
    expect(payload.resources.find((resource) => resource.id === session.resourceId)).toMatchObject({
      kind: 'video',
      youtubeId: null,
      viewPath: null,
      downloadPath: null,
      processing: false,
      mirror: { hlsUrl: `https://video.test/v/${session.videoId}/master.m3u8`, maxHeight: 720 },
    });
    await expect(keys.key({ id: studentId, role: 'student' }, session.videoId)).resolves.toEqual(KEY);

    // 5. Someone not enrolled: no lesson payload, and no key — the same 404.
    await expect(player.lesson(strangerId, lessonId)).rejects.toBeInstanceOf(NotFoundException);
    await expect(keys.key({ id: strangerId, role: 'student' }, session.videoId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cancelling an upload takes the material away with it', async () => {
    const session = await uploads.start(lessonId, {
      title: 'هيتلغي',
      description: null,
      fileName: 'x.mp4',
      sizeBytes: 50 * 1024 * 1024,
      contentType: 'video/mp4',
    });
    await uploads.abort(session.resourceId, { videoId: session.videoId, uploadId: session.uploadId });
    expect(await prisma.lessonResource.findUnique({ where: { id: session.resourceId } })).toBeNull();
    expect(purged).toContain(session.videoId);
  });

  /*
   * The CHECK is the half that survives a direct write — an upload id on a
   * YouTube row, or an uploaded row with no pipeline state, would each be a
   * material the worker either encodes by mistake or never sees.
   */
  it('the database refuses an uploaded video in any other shape', async () => {
    const base = { lessonId, kind: 'video' as const, title: 'x' };
    await expect(
      prisma.lessonResource.create({ data: { ...base, videoProvider: 'upload', videoExternalId: 'c'.repeat(32) } }),
    ).rejects.toThrow();
    await expect(
      prisma.lessonResource.create({
        data: { ...base, videoProvider: 'youtube', videoExternalId: 'c'.repeat(32), mirrorStatus: 'pending' },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.lessonResource.create({
        data: { ...base, videoProvider: 'upload', videoExternalId: 'dQw4w9WgXcQ', mirrorStatus: 'pending' },
      }),
    ).rejects.toThrow();
  });
});
