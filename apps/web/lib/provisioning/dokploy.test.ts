// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// A container on a bridge whose gateway is 172.18.0.1 — the host.
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async () =>
    [
      'Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT',
      'eth0\t00000000\t010012AC\t0003\t0\t0\t0\t00000000\t0\t0\t0',
      'eth0\t000012AC\t00000000\t0001\t0\t0\t0\t0000FFFF\t0\t0\t0',
    ].join('\n'),
  ),
}));

/** undici's shape: one useless message, the reason on `cause`. */
function networkError(code: string, message = ''): TypeError {
  return Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error(message), { code }) });
}

const fetchMock = vi.fn<(url: URL, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('CONTROL_PLANE_DOKPLOY_KEY', 'key');
  vi.stubEnv('CONTROL_PLANE_DOKPLOY_URL', '');
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/**
 * «Dokploy مردّش دلوقتي — project.all: fetch failed» (2026-10-27): the panel
 * was up — every CI deploy went through it — and `dokploy:3000` did not answer
 * from `web`. The host's published port did.
 */
describe('dokploy — reaching the panel', () => {
  it('falls back to the host gateway when the service name does not resolve', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url.host === 'dokploy:3000') throw networkError('ENOTFOUND');
      return new Response('[]', { status: 200 });
    });
    const { listProjects } = await import('./dokploy');

    await expect(listProjects()).resolves.toEqual([]);
    expect(fetchMock.mock.calls.map(([url]) => url.host)).toEqual(['dokploy:3000', '172.18.0.1:3000']);

    // …and remembers it: the next call goes straight there.
    fetchMock.mockClear();
    await listProjects();
    expect(fetchMock.mock.calls.map(([url]) => url.host)).toEqual(['172.18.0.1:3000']);
  });

  it('names the real reason for every origin instead of «fetch failed»', async () => {
    fetchMock.mockImplementation(async (url) => {
      throw url.host === 'dokploy:3000'
        ? networkError('ENOTFOUND', 'getaddrinfo ENOTFOUND dokploy')
        : networkError('ECONNREFUSED', 'connect ECONNREFUSED 172.18.0.1:3000');
    });
    const { listProjects } = await import('./dokploy');

    await expect(listProjects()).rejects.toThrow(
      'project.all: dokploy:3000 → getaddrinfo ENOTFOUND dokploy · 172.18.0.1:3000 → connect ECONNREFUSED 172.18.0.1:3000',
    );
  });

  it('does not resend a mutation that may already have been received', async () => {
    fetchMock.mockImplementation(async () => {
      throw networkError('UND_ERR_SOCKET');
    });
    const { deployCompose } = await import('./dokploy');

    await expect(deployCompose('c1', 'title')).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('takes an HTTP answer as final — a 401 is Dokploy speaking, not a dead origin', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 401 }));
    const { listProjects } = await import('./dokploy');

    await expect(listProjects()).rejects.toThrow('the API key was refused (401)');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
