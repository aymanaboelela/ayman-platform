import { describe, expect, it } from 'vitest';
import { isPushServiceEndpoint, PushSubscribeSchema } from './push';

describe('isPushServiceEndpoint — the server POSTs here, so only real push services', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc:APA91b',
    'https://updates.push.services.mozilla.com/wpush/v2/gAAAA',
    'https://web.push.apple.com/QGuQyavXutnMH',
    'https://wns2-par02p.notify.windows.com/w/?token=BQYAAA',
  ])('accepts %s', (endpoint) => {
    expect(isPushServiceEndpoint(endpoint)).toBe(true);
  });

  it.each([
    // An internal container, the cloud metadata service, a lookalike host.
    'http://api:3300/api/admin/anything',
    'https://169.254.169.254/latest/meta-data',
    'https://fcm.googleapis.com.evil.example/x',
    'https://evilnotify.windows.com/x',
    // Right host, wrong scheme or port — still not the push service.
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com:8443/fcm/send/abc',
    'https://user:pw@fcm.googleapis.com/fcm/send/abc',
    'not a url',
  ])('refuses %s', (endpoint) => {
    expect(isPushServiceEndpoint(endpoint)).toBe(false);
  });

  it('is what the subscribe schema enforces', () => {
    const keys = { p256dh: 'p', auth: 'a' };
    expect(PushSubscribeSchema.safeParse({ endpoint: 'https://fcm.googleapis.com/x', keys }).success).toBe(
      true,
    );
    expect(PushSubscribeSchema.safeParse({ endpoint: 'http://localhost:3300/x', keys }).success).toBe(false);
  });
});
