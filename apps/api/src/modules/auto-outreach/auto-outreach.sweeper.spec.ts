import { OutreachSettingsSchema } from '@ayman/contracts/admin/settings';
import { NotOnWhatsAppError } from '../marketing/whatsapp-device.service';
import type { DeliverInput, WhatsappRelay } from '../outreach/outreach.service';
import type { DueMessage } from './auto-outreach-candidates.service';
import { AutoOutreachSweeper } from './auto-outreach.sweeper';

/**
 * The sweeper's promises about the WhatsApp number, with every collaborator
 * stubbed — the eligibility rules have their own spec; this one is about what
 * happens AROUND a send: nothing while the device is down, never at night,
 * one per tick, an opt-out honoured, and a failed send leaving no trace.
 */

/** 14:00 Cairo. */
const AFTERNOON = new Date('2026-10-20T11:00:00Z');
/** 03:00 Cairo. */
const NIGHT = new Date('2026-10-20T00:00:00Z');

function due(userId: string, intentId: string | null = `intent-${userId}`): DueMessage {
  return {
    intentId,
    input: {
      userId,
      kind: 'checkout_recovery',
      dedupeKey: `${intentId}:1`,
      facts: { kind: 'checkout_recovery', target: 'course', title: 'البرمجة', url: 'https://x.test/c/subscribe' },
    },
  };
}

function build(options: {
  state?: string;
  queue?: DueMessage[];
  optedOut?: string[];
  send?: jest.Mock;
  sentToday?: number;
}) {
  const settings = OutreachSettingsSchema.parse({});
  const updates: unknown[] = [];
  const delivered: DeliverInput[] = [];

  const prisma = {
    outreachMessage: {
      count: jest.fn().mockResolvedValue(options.sentToday ?? 0),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    checkoutIntent: { update: jest.fn(async (args: unknown) => updates.push(args)) },
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ({
        phoneNumber: `+2010000000${where.id.slice(-2).padStart(2, '0')}`,
      })),
    },
    marketingOptOut: {
      findUnique: jest.fn(async ({ where }: { where: { phone: string } }) =>
        (options.optedOut ?? []).includes(where.phone) ? { phone: where.phone } : null,
      ),
    },
  };
  const outreach = {
    context: jest.fn().mockResolvedValue({ settings, whatsappUrl: null }),
    // The real `deliver` calls the relay after its guards and before writing;
    // a relay that throws means nothing was written.
    deliver: jest.fn(async (input: DeliverInput, _context: unknown, relay?: WhatsappRelay) => {
      if (relay) await relay('نص الرسالة');
      delivered.push(input);
      return 'sent' as const;
    }),
  };
  const send = options.send ?? jest.fn().mockResolvedValue({ messageId: 'wa-1' });
  const device = {
    enabled: true,
    status: jest.fn().mockResolvedValue({ state: options.state ?? 'connected' }),
    send,
  };
  const candidates = {
    checkoutDue: jest.fn().mockResolvedValue(options.queue ?? []),
    signupDue: jest.fn().mockResolvedValue([]),
  };
  const sweeper = new AutoOutreachSweeper(
    prisma as never,
    outreach as never,
    device as never,
    candidates as never,
    {} as never,
  );
  return { sweeper, prisma, outreach, device, candidates, send, updates, delivered };
}

describe('AutoOutreachSweeper.step', () => {
  it.each(['disconnected', 'unreachable', 'linking', 'disabled'])(
    'sends nothing and marks nothing while the device is %s',
    async (state) => {
      const t = build({ state, queue: [due('u01')] });
      expect(await t.sweeper.step(AFTERNOON)).toBe('blocked');
      expect(t.candidates.checkoutDue).not.toHaveBeenCalled();
      expect(t.outreach.deliver).not.toHaveBeenCalled();
      expect(t.updates).toEqual([]);
    },
  );

  it('sends nothing at night, even with a queue', async () => {
    const t = build({ queue: [due('u01')] });
    expect(await t.sweeper.step(NIGHT)).toBe('blocked');
    expect(t.outreach.deliver).not.toHaveBeenCalled();
  });

  it('stops at the daily ceiling', async () => {
    const t = build({ queue: [due('u01')], sentToday: 30 });
    expect(await t.sweeper.step(AFTERNOON)).toBe('blocked');
    expect(t.send).not.toHaveBeenCalled();
  });

  it('sends ONE WhatsApp message per tick and stamps the checkout', async () => {
    const t = build({ queue: [due('u01'), due('u02'), due('u03')] });
    expect(await t.sweeper.step(AFTERNOON)).toBe('sent');
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.delivered.map((d) => d.userId)).toEqual(['u01']);
    expect(t.updates).toEqual([{ where: { id: 'intent-u01' }, data: { remindedAt: AFTERNOON } }]);
  });

  it('honours an opt-out: chat only, no WhatsApp, and the tick moves on', async () => {
    const t = build({ queue: [due('u01'), due('u02')], optedOut: ['+201000000001'] });
    expect(await t.sweeper.step(AFTERNOON)).toBe('sent');
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.send).toHaveBeenCalledWith(expect.objectContaining({ phone: '+201000000002' }));
    // Both were written about — the opted-out one into the chat only.
    expect(t.delivered.map((d) => d.userId)).toEqual(['u01', 'u02']);
  });

  it('treats a number that is not on WhatsApp as chat-only, not as a fault', async () => {
    const send = jest
      .fn()
      .mockRejectedValueOnce(new NotOnWhatsAppError('+201000000001'))
      .mockResolvedValue({ messageId: 'wa-2' });
    const t = build({ queue: [due('u01'), due('u02')], send });
    expect(await t.sweeper.step(AFTERNOON)).toBe('sent');
    expect(t.delivered.map((d) => d.userId)).toEqual(['u01', 'u02']);
  });

  it('leaves no trace when the sidecar fails — the same student is first next tick', async () => {
    const send = jest.fn().mockRejectedValue(new Error('wa /send 500'));
    const t = build({ queue: [due('u01'), due('u02')], send });
    expect(await t.sweeper.step(AFTERNOON)).toBe('blocked');
    expect(t.delivered).toEqual([]);
    expect(t.updates).toEqual([]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does nothing at all when both kinds are switched off', async () => {
    const t = build({ queue: [due('u01')] });
    t.outreach.context.mockResolvedValue({
      settings: OutreachSettingsSchema.parse({ checkoutRecovery: false, signupNudge: false }),
      whatsappUrl: null,
    });
    expect(await t.sweeper.step(AFTERNOON)).toBe('idle');
    expect(t.device.status).not.toHaveBeenCalled();
  });
});
