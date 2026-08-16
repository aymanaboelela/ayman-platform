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

  it('reports a removed video or a terminated channel as unavailable', () => {
    // Neither of these is ever what a challenged scraper is shown, so the page
    // alone is allowed to be believed about them.
    expect(parseYouTubeEmbeddability('"playabilityStatus":{"status":"UNPLAYABLE"')).toBe(
      'unavailable',
    );
    expect(parseYouTubeEmbeddability('"playabilityStatus":{"status":"ERROR"')).toBe('unavailable');
  });

  /**
   * The regression that shipped, and the reason this file no longer trusts the
   * watch page on its own.
   *
   * `LOGIN_REQUIRED` is what YouTube answers a datacenter IP it decides to
   * challenge — «Sign in to confirm you're not a bot» — and it is also what it
   * answers for a genuinely private video. Mapping it to `unavailable` told
   * Ayman his own public 48-minute lecture was private or deleted, on the very
   * first video he tried. A warning that fires on good videos is worse than no
   * warning at all.
   */
  it('refuses to call LOGIN_REQUIRED unavailable — that is also the bot challenge', () => {
    expect(parseYouTubeEmbeddability('"playabilityStatus":{"status":"LOGIN_REQUIRED"')).toBe(
      'unknown',
    );
    expect(
      parseYouTubeEmbeddability('"playabilityStatus":{"status":"AGE_VERIFICATION_REQUIRED"'),
    ).toBe('unknown');
  });

  it('still reports an explicit embed block, whatever the status says around it', () => {
    // `playableInEmbed: false` is a fact about the video, and it survives a
    // challenged page — so it is checked before the status is even read.
    expect(
      parseYouTubeEmbeddability('"playabilityStatus":{"status":"LOGIN_REQUIRED"},"playableInEmbed":false'),
    ).toBe('blocked');
  });

  it('answers unknown — never ok — when the page is not the page we expected', () => {
    // A consent wall, a captcha, a redesign. Guessing `ok` here would be the
    // same silent pass that let the broken videos through in the first place.
    expect(parseYouTubeEmbeddability('<html>Before you continue to YouTube</html>')).toBe('unknown');
  });
});

/**
 * `probe` asks TWO endpoints, and which one is believed about what is the whole
 * point. `fetch` is mocked per-URL here rather than wholesale, because a single
 * `mockResolvedValue` cannot express "the watch page was challenged but oEmbed
 * was fine" — which is the case that shipped broken.
 */
describe('YouTubeDurationService', () => {
  const service = new YouTubeDurationService();

  /** Answers the watch page and oEmbed separately, by URL. */
  function mockYouTube({ page, oembedStatus }: { page: string | null; oembedStatus: number | null }) {
    return jest.spyOn(globalThis, 'fetch').mockImplementation(((input: URL | RequestInfo) => {
      const href = input instanceof URL ? input.href : String(input);
      if (href.includes('/oembed')) {
        if (oembedStatus === null) return Promise.reject(new Error('TimeoutError'));
        return Promise.resolve({ status: oembedStatus, ok: oembedStatus < 400 } as Response);
      }
      if (page === null) return Promise.reject(new Error('TimeoutError'));
      return Promise.resolve({ ok: true, text: async () => page } as Response);
    }) as typeof fetch);
  }

  it('never fetches for anything that is not an 11-character id', async () => {
    const spy = jest.spyOn(globalThis, 'fetch');
    // The SSRF contract in one test: `https://169.254.169.254/` is not an id,
    // so no request is made at all — not "made and filtered".
    await expect(service.durationOf('https://169.254.169.254/')).resolves.toBeNull();
    await expect(service.durationOf('../../etc/passwd')).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('asks youtube.com for the id and reads the duration off the watch page', async () => {
    const spy = mockYouTube({ page: '"lengthSeconds":"2367"', oembedStatus: 200 });

    await expect(service.durationOf('kiuA96eJ6Q4')).resolves.toBe(2367);

    const watch = spy.mock.calls
      .map(([input]) => (input instanceof URL ? input : new URL(String(input))))
      .find((url) => url.pathname === '/watch');
    expect(watch?.origin).toBe('https://www.youtube.com');
    expect(watch?.searchParams.get('v')).toBe('kiuA96eJ6Q4');
    spy.mockRestore();
  });

  /**
   * THE REGRESSION. Ayman pasted a public, embeddable lecture of his own and
   * was told YouTube says it is private or deleted, because the VPS had been
   * served the bot challenge. oEmbed answered 200 for the same video at the
   * same moment — measured 2026-08-16 — so oEmbed is what decides.
   */
  it('believes oEmbed over a challenged watch page', async () => {
    const spy = mockYouTube({
      page: '"playabilityStatus":{"status":"LOGIN_REQUIRED"},"lengthSeconds":"2903"',
      oembedStatus: 200,
    });

    await expect(service.probe('y6Gg7m5UKd4')).resolves.toEqual({
      durationSeconds: 2903,
      embed: 'ok',
    });
    spy.mockRestore();
  });

  it('reports a video oEmbed refuses AND the page calls embed-blocked as blocked', async () => {
    const spy = mockYouTube({
      page: '"playabilityStatus":{"status":"OK"},"playableInEmbed":false',
      oembedStatus: 401,
    });
    await expect(service.probe('kiuA96eJ6Q4')).resolves.toMatchObject({ embed: 'blocked' });
    spy.mockRestore();
  });

  it('reports a 403 from oEmbed with an unreadable page as unavailable', async () => {
    // What a private or deleted video looks like from a server: oEmbed refuses
    // and the page says nothing usable.
    const spy = mockYouTube({ page: null, oembedStatus: 403 });
    await expect(service.probe('kiuA96eJ6Q4')).resolves.toEqual({
      durationSeconds: null,
      embed: 'unavailable',
    });
    spy.mockRestore();
  });

  it('reports a 404 from oEmbed as unavailable — there is no such video', async () => {
    const spy = mockYouTube({ page: null, oembedStatus: 404 });
    await expect(service.probe('kiuA96eJ6Q4')).resolves.toMatchObject({ embed: 'unavailable' });
    spy.mockRestore();
  });

  it('falls back to the page when oEmbed itself does not answer', async () => {
    const spy = mockYouTube({
      page: '"playabilityStatus":{"status":"OK"},"lengthSeconds":"600"',
      oembedStatus: null,
    });
    await expect(service.probe('kiuA96eJ6Q4')).resolves.toEqual({
      durationSeconds: 600,
      embed: 'ok',
    });
    spy.mockRestore();
  });

  it('answers unknown when NEITHER endpoint could be reached', async () => {
    const spy = mockYouTube({ page: null, oembedStatus: null });
    await expect(service.probe('kiuA96eJ6Q4')).resolves.toEqual({
      durationSeconds: null,
      embed: 'unknown',
    });
    spy.mockRestore();
  });

  it('turns a network failure into null rather than a 500', async () => {
    const spy = mockYouTube({ page: null, oembedStatus: null });
    await expect(service.durationOf('kiuA96eJ6Q4')).resolves.toBeNull();
    spy.mockRestore();
  });
});
