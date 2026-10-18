import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  AdminPracticeSetDetailSchema,
  AdminPracticeSetRowSchema,
  PracticePublicListSchema,
  PracticePublicSetSchema,
  type PracticeQuestionInput,
} from '@ayman/contracts/practice';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PracticeService } from './practice.service';

/**
 * The service against the real database, and every response parsed by the
 * contract schema the web app parses it with — a field the schema expects and
 * the select forgot is a 200 here and a broken page there.
 *
 * Every set this file makes uses a unit number no real lesson has (9x) and is
 * deleted in `afterAll`, so the shared dev database's own sets cannot move the
 * assertions; reads are filtered down to this file's rows.
 */
describe('practice (integration)', () => {
  let prisma: PrismaService;
  let service: PracticeService;

  const stamp = randomUUID().slice(0, 8);
  const unit = 90 + Math.floor(Math.random() * 10);
  const created: string[] = [];
  let adminId: string;

  const tf = (stem: string, answer = 0): PracticeQuestionInput => ({ type: 'tf', stem, options: [], answer, explanation: '' });
  const mine = <T extends { lessonCode: string }>(rows: T[]) => rows.filter((r) => r.lessonCode.startsWith(`${unit}-`));

  async function makeSet(lesson: number, published: boolean, year: 1 | 2 = 1) {
    const set = await service.create(
      {
        year,
        track: 'arabic',
        lessonCode: `${unit}-${lesson}`,
        title: `اختبار ${stamp}`,
        unitTitle: null,
        articleSlug: null,
        published,
      },
      adminId,
    );
    created.push(set.id);
    return set;
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new PracticeService(prisma, new AuditService(prisma));
    adminId = (
      await prisma.user.create({
        data: { id: `practice-admin-${stamp}`, name: 'أدمن', email: `practice-admin-${stamp}@t.test`, role: 'admin' },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.practiceSet.deleteMany({ where: { id: { in: created } } });
    /* The admin stays referenced by `audit_log` (INSERT-only), so the delete
       can be refused; leaving one fixture user behind is the lesser harm. */
    await prisma.user.deleteMany({ where: { id: adminId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('creates a set and 409s a second one for the same year/track/lesson', async () => {
    const set = await makeSet(1, false);
    expect(AdminPracticeSetDetailSchema.parse(set).questions).toEqual([]);
    await expect(makeSet(1, true)).rejects.toBeInstanceOf(ConflictException);
  });

  it('appends questions at the end, in order, with dense positions', async () => {
    const set = await makeSet(2, true);
    await service.addQuestions(set.id, [tf('السؤال الأول'), tf('السؤال التاني')], adminId);
    const detail = await service.addQuestions(
      set.id,
      [{ type: 'mcq', stem: 'السؤال التالت', options: ['أ', 'ب', 'ج'], answer: 2, explanation: 'لأن' }],
      adminId,
    );
    AdminPracticeSetDetailSchema.parse(detail);
    expect(detail.questions.map((q) => [q.stem, q.position])).toEqual([
      ['السؤال الأول', 0],
      ['السؤال التاني', 1],
      ['السؤال التالت', 2],
    ]);
    expect(detail.questionCount).toBe(3);
  });

  it('keeps positions dense after a delete', async () => {
    const set = await makeSet(3, true);
    const filled = await service.addQuestions(set.id, [tf('أ ١'), tf('ب ٢'), tf('ج ٣')], adminId);
    const after = await service.removeQuestion(filled.questions[0]!.id, adminId);
    expect(after.questions.map((q) => [q.stem, q.position])).toEqual([
      ['ب ٢', 0],
      ['ج ٣', 1],
    ]);
  });

  it('reorders only with exactly the set’s ids', async () => {
    const set = await makeSet(4, true);
    const filled = await service.addQuestions(set.id, [tf('واحد'), tf('اتنين'), tf('تلاتة')], adminId);
    const [a, b, c] = filled.questions.map((q) => q.id) as [string, string, string];

    await expect(service.reorder(set.id, [a, b], adminId)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.reorder(set.id, [a, b, randomUUID()], adminId)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.reorder(randomUUID(), [a, b, c], adminId)).rejects.toBeInstanceOf(NotFoundException);

    const after = await service.reorder(set.id, [c, a, b], adminId);
    expect(after.questions.map((q) => [q.id, q.position])).toEqual([
      [c, 0],
      [a, 1],
      [b, 2],
    ]);
  });

  it('edits a question in place and PATCHes only the fields sent', async () => {
    const set = await makeSet(5, true);
    const filled = await service.addQuestions(set.id, [tf('قبل التعديل')], adminId);
    const edited = await service.patchQuestion(filled.questions[0]!.id, tf('بعد التعديل', 1), adminId);
    expect(edited.questions[0]).toMatchObject({ stem: 'بعد التعديل', answer: 1, position: 0 });

    const renamed = await service.patch(set.id, { title: 'اسم جديد' }, adminId);
    expect(renamed).toMatchObject({ title: 'اسم جديد', published: true });
  });

  it('public reads show only published, non-empty sets, ordered numerically', async () => {
    const draft = await makeSet(6, false);
    await service.addQuestions(draft.id, [tf('مسودة')], adminId);
    await makeSet(7, true); // published but empty
    const ten = await makeSet(10, true);
    await service.addQuestions(ten.id, [tf('عشرة')], adminId);
    const eight = await makeSet(8, true);
    await service.addQuestions(eight.id, [tf('تمانية', 1)], adminId);

    const list = PracticePublicListSchema.parse(await service.listPublic());
    const codes = mine(list.sets).map((s) => s.lessonCode);
    expect(codes).not.toContain(`${unit}-6`);
    expect(codes).not.toContain(`${unit}-7`);
    expect(codes.indexOf(`${unit}-8`)).toBeLessThan(codes.indexOf(`${unit}-10`));

    expect(await service.findPublic(1, 'arabic', `${unit}-6`)).toBeNull();
    expect(await service.findPublic(1, 'arabic', `${unit}-7`)).toBeNull();
    expect(await service.findPublic(2, 'arabic', `${unit}-8`)).toBeNull();

    const one = PracticePublicSetSchema.parse(await service.findPublic(1, 'arabic', `${unit}-8`));
    expect(one.questions).toEqual([
      expect.objectContaining({ stem: 'تمانية', answer: 1, options: [] }),
    ]);
    expect(one.questions[0]).not.toHaveProperty('position');
  });

  it('admin list carries drafts and parses as rows', async () => {
    const rows = await service.listAdmin();
    const own = mine(rows);
    own.forEach((row) => AdminPracticeSetRowSchema.parse(row));
    expect(own.some((row) => !row.published)).toBe(true);
  });

  it('deleting a set takes its questions with it', async () => {
    const set = await makeSet(11, true);
    await service.addQuestions(set.id, [tf('هيتمسح')], adminId);
    await service.remove(set.id, adminId);
    await expect(service.findAdmin(set.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.practiceQuestion.count({ where: { setId: set.id } })).toBe(0);
  });
});
