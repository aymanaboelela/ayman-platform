import { ConflictException } from '@nestjs/common';
import { fromCairoWall } from '@ayman/contracts/marketing/pacing';
import { WA_CONTACTS_PACING } from '@ayman/contracts/marketing/wa-contacts';
import type { PrismaService } from '../../prisma/prisma.service';
import { WaContactsService } from './wa-contacts.service';
import {
  DeviceOfflineError,
  WhatsappRestrictedError,
  type ContactSaveResult,
  type WhatsappDeviceService,
} from './whatsapp-device.service';

/**
 * «احفظهم في واتساب», against an in-memory stand-in for the two tables.
 *
 * Every test asserts the EFFECT — which rows ended up saved, whether the run
 * is still running — not that some branch was taken. The one property that
 * matters most is the last block: the first refusal from WhatsApp stops the
 * run, and the next student is never reached.
 */

const NOON = fromCairoWall(2026, 11, 3, 12);

interface SaveRow {
  phone: string;
  userId: string | null;
  name: string;
  status: string;
  attempts: number;
  lastError: string | null;
  lid: string | null;
  savedAt: Date | null;
  createdAt: Date;
}

interface Student {
  userId: string;
  fullName: string;
  phone: string;
  role?: string;
  banned?: boolean;
}

function fakeDb(input: Student[]) {
  const students = input.map((s) => ({ ...s }));
  const saves = new Map<string, SaveRow>();
  let sync: Record<string, unknown> | null = null;
  let tick = 0;
  const blankSync = () => ({
    id: 1,
    state: 'idle',
    pauseCode: null,
    lastError: null,
    runLimit: null,
    savedThisRun: 0,
    sentInBatch: 0,
    savedToday: 0,
    dayKey: null,
    nextAt: null,
    startedAt: null,
    startedBy: null,
    lastSavedAt: null,
    updatedAt: new Date(),
  });
  const applyData = (row: Record<string, unknown>, data: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && 'increment' in (value as object)) {
        row[key] = (row[key] as number) + (value as { increment: number }).increment;
      } else row[key] = value;
    }
  };
  const eligible = () => students.filter((s) => s.phone !== '' && (s.role ?? 'student') === 'student' && !s.banned);

  const prisma = {
    whatsappContactSync: {
      upsert: jest.fn(async () => (sync ??= blankSync())),
      findUnique: jest.fn(async () => sync),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        sync ??= blankSync();
        applyData(sync, data);
        return sync;
      }),
      updateMany: jest.fn(async ({ where, data }: { where: { state?: string }; data: Record<string, unknown> }) => {
        if (!sync || (where.state && sync.state !== where.state)) return { count: 0 };
        applyData(sync, data);
        return { count: 1 };
      }),
    },
    whatsappContactSave: {
      createMany: jest.fn(async ({ data }: { data: Array<{ phone: string; userId: string; name: string }> }) => {
        let count = 0;
        for (const row of data) {
          if (saves.has(row.phone)) continue;
          saves.set(row.phone, {
            ...row,
            status: 'pending',
            attempts: 0,
            lastError: null,
            lid: null,
            savedAt: null,
            createdAt: new Date(2026, 0, 1, 0, 0, tick++),
          });
          count += 1;
        }
        return { count };
      }),
      updateMany: jest.fn(async ({ where, data }: { where: { status: string; attempts: { lt: number } }; data: { status: string } }) => {
        let count = 0;
        for (const row of saves.values()) {
          if (row.status === where.status && row.attempts < where.attempts.lt) {
            row.status = data.status;
            count += 1;
          }
        }
        return { count };
      }),
      findFirst: jest.fn(async () => {
        const pending = [...saves.values()].filter((row) => row.status === 'pending');
        pending.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        return pending[0] ?? null;
      }),
      update: jest.fn(async ({ where, data }: { where: { phone: string }; data: Record<string, unknown> }) => {
        const row = saves.get(where.phone)!;
        applyData(row as unknown as Record<string, unknown>, data);
        return row;
      }),
      groupBy: jest.fn(async () => {
        const counts = new Map<string, number>();
        for (const row of saves.values()) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
        return [...counts].map(([status, n]) => ({ status, _count: { _all: n } }));
      }),
    },
    studentProfile: {
      findMany: jest.fn(async () => eligible().map((s) => ({ userId: s.userId, fullName: s.fullName, phone: s.phone }))),
      findUnique: jest.fn(async ({ where }: { where: { userId: string } }) =>
        students.find((s) => s.userId === where.userId) ? { userId: where.userId } : null,
      ),
      count: jest.fn(async () => eligible().length),
    },
  };
  return { prisma: prisma as unknown as PrismaService, saves, sync: () => sync, students };
}

function fakeDevice(answers: Array<ContactSaveResult | Error> = [], state = 'connected') {
  const calls: Array<{ phone: string; name: string }> = [];
  const device = {
    status: jest.fn(async () => ({ state })),
    saveContact: jest.fn(async (phone: string, name: string) => {
      calls.push({ phone, name });
      const next = answers.shift() ?? { saved: true, onWhatsApp: true, lid: null };
      if (next instanceof Error) throw next;
      return next;
    }),
  };
  return { device: device as unknown as WhatsappDeviceService, calls };
}

const STUDENTS: Student[] = [
  { userId: 'u1', fullName: 'أحمد  محمد', phone: '01001234567' },
  { userId: 'u2', fullName: 'منى علي', phone: '+201001234568' },
  // The same number as u1 in another spelling — one contact, not two.
  { userId: 'u3', fullName: 'أخو أحمد', phone: '+20 100 123 4567' },
  { userId: 'u4', fullName: 'رقم بايظ', phone: '123' },
  { userId: 'u5', fullName: 'مساعد', phone: '01001234569', role: 'assistant' },
  { userId: 'u6', fullName: 'محظور', phone: '01001234570', banned: true },
];

/** Runs ticks, each just after the previous one's `nextAt`. */
async function drain(service: WaContactsService, db: ReturnType<typeof fakeDb>, ticks: number) {
  let now = NOON;
  for (let i = 0; i < ticks; i += 1) {
    await service.step(now, 0);
    const next = db.sync()?.nextAt as Date | null;
    now = next && next > now ? new Date(next.getTime() + 1) : new Date(now.getTime() + 1000);
  }
}

describe('WaContactsService.start', () => {
  it('queues each student number once, students only, valid numbers only', async () => {
    const db = fakeDb(STUDENTS);
    const { device } = fakeDevice();
    const service = new WaContactsService(db.prisma, device);

    const { queued } = await service.start({ limit: null }, 'admin-1', NOON);

    expect(queued).toBe(2);
    expect([...db.saves.keys()].sort()).toEqual(['+201001234567', '+201001234568']);
    expect(db.saves.get('+201001234567')?.name).toBe('أحمد محمد');
    expect(db.sync()?.state).toBe('running');
  });

  it('a second start writes nobody twice and only adds the new sign-ups', async () => {
    const db = fakeDb(STUDENTS);
    const { device } = fakeDevice();
    const service = new WaContactsService(db.prisma, device);
    await service.start({ limit: null }, 'admin-1', NOON);
    db.saves.get('+201001234567')!.status = 'saved';

    db.students.push({ userId: 'u7', fullName: 'جديد', phone: '01001234571' });
    const { queued } = await service.start({ limit: null }, 'admin-1', NOON);

    expect(queued).toBe(1);
    expect(db.saves.get('+201001234567')?.status).toBe('saved');
  });

  it('refuses while the number is not connected, and queues nothing', async () => {
    const db = fakeDb(STUDENTS);
    const { device } = fakeDevice([], 'disconnected');
    const service = new WaContactsService(db.prisma, device);

    await expect(service.start({ limit: null }, 'admin-1', NOON)).rejects.toBeInstanceOf(ConflictException);
    expect(db.saves.size).toBe(0);
    expect(db.sync()).toBeNull();
  });
});

describe('WaContactsService.step', () => {
  it('saves one contact per tick, with the platform name, then finishes', async () => {
    const db = fakeDb(STUDENTS);
    const { device, calls } = fakeDevice();
    const service = new WaContactsService(db.prisma, device);
    await service.start({ limit: null }, 'admin-1', NOON);

    await service.step(NOON, 0);
    expect(calls).toEqual([{ phone: '+201001234567', name: 'أحمد محمد' }]);
    // The next one waits the gap — nothing is written twice in one tick.
    expect((db.sync()?.nextAt as Date).getTime() - NOON.getTime()).toBe(WA_CONTACTS_PACING.minDelaySeconds * 1000);

    await drain(service, db, 4);
    expect(calls).toHaveLength(2);
    expect([...db.saves.values()].every((row) => row.status === 'saved')).toBe(true);
    expect(db.sync()?.state).toBe('done');
  });

  it('does nothing before nextAt', async () => {
    const db = fakeDb(STUDENTS);
    const { device, calls } = fakeDevice();
    const service = new WaContactsService(db.prisma, device);
    await service.start({ limit: null }, 'admin-1', NOON);
    await service.step(NOON, 0);
    await service.step(new Date(NOON.getTime() + 1000), 0);
    expect(calls).toHaveLength(1);
  });

  it('the five-contact trial stops at five and says so', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      userId: `s${i}`,
      fullName: `طالب ${i}`,
      phone: `0100200${String(i).padStart(4, '0')}`,
    }));
    const db = fakeDb(many);
    const { device, calls } = fakeDevice();
    const service = new WaContactsService(db.prisma, device);
    await service.start({ limit: 5 }, 'admin-1', NOON);

    await drain(service, db, 20);

    expect(calls).toHaveLength(5);
    expect(db.sync()?.state).toBe('paused');
    expect(db.sync()?.pauseCode).toBe('limit');
  });

  it('a number with no WhatsApp is marked and does not count toward the day', async () => {
    const db = fakeDb(STUDENTS);
    const { device } = fakeDevice([{ saved: false, onWhatsApp: false, lid: null }]);
    const service = new WaContactsService(db.prisma, device);
    await service.start({ limit: null }, 'admin-1', NOON);

    await service.step(NOON, 0);

    expect(db.saves.get('+201001234567')?.status).toBe('not_on_whatsapp');
    expect(db.sync()?.savedToday).toBe(0);
    expect(db.sync()?.state).toBe('running');
  });

  it('outside the window nothing is written; it waits for ten in the morning', async () => {
    const db = fakeDb(STUDENTS);
    const { device, calls } = fakeDevice();
    const service = new WaContactsService(db.prisma, device);
    const night = fromCairoWall(2026, 11, 3, 23);
    await service.start({ limit: null }, 'admin-1', night);

    await service.step(night, 0);

    expect(calls).toHaveLength(0);
    expect(db.sync()?.nextAt).toEqual(fromCairoWall(2026, 11, 4, 10));
  });

  it('a deleted student is skipped, not saved', async () => {
    const db = fakeDb(STUDENTS);
    const { device, calls } = fakeDevice();
    const service = new WaContactsService(db.prisma, device);
    await service.start({ limit: null }, 'admin-1', NOON);
    db.students.splice(0, 1);

    await service.step(NOON, 0);

    expect(calls).toHaveLength(0);
    expect(db.saves.get('+201001234567')?.status).toBe('skipped');
  });
});

describe('WaContactsService — the first refusal stops the run', () => {
  it.each([
    ['restricted', new WhatsappRestrictedError('timelock', null)],
    ['device', new DeviceOfflineError()],
    ['error', new Error('wa /contacts 500: App state key not present!')],
  ])('%s: paused, and the next student is never reached', async (code, error) => {
    const db = fakeDb(STUDENTS);
    const { device, calls } = fakeDevice([error]);
    const service = new WaContactsService(db.prisma, device);
    await service.start({ limit: null }, 'admin-1', NOON);

    await drain(service, db, 5);

    expect(calls).toHaveLength(1);
    expect(db.sync()?.state).toBe('paused');
    expect(db.sync()?.pauseCode).toBe(code);
    // The row is not lost: it is still pending for «كمّل».
    expect(db.saves.get('+201001234567')?.status).toBe('pending');
    expect(db.saves.get('+201001234568')?.status).toBe('pending');
  });

  it('a number that keeps failing is given up on after three runs, not retried forever', async () => {
    const db = fakeDb(STUDENTS);
    const failing = () => new Error('wa /contacts 500: boom');
    const { device } = fakeDevice([failing(), failing(), failing()]);
    const service = new WaContactsService(db.prisma, device);

    for (let run = 0; run < 3; run += 1) {
      await service.start({ limit: null }, 'admin-1', NOON);
      await service.step(NOON, 0);
    }

    expect(db.saves.get('+201001234567')?.status).toBe('failed');
    // And a fourth start does not resurrect it.
    await service.start({ limit: null }, 'admin-1', NOON);
    expect(db.saves.get('+201001234567')?.status).toBe('failed');
  });

  it('the device going away costs the contact nothing', async () => {
    const db = fakeDb(STUDENTS);
    const { device } = fakeDevice([new DeviceOfflineError(), new DeviceOfflineError(), new DeviceOfflineError()]);
    const service = new WaContactsService(db.prisma, device);
    for (let run = 0; run < 3; run += 1) {
      await service.start({ limit: null }, 'admin-1', NOON);
      await service.step(NOON, 0);
    }
    expect(db.saves.get('+201001234567')?.attempts).toBe(0);
    expect(db.saves.get('+201001234567')?.status).toBe('pending');
  });

  it('«وقّف» stops the next tick', async () => {
    const db = fakeDb(STUDENTS);
    const { device, calls } = fakeDevice();
    const service = new WaContactsService(db.prisma, device);
    await service.start({ limit: null }, 'admin-1', NOON);
    await service.pause();

    await service.step(NOON, 0);

    expect(calls).toHaveLength(0);
    expect(db.sync()?.pauseCode).toBe('manual');
  });
});

describe('WaContactsService.status', () => {
  it('counts every state and the students a full run would queue', async () => {
    const db = fakeDb(STUDENTS);
    const { device } = fakeDevice([{ saved: false, onWhatsApp: false, lid: null }]);
    const service = new WaContactsService(db.prisma, device);
    await service.start({ limit: null }, 'admin-1', NOON);
    await drain(service, db, 3);

    const status = await service.status(NOON);

    expect(status.counts).toEqual({ pending: 0, saved: 1, notOnWhatsapp: 1, failed: 0, skipped: 0 });
    // u1, u2, u3 and u4 have numbers on file (u4's is malformed, u3 is u1's).
    expect(status.studentsWithPhone).toBe(4);
    expect(status.deviceConnected).toBe(true);
    expect(status.state).toBe('done');
  });
});
