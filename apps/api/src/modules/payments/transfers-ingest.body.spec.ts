import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { transfersIngestBodyParser } from './transfers-ingest.body';

/**
 * The plain-text body the Android macro posts. Worth its own test because the
 * failure it prevents is invisible: a malformed body answers 400, and from the
 * outside that is indistinguishable from money never arriving.
 */
function post(body: string, contentType: string): Promise<unknown> {
  const req = Readable.from([Buffer.from(body, 'utf8')]) as unknown as IncomingMessage & {
    body?: unknown;
  };
  req.headers = { 'content-type': contentType };
  return new Promise((resolve) => {
    transfersIngestBodyParser(req, {} as ServerResponse, () => resolve(req.body));
  });
}

describe('transfersIngestBodyParser', () => {
  it('turns a plain-text notification into the shape the DTO validates', async () => {
    const text = 'لقد استلمت 250.00 جنيه من moazkoritam@instapay';
    expect(await post(text, 'text/plain')).toEqual({ text });
  });

  it('reads a charset parameter as plain text', async () => {
    expect(await post('استلمت', 'text/plain; charset=utf-8')).toEqual({ text: 'استلمت' });
  });

  // The whole point: text that would break hand-built JSON goes through
  // untouched.
  it('carries quotes and line breaks that would have broken a hand-built JSON body', async () => {
    const text = 'لقد استلمت 250.00 جنيه من "a"@instapay\nسطر تاني';
    expect(await post(text, 'text/plain')).toEqual({ text });
  });

  it('leaves a JSON body to the parser that already handles it', async () => {
    expect(await post('{"text":"x"}', 'application/json')).toBeUndefined();
  });

  it('leaves an empty body undefined rather than an empty string', async () => {
    expect(await post('', 'text/plain')).toBeUndefined();
  });

  // Half a capture parsed as if it were whole is money nobody is told about.
  it('refuses a body too large to be a notification', async () => {
    expect(await post('ا'.repeat(64 * 1024), 'text/plain')).toBeUndefined();
  });
});
