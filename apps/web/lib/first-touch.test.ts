import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACQUISITION_FBCLID_MAX,
  ACQUISITION_TOUCH_TTL_SECONDS,
  ACQUISITION_VALUE_MAX,
} from '@ayman/contracts/acquisition-touch';
import {
  FIRST_TOUCH_KEY,
  captureFirstTouch,
  handOverFirstTouch,
  readFirstTouch,
} from './first-touch';

/**
 * The browser's half of «الحساب ده جه منين», against a real `localStorage`
 * (jsdom's). Every assertion reads back what is STORED or what was SENT — the
 * two things the API and the report will actually see — rather than what a
 * helper returned along the way.
 */

const NOW = Date.parse('2026-11-18T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const AD = '?utm_source=facebook&utm_medium=paid&utm_campaign=y2-languages-lesson10-reel&fbclid=IwAR0abc';

const stored = () => readFirstTouch(window.localStorage, NOW);

describe('captureFirstTouch', () => {
  beforeEach(() => window.localStorage.clear());

  it('keeps the ad link a visitor landed through, and the page it landed on', () => {
    captureFirstTouch(window.localStorage, { search: AD, pathname: '/courses/y2' }, NOW);

    expect(stored()).toEqual({
      source: 'facebook',
      medium: 'paid',
      campaign: 'y2-languages-lesson10-reel',
      content: null,
      term: null,
      fbclid: 'IwAR0abc',
      landingPath: '/courses/y2',
      at: NOW,
    });
  });

  it('stores nothing for a URL that carries no ad parameter', () => {
    captureFirstTouch(window.localStorage, { search: '?next=%2Fdashboard&page=2', pathname: '/login' }, NOW);

    expect(window.localStorage.getItem(FIRST_TOUCH_KEY)).toBeNull();
  });

  it('counts a click that carried only Facebook’s own click id', () => {
    captureFirstTouch(window.localStorage, { search: '?fbclid=IwAR0only', pathname: '/' }, NOW);

    expect(stored()).toMatchObject({ source: null, campaign: null, fbclid: 'IwAR0only' });
  });

  it('does NOT let a later ad overwrite the first one', () => {
    captureFirstTouch(window.localStorage, { search: AD, pathname: '/courses/y2' }, NOW - 3 * DAY);
    captureFirstTouch(
      window.localStorage,
      { search: '?utm_source=tiktok&utm_medium=paid&utm_campaign=second-ad', pathname: '/register' },
      NOW,
    );

    // The effect, not the mechanism: what a sign-up today would be credited to.
    expect(stored()).toMatchObject({
      source: 'facebook',
      campaign: 'y2-languages-lesson10-reel',
      landingPath: '/courses/y2',
      at: NOW - 3 * DAY,
    });
  });

  it('lets a new ad in once the first touch has expired', () => {
    const longAgo = NOW - (ACQUISITION_TOUCH_TTL_SECONDS * 1000 + DAY);
    captureFirstTouch(window.localStorage, { search: AD, pathname: '/' }, longAgo);
    expect(stored()).toBeNull();

    captureFirstTouch(window.localStorage, { search: '?utm_source=tiktok&utm_campaign=second-ad', pathname: '/' }, NOW);

    expect(stored()).toMatchObject({ source: 'tiktok', campaign: 'second-ad', at: NOW });
  });

  it('replaces a stored value it cannot read rather than being blocked by it', () => {
    window.localStorage.setItem(FIRST_TOUCH_KEY, '{not json');

    captureFirstTouch(window.localStorage, { search: AD, pathname: '/' }, NOW);

    expect(stored()).toMatchObject({ source: 'facebook' });
  });

  it('caps and cleans what a stranger typed into the URL', () => {
    const search = `?${new URLSearchParams({
      utm_source: '  FaceBook\n',
      utm_medium: 'PAID',
      utm_campaign: `x${'a'.repeat(5000)}`,
      utm_content: 'line one\r\nline\ttwo\u0000',
      utm_term: '   ',
      fbclid: 'f'.repeat(5000),
    }).toString()}`;

    captureFirstTouch(window.localStorage, { search, pathname: `/${'p'.repeat(2000)}` }, NOW);

    const touch = stored();
    expect(touch?.source).toBe('facebook');
    expect(touch?.medium).toBe('paid');
    expect(touch?.campaign).toHaveLength(ACQUISITION_VALUE_MAX);
    expect(touch?.content).toBe('line one line two');
    expect(touch?.term).toBeNull();
    expect(touch?.fbclid).toHaveLength(ACQUISITION_FBCLID_MAX);
    // Nothing unbounded reached storage either — the cap is on what is KEPT.
    expect(window.localStorage.getItem(FIRST_TOUCH_KEY)!.length).toBeLessThan(2000);
  });

  it('keeps an Arabic landing path readable instead of cutting it mid-escape', () => {
    const pathname = `/courses/${encodeURIComponent('برمجة-تانية-ثانوي')}`;

    captureFirstTouch(window.localStorage, { search: AD, pathname }, NOW);

    expect(stored()?.landingPath).toBe('/courses/برمجة-تانية-ثانوي');
  });

  it('ignores a parameter that is present but empty', () => {
    captureFirstTouch(window.localStorage, { search: '?utm_source=&utm_campaign=', pathname: '/' }, NOW);

    expect(window.localStorage.getItem(FIRST_TOUCH_KEY)).toBeNull();
  });
});

describe('handOverFirstTouch', () => {
  beforeEach(() => window.localStorage.clear());

  it('sends nothing when the browser holds no touch', async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    await expect(handOverFirstTouch(window.localStorage, send, NOW)).resolves.toBe('none');
    expect(send).not.toHaveBeenCalled();
  });

  it('sends the touch as an AGE and forgets it once the API has answered', async () => {
    captureFirstTouch(window.localStorage, { search: AD, pathname: '/courses/y2' }, NOW - 90_000);
    const send = vi.fn().mockResolvedValue(undefined);

    await expect(handOverFirstTouch(window.localStorage, send, NOW)).resolves.toBe('sent');

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      source: 'facebook',
      medium: 'paid',
      campaign: 'y2-languages-lesson10-reel',
      content: null,
      term: null,
      fbclid: 'IwAR0abc',
      landingPath: '/courses/y2',
      ageSeconds: 90,
    });
    expect(window.localStorage.getItem(FIRST_TOUCH_KEY)).toBeNull();

    // …so the next page of the same visit does not ask again.
    await handOverFirstTouch(window.localStorage, send, NOW);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('never reports a negative age when the clock moved backwards', async () => {
    captureFirstTouch(window.localStorage, { search: AD, pathname: '/' }, NOW + 60_000);
    const send = vi.fn().mockResolvedValue(undefined);

    await handOverFirstTouch(window.localStorage, send, NOW);

    expect(send.mock.calls[0]![0].ageSeconds).toBe(0);
  });

  it.each([
    ['the request never arrived', new TypeError('Failed to fetch')],
    ['the session was not there yet', Object.assign(new Error('401'), { status: 401 })],
    ['the API was rate-limiting', Object.assign(new Error('429'), { status: 429 })],
    ['the API fell over', Object.assign(new Error('502'), { status: 502 })],
  ])('keeps the touch for the next page when %s', async (_why, failure) => {
    captureFirstTouch(window.localStorage, { search: AD, pathname: '/' }, NOW);
    const send = vi.fn().mockRejectedValue(failure);

    await expect(handOverFirstTouch(window.localStorage, send, NOW)).resolves.toBe('kept');

    expect(stored()).toMatchObject({ campaign: 'y2-languages-lesson10-reel' });
  });

  it('drops a touch the API says it will never accept', async () => {
    captureFirstTouch(window.localStorage, { search: AD, pathname: '/' }, NOW);
    const send = vi.fn().mockRejectedValue(Object.assign(new Error('400'), { status: 400 }));

    await expect(handOverFirstTouch(window.localStorage, send, NOW)).resolves.toBe('dropped');

    expect(window.localStorage.getItem(FIRST_TOUCH_KEY)).toBeNull();
  });

  it('does not send a touch that expired while it waited', async () => {
    captureFirstTouch(window.localStorage, { search: AD, pathname: '/' }, NOW);
    const send = vi.fn().mockResolvedValue(undefined);
    const later = NOW + ACQUISITION_TOUCH_TTL_SECONDS * 1000 + DAY;

    await expect(handOverFirstTouch(window.localStorage, send, later)).resolves.toBe('none');
    expect(send).not.toHaveBeenCalled();
  });
});
