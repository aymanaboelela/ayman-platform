// `loadEnv` inside the controller validates the WHOLE env schema — same
// dependency `whatsapp-inbound.controller.spec.ts` has on `.env` being present.
import 'dotenv/config';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { WaHistoryIngestController } from './wa-history-ingest.controller';
import type { WaHistoryService } from './wa-history.service';

/**
 * The token is this route's entire authorization story (see the controller's
 * header, and its `KNOWN_GAPS` entry in the matrix), so it is tested here
 * directly — and it is checked BEFORE the body, so a caller without the
 * secret cannot probe the shape either.
 */
describe('WaHistoryIngestController', () => {
  const ingest = jest.fn().mockResolvedValue({ stored: 1, skipped: 0 });
  const controller = new WaHistoryIngestController({ ingest } as unknown as WaHistoryService);
  const body = { entries: [{ phone: '+201012345678', hasChat: true, theyWroteToUs: false }] };

  beforeEach(() => ingest.mockClear());

  afterEach(() => {
    delete process.env.WA_SERVICE_URL;
    delete process.env.WA_SERVICE_TOKEN;
  });

  const configure = (token: string) => {
    process.env.WA_SERVICE_URL = 'http://wa:3400';
    process.env.WA_SERVICE_TOKEN = token;
  };

  it('rejects a missing token without reading the body', async () => {
    configure('secret-1');
    await expect(controller.ingest(undefined, 'not even json')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(ingest).not.toHaveBeenCalled();
  });

  it('rejects a wrong token', async () => {
    configure('secret-1');
    await expect(controller.ingest('secret-2', body)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(ingest).not.toHaveBeenCalled();
  });

  it('fails closed when no token is configured at all', async () => {
    await expect(controller.ingest(undefined, body)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('answers 400 to a malformed batch from the right caller', async () => {
    configure('secret-1');
    await expect(controller.ingest('secret-1', { entries: [] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.ingest('secret-1', { entries: [{ phone: '+2010' }] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(ingest).not.toHaveBeenCalled();
  });

  it('hands a valid batch to the service, minus anything that is not a count', async () => {
    configure('secret-1');
    const withBody = { entries: [{ ...body.entries[0], text: 'رسالة خاصة' }] };
    await expect(controller.ingest('secret-1', withBody)).resolves.toEqual({ ok: true, stored: 1, skipped: 0 });
    expect(ingest).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(ingest.mock.calls[0])).not.toContain('رسالة خاصة');
  });
});
