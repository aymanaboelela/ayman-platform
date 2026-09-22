import { NotFoundException } from '@nestjs/common';
import { AdminHonorBoardService } from './honor-board.service';
import { honorDayKey } from '../../catalog/honor-board';

const ARABIC = { year: 2, forGeneral: true, forLanguages: false };

function pinRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    userId: 'nano-student',
    honoredAt: new Date('2026-09-17T12:00:00+02:00'),
    rank: 1,
    courseId: null,
    reason: 'الأول على الدفعة',
    photoKey: null,
    createdAt: new Date('2026-09-17T12:00:00+02:00'),
    course: null,
    user: {
      studentProfile: {
        fullName: 'ندى',
        phone: '01000000000',
        honorPhotoKey: 'ab/profile.webp',
        year: 2,
        schoolStream: 'languages',
      },
    },
    ...over,
  };
}

function makeService() {
  const audit = { record: jest.fn(async () => ({ id: 1n, prevHash: null, hash: 'x' })) };
  const notifications = { emit: jest.fn(async () => undefined), announce: jest.fn(async () => undefined) };
  const tx = {
    honorBoardPin: { create: jest.fn(async () => pinRow()) },
    notification: { create: jest.fn(async () => ({})) },
  };
  const prisma = {
    honorBoardPin: {
      findMany: jest.fn(async () => [] as unknown[]),
      findUnique: jest.fn(async () => null as unknown),
      update: jest.fn(async () => pinRow()),
      delete: jest.fn(async () => ({})),
    },
    quizAttempt: { findMany: jest.fn(async () => [] as unknown[]) },
    course: { findMany: jest.fn(async () => [] as unknown[]) },
    studentProfile: { findUnique: jest.fn(async () => ({ userId: 'nano-student' })), findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (fn: (client: unknown) => Promise<unknown>) => fn(tx)),
  };
  const service = new AdminHonorBoardService(
    prisma as never,
    audit as never,
    notifications as never,
  );
  return { service, prisma, tx, audit, notifications };
}

const INPUT = {
  userId: 'nano-student',
  day: '2026-09-17',
  rank: 1,
  courseId: null,
  reason: 'الأول على الدفعة',
  photoKey: null,
};

describe('AdminHonorBoardService.create', () => {
  it('stores the chosen day as MIDDAY Cairo, in winter and in summer', async () => {
    // القاهرة +٢ شتاءً و+٣ صيفًا. نص الليل بيقع على اليوم اللي قبله أو اللي
    // بعده في نص السنة؛ الظهر بعيد عن الحدين، فاليوم اللي اتكتب هو اللي
    // بيترجع مهما كان التوقيت الصيفي شغّال.
    const { service, tx } = makeService();

    await service.create({ ...INPUT, day: '2026-01-15' }, 'admin-1');
    await service.create({ ...INPUT, day: '2026-07-15' }, 'admin-1');

    const [winter, summer] = tx.honorBoardPin.create.mock.calls.map(
      (call) => (call[0] as { data: { honoredAt: Date } }).data.honoredAt,
    );
    expect(honorDayKey(winter)).toBe('2026-01-15');
    expect(honorDayKey(summer)).toBe('2026-07-15');
  });

  it('writes the row and the notification in ONE transaction', async () => {
    /*
     * الإشعار هو الحاجة الوحيدة اللي بتقول للطالب إن اسمه اتنشر على صفحة
     * عامة. صف من غير إشعار = اسم منشور وهو مايعرفش؛ إشعار من غير صف =
     * «مبروك» على لوحة مفيهاش اسمه.
     */
    const { service, prisma, tx, notifications } = makeService();
    await service.create(INPUT, 'admin-1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.honorBoardPin.create).toHaveBeenCalledTimes(1);
    expect(notifications.emit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ userId: 'nano-student', kind: 'honor_board_listed' }),
    );
    // النص الحي بره الترانزاكشن، زي كل نداء تاني للفيد.
    expect(notifications.announce).toHaveBeenCalledWith('nano-student');
  });

  it('refuses a user with no student profile', async () => {
    // الكارت بيطبع `fullName`. صف لحساب من غير بروفايل كان هيطلع على
    // الصفحة الرئيسية باسم «—».
    const { service, prisma } = makeService();
    prisma.studentProfile.findUnique = jest.fn(async () => null as unknown);
    await expect(service.create(INPUT, 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('audits the publication with the student and the reason', async () => {
    const { service, audit } = makeService();
    await service.create(INPUT, 'admin-1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'honor:add',
        resourceType: 'honor_board_pins',
        metadata: expect.objectContaining({ userId: 'nano-student', rank: 1 }),
      }),
    );
  });
});

describe('AdminHonorBoardService.patch', () => {
  it('touches ONLY the fields that were sent', async () => {
    /*
     * ده اللي `AdminHonorPinPatchSchema` متكتوب بالإيد عشانه: `.partial()`
     * بيسيب الـ`.default()` مكانه، فتعديل السبب لوحده كان بيبعت
     * `photoKey: null` جوّاه ويمسح الصورة. حصل حرفيًا في PATCH تاني هنا.
     */
    const { service, prisma } = makeService();
    prisma.honorBoardPin.findUnique = jest.fn(async () => ({ id: 'x' }) as unknown);

    await service.patch('x', { reason: 'انتظام كامل' });

    const call = prisma.honorBoardPin.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data).toEqual({ reason: 'انتظام كامل' });
    expect('photoKey' in call.data).toBe(false);
    expect('courseId' in call.data).toBe(false);
  });

  it('DOES clear the photo when null was sent deliberately', async () => {
    const { service, prisma } = makeService();
    prisma.honorBoardPin.findUnique = jest.fn(async () => ({ id: 'x' }) as unknown);

    await service.patch('x', { photoKey: null });

    const call = prisma.honorBoardPin.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data).toEqual({ photoKey: null });
  });
});

describe('AdminHonorBoardService.remove', () => {
  it('keeps the name and the reason in the audit row', async () => {
    // بعد الـDELETE ده الأثر الوحيد إن الصف كان موجود، و«مين شال اسم الطالب
    // ده» سؤال بيتسأل.
    const { service, prisma, audit } = makeService();
    prisma.honorBoardPin.findUnique = jest.fn(async () => ({
      id: 'x',
      userId: 'nano-student',
      honoredAt: new Date('2026-09-17T12:00:00+02:00'),
      rank: 2,
      reason: 'انتظام كامل',
      user: { studentProfile: { fullName: 'ندى' } },
    }) as unknown);

    await service.remove('x');

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'honor:remove',
        metadata: expect.objectContaining({
          studentName: 'ندى',
          reason: 'انتظام كامل',
          day: '2026-09-17',
        }),
      }),
    );
  });
});

describe('AdminHonorBoardService.list', () => {
  it('puts a hand-added row and a pinned paper of the same day in ONE round', async () => {
    const { service, prisma } = makeService();
    prisma.honorBoardPin.findMany = jest.fn(async () => [pinRow()] as unknown[]);
    prisma.quizAttempt.findMany = jest.fn(async () => [
      {
        id: '22222222-2222-4222-8222-222222222222',
        userId: 'nano-other',
        startedAt: new Date('2026-09-17T08:00:00Z'),
        scaledScore: 48,
        gradeOutOf: 50,
        honorBoardAt: new Date('2026-09-17T09:00:00Z'),
        user: { image: null, studentProfile: { fullName: 'زياد', honorPhotoKey: null } },
        quiz: { lateAfter: null, lesson: { title: 'امتحان الشهر', course: ARABIC } },
      },
    ] as unknown[]);

    const board = await service.list();

    expect(board.rounds).toHaveLength(1);
    expect(board.rounds[0].key).toBe('2026-09-17');
    expect(board.rounds[0].manual.map((row) => row.studentName)).toEqual(['ندى']);
    expect(board.rounds[0].fromExams.map((row) => row.studentName)).toEqual(['زياد']);
  });

  it('labels a courseless pin from the student own year and stream', async () => {
    const { service, prisma } = makeService();
    prisma.honorBoardPin.findMany = jest.fn(async () => [pinRow()] as unknown[]);
    const board = await service.list();
    expect(board.rounds[0].manual[0].courseLabel).toBe('تانية بكالوريا — لغات');
  });

  it('sends the board photo the PUBLIC page will draw, in the same order', async () => {
    // الشاشة بتعرض اللي هينزل، مش وصف ليه: صورة التكريم الأول، وبعدين صورة
    // البروفايل. الاتنين بيتبعتوا عشان الصف يعرف يرسم الصح.
    const { service, prisma } = makeService();
    prisma.honorBoardPin.findMany = jest.fn(
      async () => [pinRow({ photoKey: 'cd/pin.webp' })] as unknown[],
    );
    const board = await service.list();
    expect(board.rounds[0].manual[0]).toMatchObject({
      photoKey: 'cd/pin.webp',
      profilePhotoKey: 'ab/profile.webp',
    });
  });
});
