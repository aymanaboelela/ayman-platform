import { describe, expect, it } from 'vitest';
import { CLIENT_IP_HEADER, forwardClientIp } from './client-ip';

describe('forwardClientIp', () => {
  it('carries the visitor address Cloudflare set', () => {
    expect(forwardClientIp(new Headers({ [CLIENT_IP_HEADER]: '41.35.1.2' }))).toEqual({
      'cf-connecting-ip': '41.35.1.2',
    });
  });

  it('forwards nothing when there is no Cloudflare in front (local, CI)', () => {
    expect(forwardClientIp(new Headers())).toEqual({});
    expect(forwardClientIp(new Headers({ [CLIENT_IP_HEADER]: '   ' }))).toEqual({});
  });

  it('never forwards x-forwarded-for, which a client can write into', () => {
    expect(forwardClientIp(new Headers({ 'x-forwarded-for': '6.6.6.6' }))).toEqual({});
  });
});
