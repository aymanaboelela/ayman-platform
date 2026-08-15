import {
  YouTubeDurationService,
  parseYouTubeEmbeddability,
  parseYouTubeLengthSeconds,
} from './youtube-duration.service';

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

/**
 * The check that did not exist, and whose absence is the whole reason a lecture
 * could save with a correct duration and then show every student «الفيديو مش
 * متاح دلوقتي». The watch page answers for videos the embed player refuses, so
 * the duration succeeding proves nothing about playback.
 */
describe('parseYouTubeEmbeddability', () => {
  it('reads an ordinary playable video as ok', () => {
    expect(parseYouTubeEmbeddability('"playabilityStatus":{"status":"OK","playableInEmbed":true}')).toBe('ok');
  });

  it('treats a missing playableInEmbed on an OK video as ok, not as a block', () => {
    // It is simply absent on most pages. Reading absence as a refusal would
    // warn on nearly every correctly configured lecture.
    expect(parseYouTubeEmbeddability('"playabilityStatus":{"status":"OK"}')).toBe('ok');
  });

  it('catches «السماح بالتضمين» switched off — the one the instructor can fix', () => {
    const html = '"playabilityStatus":{"status":"OK","reason":null},"playableInEmbed":false';
    expect(parseYouTubeEmbeddability(html)).toBe('blocked');
  });

  it('reports private, removed and age-gated videos as unavailable', () => {
    expect(parseYouTubeEmbeddability('"playabilityStatus":{"status":"LOGIN_REQUIRED"')).toBe('unavailable');
    expect(parseYouTubeEmbeddability('"playabilityStatus":{"status":"UNPLAYABLE"')).toBe('unavailable');
    expect(parseYouTubeEmbeddability('"playabilityStatus":{"status":"ERROR"')).toBe('unavailable');
  });

  it('answers unknown — never ok — when the page is not the page we expected', () => {
    // A consent wall, a captcha, a redesign. Guessing `ok` here would be the
    // same silent pass that let the broken videos through in the first place.
    expect(parseYouTubeEmbeddability('<html>Before you continue to YouTube</html>')).toBe('unknown');
  });
});

describe('YouTubeDurationService', () => {
  const service = new YouTubeDurationService();

  it('returns the duration and the embed status from ONE fetch', async () => {
    const spy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () =>
        '"playabilityStatus":{"status":"OK"},"lengthSeconds":"2367","playableInEmbed":false',
    } as Response);

    await expect(service.probe('kiuA96eJ6Q4')).resolves.toEqual({
      durationSeconds: 2367,
      embed: 'blocked',
    });
    // Asking twice would double the traffic to YouTube for facts that live on
    // the same page — and let the two answers describe different moments.
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('reports unknown embeddability when the probe cannot reach YouTube', async () => {
    const spy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('TimeoutError: signal timed out'));
    await expect(service.probe('kiuA96eJ6Q4')).resolves.toEqual({
      durationSeconds: null,
      embed: 'unknown',
    });
    spy.mockRestore();
  });

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
