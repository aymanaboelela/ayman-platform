// `loadEnv` in the constructor validates the WHOLE env schema — same
// dependency `whatsapp-receipt.controller.spec.ts` documents next door.
import 'dotenv/config';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  DeviceCeilingError,
  NotOnWhatsAppError,
  WhatsappDeviceService,
  WhatsappRestrictedError,
  maskPhone,
} from './whatsapp-device.service';

/**
 * The API's half of the sidecar conversation, with the sidecar replaced by a
 * stubbed `fetch` and Prisma by a recording fake.
 *
 * What these pin is EFFECT: what reaches the ledger, what a 423 turns into,
 * and that the number's ceiling refuses before anything is put on the wire —
 * not merely that some method was called.
 */

type Row = {
  messageId: string;
  source: string;
  toPhone: string;
  fromPhone: string | null;
  sentAt: Date;
  deliveredAt: Date | null;
  readAt: Date | null;
  errorCode: string | null;
  refusedAt: Date | null;
};

function fakePrisma(seed: { usedToday?: number; first?: Date | null; latestFrom?: string | null } = {}) {
  const created: Row[] = [];
  const updates: Array<{ where: unknown; data: unknown }> = [];
  const whatsappSend = {
    create: jest.fn(async ({ data }: { data: Partial<Row> }) => {
      created.push(data as Row);
      return data;
    }),
    updateMany: jest.fn(async (args: { where: unknown; data: unknown }) => {
      updates.push(args);
      return { count: 1 };
    }),
    count: jest.fn(async () => seed.usedToday ?? 0),
    findFirst: jest.fn(async (args: { where?: { fromPhone?: unknown }; orderBy?: { sentAt?: string } }) => {
      if (args.orderBy?.sentAt === 'asc') return seed.first ? { sentAt: seed.first } : null;
      if (args.orderBy?.sentAt === 'desc' && args.where?.fromPhone) {
        return seed.latestFrom ? { fromPhone: seed.latestFrom } : null;
      }
      return null;
    }),
  };
  return { prisma: { whatsappSend } as unknown as PrismaService, created, updates, whatsappSend };
}

function respond(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
}

describe('WhatsappDeviceService', () => {
  const realFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.WA_SERVICE_URL = 'http://wa:3400';
    process.env.WA_SERVICE_TOKEN = 'secret-1';
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.WA_SERVICE_URL;
    delete process.env.WA_SERVICE_TOKEN;
  });

  it('records every send in the ledger, with who sent it and from which number', async () => {
    const { prisma, created } = fakePrisma();
    fetchMock.mockImplementation(() =>
      respond(200, { messageId: 'M1', onWhatsApp: true, jid: 'j', serverJid: 'j', lid: null, sender: '+201110000000' }),
    );
    const service = new WhatsappDeviceService(prisma);

    const result = await service.send({ phone: '+201001234567', text: 'أهلاً', source: 'shipping' });

    expect(result.messageId).toBe('M1');
    expect(created).toEqual([
      { messageId: 'M1', source: 'shipping', toPhone: '+201001234567', fromPhone: '+201110000000' },
    ]);
  });

  it('a send with no source is counted as `other` — never exempted', async () => {
    const { prisma, created } = fakePrisma();
    fetchMock.mockImplementation(() => respond(200, { messageId: 'M2', onWhatsApp: true }));
    await new WhatsappDeviceService(prisma).send({ phone: '+201001234567', text: 'x' });
    expect(created[0]!.source).toBe('other');
  });

  it('refuses BEFORE the wire once the number has spent today’s ceiling', async () => {
    // Day 0 of a brand-new number: the ramp's first step.
    const { prisma } = fakePrisma({ usedToday: 40, first: new Date(), latestFrom: '+201110000000' });
    const service = new WhatsappDeviceService(prisma);

    await expect(service.send({ phone: '+201001234567', text: 'x', source: 'campaign' })).rejects.toBeInstanceOf(
      DeviceCeilingError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a test send is never refused by the ceiling — it is how the operator finds out anything works', async () => {
    const { prisma } = fakePrisma({ usedToday: 999, first: new Date(), latestFrom: '+201110000000' });
    fetchMock.mockImplementation(() => respond(200, { messageId: 'T1', onWhatsApp: true }));
    const result = await new WhatsappDeviceService(prisma).send({ phone: '+201001234567', text: 'x', source: 'test' });
    expect(result.messageId).toBe('T1');
  });

  it('turns the sidecar’s 423 into a typed restriction, with its end time', async () => {
    const { prisma, created } = fakePrisma();
    fetchMock.mockImplementation(() =>
      respond(423, { error: 'whatsapp is not allowing new chats (timelock)', code: 'timelock', until: '2026-10-28T08:00:00.000Z' }),
    );

    const error = await new WhatsappDeviceService(prisma)
      .send({ phone: '+201001234567', text: 'x', source: 'campaign' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(WhatsappRestrictedError);
    expect((error as WhatsappRestrictedError).reason).toBe('timelock');
    expect((error as WhatsappRestrictedError).until?.toISOString()).toBe('2026-10-28T08:00:00.000Z');
    // Nothing went out, so nothing is in the ledger.
    expect(created).toEqual([]);
  });

  it('not on WhatsApp is still its own error, and writes no ledger row', async () => {
    const { prisma, created } = fakePrisma();
    fetchMock.mockImplementation(() => respond(200, { messageId: null, onWhatsApp: false }));
    await expect(
      new WhatsappDeviceService(prisma).send({ phone: '+201001234567', text: 'x', source: 'campaign' }),
    ).rejects.toBeInstanceOf(NotOnWhatsAppError);
    expect(created).toEqual([]);
  });

  it('a failed ledger insert never fails a send that already happened', async () => {
    const { prisma, whatsappSend } = fakePrisma();
    whatsappSend.create.mockRejectedValueOnce(new Error('db down'));
    fetchMock.mockImplementation(() => respond(200, { messageId: 'M3', onWhatsApp: true }));
    await expect(
      new WhatsappDeviceService(prisma).send({ phone: '+201001234567', text: 'x', source: 'campaign' }),
    ).resolves.toEqual(expect.objectContaining({ messageId: 'M3' }));
  });

  it('receipts: delivered and read each set once; a refusal never overwrites a delivery', async () => {
    const { prisma, updates } = fakePrisma();
    const service = new WhatsappDeviceService(prisma);
    const at = new Date('2026-10-28T09:00:00.000Z');

    await service.recordReceipt('M1', 4, null, at);
    expect(updates).toEqual([
      { where: { messageId: 'M1', deliveredAt: null }, data: { deliveredAt: at } },
      { where: { messageId: 'M1', readAt: null }, data: { readAt: at } },
    ]);

    updates.length = 0;
    await service.recordReceipt('M2', 0, '463', at);
    expect(updates).toEqual([
      { where: { messageId: 'M2', deliveredAt: null }, data: { errorCode: '463', refusedAt: at } },
    ]);

    updates.length = 0;
    await service.recordReceipt('M3', 2, null, at);
    expect(updates).toEqual([]);
  });

  it('the test-send receipt carries WhatsApp’s code and its Arabic explanation', async () => {
    fetchMock.mockImplementation(() => respond(200, { messageId: 'T1', status: 0, code: '463' }));
    const receipt = await new WhatsappDeviceService(fakePrisma().prisma).receipt('T1');
    expect(receipt.status).toBe(0);
    expect(receipt.code).toBe('463');
    expect(receipt.explanation).toContain('محادثات جديدة');
  });

  it('passes a pairing phone to the sidecar, and status carries the code and limits', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.endsWith('/status')
        ? respond(200, {
            state: 'linking',
            phone: null,
            qr: null,
            pairingCode: 'ABCD-EFGH',
            detail: null,
            connectedAt: null,
            limits: {
              restricted: false,
              reason: null,
              until: null,
              quotaTotal: null,
              quotaUsed: null,
              capStatus: null,
              checkedAt: null,
            },
          })
        : respond(200, {}),
    );
    const device = await new WhatsappDeviceService(fakePrisma().prisma).link('+201110000000');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ phone: '+201110000000' });
    expect(device.pairingCode).toBe('ABCD-EFGH');
    expect(device.limits?.restricted).toBe(false);
  });

  it('an older sidecar with no limits field still reads as a device, not a crash', async () => {
    fetchMock.mockImplementation(() => respond(200, { state: 'connected', phone: '+201110000000', qr: null, detail: null }));
    const device = await new WhatsappDeviceService(fakePrisma().prisma).status();
    expect(device).toEqual(expect.objectContaining({ state: 'connected', limits: null, pairingCode: null }));
  });
});

describe('maskPhone', () => {
  it('keeps enough to recognise and not enough to dial', () => {
    expect(maskPhone('+201001234567')).toBe('+2010•••••567');
    expect(maskPhone('+2010')).toBe('+2010');
  });
});
