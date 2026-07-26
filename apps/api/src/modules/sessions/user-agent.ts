/**
 * Turns a raw `User-Agent` header into a human-readable device label —
 * "Chrome على macOS" — without a fingerprinting library. This is
 * deliberately a coarse, best-effort classifier: it exists so a student can
 * recognise "oh, that's my phone" on the أجهزتي page, not to uniquely
 * identify a device. Order matters throughout (Edge and Opera both carry
 * "Chrome" in their UA string; Chrome carries "Safari"; a mobile Chrome UA
 * carries both "Mobile" and "Safari") — every check here is written most
 * specific first.
 *
 * These are plain runtime strings composed server-side from parsed data,
 * not static UI copy — same precedent Task 3 already established for the
 * generic login error message living in `apps/api` rather than
 * `packages/contracts` (that constraint targets UI *components*, not
 * API-layer strings the server assembles from request data).
 */

const UNKNOWN_BROWSER = 'متصفح غير معروف';
const UNKNOWN_OS = 'نظام غير معروف';
const UNKNOWN_DEVICE_NAME = 'جهاز غير معروف';

export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'unknown';

export interface ParsedDevice {
  deviceName: string;
  deviceType: DeviceType;
}

function detectBrowser(ua: string): string {
  if (/EdgA?\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/SamsungBrowser\//.test(ua)) return 'Samsung Internet';
  if (/FxiOS\//.test(ua)) return 'Firefox';
  if (/CriOS\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Chrome\//.test(ua) && !/Chromium\//.test(ua)) return 'Chrome';
  // Real Safari always carries both "Safari/" and "Version/" — Chrome and
  // most other browsers ship a "Safari/xxx" token too (for compatibility)
  // but never "Version/", so checking both is what excludes them.
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return 'Safari';
  return UNKNOWN_BROWSER;
}

function detectOs(ua: string): string {
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Linux/.test(ua)) return 'Linux';
  return UNKNOWN_OS;
}

function detectDeviceType(ua: string): DeviceType {
  if (/iPad/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) return 'tablet';
  if (/iPhone|iPod|Mobile/.test(ua)) return 'mobile';
  return 'desktop';
}

export function parseUserAgent(userAgent: string | null | undefined): ParsedDevice {
  if (!userAgent || userAgent.trim().length === 0) {
    return { deviceName: UNKNOWN_DEVICE_NAME, deviceType: 'unknown' };
  }

  const browser = detectBrowser(userAgent);
  const os = detectOs(userAgent);

  return {
    deviceName: `${browser} على ${os}`,
    deviceType: detectDeviceType(userAgent),
  };
}
