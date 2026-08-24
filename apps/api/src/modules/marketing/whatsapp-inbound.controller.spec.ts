// `loadEnv` inside the controller validates the WHOLE env schema, not just
// the two WA_* variables this spec cares about — same dependency
// `csrf.guard.spec.ts` has on `.env` being present. See that file's own note.
import 'dotenv/config';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { CampaignService } from './campaign.service';
import { WhatsappInboundController } from './whatsapp-inbound.controller';

/**
 * The token check is the entire authorization story for this route (see its
 * class comment on why it is not in the session-based authz matrix), so it
 * gets its own direct test rather than relying on that matrix's KNOWN_GAPS
 * entry to mean "untested".
 */
describe('WhatsappInboundController', () => {
  const addOptOut = jest.fn().mockResolvedValue(undefined);
  const campaigns = { addOptOut } as unknown as CampaignService;
  const controller = new WhatsappInboundController(campaigns);

  beforeEach(() => {
    addOptOut.mockClear();
  });

  afterEach(() => {
    delete process.env.WA_SERVICE_URL;
    delete process.env.WA_SERVICE_TOKEN;
  });

  const configure = (token: string) => {
    process.env.WA_SERVICE_URL = 'http://wa:3400';
    process.env.WA_SERVICE_TOKEN = token;
  };

  it('rejects a missing token', async () => {
    configure('secret-1');
    await expect(controller.inbound(undefined, { phone: '+201000000000', text: 'قف' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(addOptOut).not.toHaveBeenCalled();
  });

  it('rejects a wrong token', async () => {
    configure('secret-1');
    await expect(
      controller.inbound('secret-2', { phone: '+201000000000', text: 'قف' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when no token is configured at all — fail closed, not open', async () => {
    // Neither env var set: `expected` is undefined, and an undefined
    // "expected" must never compare equal to an undefined "provided".
    await expect(controller.inbound(undefined, { phone: '+201000000000', text: 'قف' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('accepts the matching token and records an opt-out for the stop word', async () => {
    configure('secret-1');
    const result = await controller.inbound('secret-1', { phone: '+201000000000', text: 'قف' });
    expect(result).toEqual({ ok: true });
    expect(addOptOut).toHaveBeenCalledWith('+201000000000', 'قف');
  });

  it('does not record an opt-out for an ordinary reply', async () => {
    configure('secret-1');
    await controller.inbound('secret-1', { phone: '+201000000000', text: 'تمام يا بشمهندس' });
    expect(addOptOut).not.toHaveBeenCalled();
  });

  it('rejects a body missing phone or text', async () => {
    configure('secret-1');
    await expect(controller.inbound('secret-1', { text: 'قف' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.inbound('secret-1', { phone: '+201000000000' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('swallows a downstream failure to record the opt-out — the sidecar gets its ack regardless', async () => {
    configure('secret-1');
    addOptOut.mockRejectedValueOnce(new Error('not a valid egyptian number'));
    await expect(controller.inbound('secret-1', { phone: '+1555', text: 'stop' })).resolves.toEqual({ ok: true });
  });
});
