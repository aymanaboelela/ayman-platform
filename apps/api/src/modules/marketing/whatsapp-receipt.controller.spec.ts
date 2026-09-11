// `loadEnv` inside the controller validates the WHOLE env schema, not just the
// two WA_* variables this spec cares about — same dependency
// `whatsapp-inbound.controller.spec.ts` documents next door.
import 'dotenv/config';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { CampaignService } from './campaign.service';
import { WhatsappReceiptController } from './whatsapp-receipt.controller';

/**
 * The route that makes «اتبعت» and «وصلت» two different words.
 *
 * Its token check is the entire authorization story (see the controller's own
 * class comment on why it is not in the session-based authz matrix), so it is
 * tested directly rather than left to that matrix's KNOWN_GAPS entry.
 *
 * The rest of these assert the EFFECT, not the mechanism: what ends up written
 * for each status WhatsApp can report. A spec that only proved «the handler
 * calls markDelivered» would pass just as happily against a handler wired to
 * the wrong threshold.
 */
describe('WhatsappReceiptController', () => {
  const markDelivered = jest.fn().mockResolvedValue(undefined);
  const markRefused = jest.fn().mockResolvedValue(undefined);
  const campaigns = { markDelivered, markRefused } as unknown as CampaignService;
  const controller = new WhatsappReceiptController(campaigns);

  beforeEach(() => {
    markDelivered.mockClear();
    markRefused.mockClear();
    process.env.WA_SERVICE_URL = 'http://wa:3400';
    process.env.WA_SERVICE_TOKEN = 'secret-1';
  });

  afterEach(() => {
    delete process.env.WA_SERVICE_URL;
    delete process.env.WA_SERVICE_TOKEN;
  });

  it('rejects a missing, wrong, or unconfigured token — and writes nothing', async () => {
    await expect(controller.receipt(undefined, { messageId: 'A', status: 3 })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(controller.receipt('secret-2', { messageId: 'A', status: 3 })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    // Fail closed: no sender configured at all must not mean "wave everything
    // through". BOTH vars go — `loadEnv` requires the token whenever the URL
    // is set, so deleting only one tests the env schema rather than this
    // handler. Same shape as the inbound spec's version of this case.
    delete process.env.WA_SERVICE_URL;
    delete process.env.WA_SERVICE_TOKEN;
    await expect(controller.receipt('secret-1', { messageId: 'A', status: 3 })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(markDelivered).not.toHaveBeenCalled();
    expect(markRefused).not.toHaveBeenCalled();
  });

  it('needs both a message id and a status', async () => {
    await expect(controller.receipt('secret-1', { status: 3 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.receipt('secret-1', { messageId: 'A' })).rejects.toBeInstanceOf(BadRequestException);
    // A status of 0 is a real value — `!status` would have swallowed the one
    // that carries WhatsApp's refusal.
    await expect(controller.receipt('secret-1', { messageId: 'A', status: 0 })).resolves.toEqual({ ok: true });
  });

  it('marks delivered at DELIVERY_ACK and above, never below', async () => {
    for (const status of [3, 4, 5]) {
      markDelivered.mockClear();
      await controller.receipt('secret-1', { messageId: 'A', status });
      expect(markDelivered).toHaveBeenCalledWith('A');
    }

    // SERVER_ACK is the tick the platform already assumed. Recording it as
    // delivery is the original bug, restated.
    for (const status of [1, 2]) {
      markDelivered.mockClear();
      await controller.receipt('secret-1', { messageId: 'A', status });
      expect(markDelivered).not.toHaveBeenCalled();
    }
  });

  it('records a refusal reason without touching the status', async () => {
    await controller.receipt('secret-1', {
      messageId: 'A',
      status: 0,
      code: '463',
      detail: 'واتساب رافض يبدأ محادثات جديدة من الرقم ده (463).',
    });

    expect(markRefused).toHaveBeenCalledWith('A', 'واتساب رافض يبدأ محادثات جديدة من الرقم ده (463).');
    // The runner owns attempts and the pending/sent/failed machine; a route
    // with no session behind it must not be able to settle rows.
    expect(markDelivered).not.toHaveBeenCalled();
  });

  it('says nothing about a refusal it cannot explain', async () => {
    await controller.receipt('secret-1', { messageId: 'A', status: 0 });
    expect(markRefused).not.toHaveBeenCalled();
  });

  it('acks a receipt for a message it has never heard of', async () => {
    // Normal, not an error: the shipping-notice path sends on the same device,
    // and so does every message the instructor types on his own phone while
    // the sidecar is linked. The sidecar has no retry logic, so a 4xx here
    // would only be logged there and dropped.
    markDelivered.mockResolvedValueOnce(undefined);
    await expect(controller.receipt('secret-1', { messageId: 'unknown', status: 3 })).resolves.toEqual({
      ok: true,
    });
  });

  it('still acks when the write itself fails', async () => {
    markDelivered.mockRejectedValueOnce(new Error('database is down'));
    await expect(controller.receipt('secret-1', { messageId: 'A', status: 3 })).resolves.toEqual({ ok: true });
  });
});
