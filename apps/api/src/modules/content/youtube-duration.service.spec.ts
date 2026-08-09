import { YouTubeDurationService, parseYouTubeLengthSeconds } from './youtube-duration.service';

describe('parseYouTubeLengthSeconds', () => {
  it('takes videoDetails, not the streamingData copy a second longer', () => {
    // Both keys really do appear, in this order, on every watch page — see the
    // docblock. A container is padded past the video it carries.
    const html =
      '{"videoDetails":{"videoId":"kiuA96eJ6Q4","lengthSeconds":"2367"},' +
      '"streamingData":{"formats":[{"lengthSeconds":"2368"}]}}';
    expect(parseYouTubeLengthSeconds(html)).toBe(2367);
  });

  it('reads a duration out of a real page shape', () => {
    expect(parseYouTubeLengthSeconds('…"lengthSeconds":"612","keywords":[…]')).toBe(612);
  });

  it('refuses 0 — what a live stream reports, and not a duration', () => {
    expect(parseYouTubeLengthSeconds('"lengthSeconds":"0"')).toBeNull();
  });

  it('refuses anything past the 12-hour ceiling the schema also enforces', () => {
    expect(parseYouTubeLengthSeconds('"lengthSeconds":"43201"')).toBeNull();
    expect(parseYouTubeLengthSeconds('"lengthSeconds":"43200"')).toBe(43200);
  });

  it('answers null for the consent page, which carries no such key', () => {
    expect(parseYouTubeLengthSeconds('<html>Before you continue to YouTube</html>')).toBeNull();
  });
});

describe('YouTubeDurationService', () => {
  const service = new YouTubeDurationService();

  it('never fetches for anything that is not an 11-character id', async () => {
    const spy = jest.spyOn(globalThis, 'fetch');
    // The SSRF contract in one test: `https://169.254.169.254/` is not an id,
    // so no request is made at all — not "made and filtered".
    await expect(service.durationOf('https://169.254.169.254/')).resolves.toBeNull();
    await expect(service.durationOf('../../etc/passwd')).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('asks youtube.com for the id and reads the answer', async () => {
    const spy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => '"lengthSeconds":"2367"',
    } as Response);

    await expect(service.durationOf('kiuA96eJ6Q4')).resolves.toBe(2367);

    const requested = spy.mock.calls[0]?.[0] as URL;
    expect(requested.origin).toBe('https://www.youtube.com');
    expect(requested.searchParams.get('v')).toBe('kiuA96eJ6Q4');
    spy.mockRestore();
  });

  it('turns a network failure into null rather than a 500', async () => {
    const spy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('TimeoutError: signal timed out'));
    await expect(service.durationOf('kiuA96eJ6Q4')).resolves.toBeNull();
    spy.mockRestore();
  });

  it('treats a non-200 as "did not say", not as a throw', async () => {
    const spy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: false, status: 429, text: async () => '' } as Response);
    await expect(service.durationOf('kiuA96eJ6Q4')).resolves.toBeNull();
    spy.mockRestore();
  });
});
