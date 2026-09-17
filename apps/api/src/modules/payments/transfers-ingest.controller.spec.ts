// `loadEnv` inside the controller validates the WHOLE env schema, not just
// `INSTAPAY_INGEST_TOKEN` — the same dependency `whatsapp-inbound.controller
// .spec.ts` has on `.env` being present, for the same reason. See that file.
import 'dotenv/config';
import { UnauthorizedException } from '@nestjs/common';

import { TransfersIngestController } from './transfers-ingest.controller';
import type { TransfersService } from './transfers.service';

/**
 * The token gate, which is the whole of this route's authorization — see the
 * controller's own doc for why there is no session to check, and the
 * `KNOWN_GAPS` entry in `authorization-matrix.int-spec.ts` that points here.
 */
describe('TransfersIngestController', () => {
  const result = { read: 1, created: 1, duplicates: 0, matched: 1, unreadable: 0 };
  const body = { text: 'لقد استلمت 250.13 جنيه من moazkoritam@instapay' };

  let ingest: jest.Mock;
  let controller: TransfersIngestController;
  const originalToken = process.env.INSTAPAY_INGEST_TOKEN;

  beforeEach(() => {
    ingest = jest.fn().mockResolvedValue(result);
    controller = new TransfersIngestController({ ingest } as unknown as TransfersService);
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.INSTAPAY_INGEST_TOKEN;
    else process.env.INSTAPAY_INGEST_TOKEN = originalToken;
  });

  it('accepts a capture carrying the configured token', async () => {
    process.env.INSTAPAY_INGEST_TOKEN = 'secret-token';
    await expect(controller.ingest('secret-token', body)).resolves.toEqual(result);
    expect(ingest).toHaveBeenCalledWith(body);
  });

  it('refuses a wrong token', async () => {
    process.env.INSTAPAY_INGEST_TOKEN = 'secret-token';
    await expect(controller.ingest('not-the-token', body)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(ingest).not.toHaveBeenCalled();
  });

  it('refuses a request with no token at all', async () => {
    process.env.INSTAPAY_INGEST_TOKEN = 'secret-token';
    await expect(controller.ingest(undefined, body)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  // An unconfigured deployment has not opted into this feature. Waving
  // requests through because no token is set would open a paid course to
  // anyone who found the URL.
  it('refuses everything when no token is configured', async () => {
    delete process.env.INSTAPAY_INGEST_TOKEN;
    await expect(controller.ingest(undefined, body)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.ingest('', body)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.ingest('anything', body)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(ingest).not.toHaveBeenCalled();
  });
});
