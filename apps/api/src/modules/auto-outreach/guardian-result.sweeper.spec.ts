import { OutreachSettingsSchema, type QuizResultRecipient } from '@ayman/contracts/admin/settings';
import { NotOnWhatsAppError, WhatsappRestrictedError } from '../marketing/whatsapp-device.service';
import type { DeliverInput } from '../outreach/outreach.service';
import { GuardianResultSweeper } from './guardian-result.sweeper';

/**
 * «نتيجة الامتحان لولي الأمر» — what happens around one guardian send, every
 * collaborator stubbed: nothing at the default, nothing while the device is
 * down or at night, one message per tick, the claim before the send, a bad
 * number skipped quietly, and the student never left without a message.
 */

/** 14:00 Cairo. */
const AFTERNOON = new Date('2026-10-20T11:00:00Z');
/** 03:00 Cairo. */
const NIGHT = new Date('2026-10-20T00:00:00Z');

function paper(id: string, fatherPhone: string | null = '01012345678') {
  return {
    id,
    userId: `user-${id}`,
    scaledScore: 17,
    gradeOutOf: 20,
    quiz: { lesson: { title: 'كويز الحلقات' } },
    user: { name: 'سارة محمد', studentProfile: { fatherPhone } },
    questions: [],
  };
}

function uniqueViolation(): Error {
  return Object.assign(new Error('unique'), { code: 'P2002' });
}

function build(options: {
  setting?: QuizResultRecipient;
  quizResult?: boolean;
  state?: string;
  papers?: ReturnType<typeof paper>[];
  optedOut?: string[];
  send?: jest.Mock;
  claimed?: string[];
}) {
  const settings = OutreachSettingsSchema.parse({
    quizResultTo: options.setting ?? 'both',
    quizResult: options.quizResult ?? true,
  });
  const ledger = new Map<string, { status: string; phone: string; whatsappMessageId?: string | null }>();
  for (const id of options.claimed ?? []) ledger.set(id, { status: 'sent', phone: 'x' });

  const prisma = {
    guardianResultMessage: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }: { data: { attemptId: string; phone: string; status: string } }) => {
        if (ledger.has(data.attemptId)) throw uniqueViolation();
        ledger.set(data.attemptId, { status: data.status, phone: data.phone });
        return data;
      }),
      update: jest.fn(async ({ where, data }: { where: { attemptId: string }; data: { status: string } }) => {
        ledger.set(where.attemptId, { ...ledger.get(where.attemptId)!, ...data });
        return data;
      }),
      deleteMany: jest.fn(async ({ where }: { where: { attemptId: string } }) => {
        ledger.delete(where.attemptId);
        return { count: 1 };
      }),
    },
    siteSetting: { findUnique: jest.fn().mockResolvedValue({ updatedAt: new Date('2026-10-19T00:00:00Z') }) },
    quizAttempt: { findMany: jest.fn().mockResolvedValue(options.papers ?? [paper('a1')]) },
    marketingOptOut: {
      findUnique: jest.fn(async ({ where }: { where: { phone: string } }) =>
        (options.optedOut ?? []).includes(where.phone) ? { phone: where.phone } : null,
      ),
    },
  };
  const delivered: DeliverInput[] = [];
  const outreach = {
    context: jest.fn().mockResolvedValue({ settings, whatsappUrl: null }),
    deliver: jest.fn(async (input: DeliverInput) => {
      delivered.push(input);
      return 'sent' as const;
    }),
  };
  const send = options.send ?? jest.fn().mockResolvedValue({ messageId: 'wa-1' });
  const device = {
    enabled: true,
    status: jest.fn().mockResolvedValue({ state: options.state ?? 'connected' }),
    assertWithinCeiling: jest.fn().mockResolvedValue(undefined),
    send,
  };
  const sweeper = new GuardianResultSweeper(prisma as never, outreach as never, device as never, {} as never);
  return { sweeper, prisma, outreach, device, send, ledger, delivered };
}

describe('GuardianResultSweeper.step', () => {
  it('does nothing at the default — the student only, as before', async () => {
    const t = build({ setting: 'student' });
    expect(await t.sweeper.step(AFTERNOON)).toBe('idle');
    expect(t.device.status).not.toHaveBeenCalled();
    expect(t.prisma.quizAttempt.findMany).not.toHaveBeenCalled();
  });

  it('does nothing while result messages are switched off altogether', async () => {
    const t = build({ quizResult: false });
    expect(await t.sweeper.step(AFTERNOON)).toBe('idle');
    expect(t.send).not.toHaveBeenCalled();
  });

  it.each(['disconnected', 'unreachable', 'linking'])('writes nothing while the device is %s', async (state) => {
    const t = build({ state });
    expect(await t.sweeper.step(AFTERNOON)).toBe('blocked');
    expect(t.ledger.size).toBe(0);
  });

  it('sends nothing at night', async () => {
    const t = build({});
    expect(await t.sweeper.step(NIGHT)).toBe('blocked');
    expect(t.send).not.toHaveBeenCalled();
  });

  it('sends ONE message per tick to the guardian, claimed first and stamped sent', async () => {
    const t = build({ papers: [paper('a1'), paper('a2')] });
    expect(await t.sweeper.step(AFTERNOON)).toBe('sent');
    expect(t.send).toHaveBeenCalledTimes(1);
    const [call] = t.send.mock.calls[0] as [{ phone: string; text: string; source: string }];
    expect(call.phone).toBe('+201012345678');
    expect(call.source).toBe('outreach');
    expect(call.text).toContain('سارة');
    expect(call.text).toContain('«كويز الحلقات»');
    expect(call.text).toContain('85٪');
    expect(t.ledger.get('a1')).toEqual(expect.objectContaining({ status: 'sent', whatsappMessageId: 'wa-1' }));
    expect(t.ledger.has('a2')).toBe(false);
    // `both`: the student's own message is OutreachSweeper's, not this one's.
    expect(t.delivered).toEqual([]);
  });

  it('a paper already claimed is never sent twice', async () => {
    const t = build({ papers: [paper('a1')], claimed: ['a1'] });
    expect(await t.sweeper.step(AFTERNOON)).toBe('idle');
    expect(t.send).not.toHaveBeenCalled();
  });

  it('skips an unreadable number quietly, and moves on to the next paper', async () => {
    const t = build({ papers: [paper('a1', '12'), paper('a2')] });
    expect(await t.sweeper.step(AFTERNOON)).toBe('sent');
    expect(t.ledger.get('a1')?.status).toBe('no_phone');
    expect(t.send).toHaveBeenCalledTimes(1);
    // The student was already messaged by OutreachSweeper (same resultRoute).
    expect(t.delivered).toEqual([]);
  });

  it('honours an opt-out, and in guardian mode gives the student their own message', async () => {
    const t = build({ setting: 'guardian', papers: [paper('a1')], optedOut: ['+201012345678'] });
    expect(await t.sweeper.step(AFTERNOON)).toBe('idle');
    expect(t.send).not.toHaveBeenCalled();
    expect(t.ledger.get('a1')?.status).toBe('opted_out');
    expect(t.delivered).toEqual([
      expect.objectContaining({ userId: 'user-a1', kind: 'quiz_result', dedupeKey: 'a1' }),
    ]);
  });

  it('in both mode an opt-out adds nothing — the student already had theirs', async () => {
    const t = build({ setting: 'both', papers: [paper('a1')], optedOut: ['+201012345678'] });
    await t.sweeper.step(AFTERNOON);
    expect(t.delivered).toEqual([]);
  });

  it('records a number that is not on WhatsApp, and falls back to the student in guardian mode', async () => {
    const send = jest.fn().mockRejectedValueOnce(new NotOnWhatsAppError('+201012345678'));
    const t = build({ setting: 'guardian', papers: [paper('a1')], send });
    expect(await t.sweeper.step(AFTERNOON)).toBe('idle');
    expect(t.ledger.get('a1')?.status).toBe('not_on_whatsapp');
    expect(t.delivered.map((d) => d.dedupeKey)).toEqual(['a1']);
  });

  it.each([
    ['a sidecar fault', new Error('wa /send 500')],
    ['a WhatsApp new-chat restriction', new WhatsappRestrictedError('timelock', null)],
  ])('hands the claim back on %s — the same paper is first next tick', async (_label, error) => {
    const send = jest.fn().mockRejectedValue(error);
    const t = build({ papers: [paper('a1'), paper('a2')], send });
    expect(await t.sweeper.step(AFTERNOON)).toBe('blocked');
    expect(t.ledger.size).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
    expect(t.delivered).toEqual([]);
  });
});
