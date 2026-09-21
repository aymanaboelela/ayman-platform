import {
  admitsDevice,
  CachedFlag,
  DeviceLimitGate,
  DEVICE_LIMIT_FLAG_DEFAULT,
  MAX_DEVICES_PER_ACCOUNT,
  type ActiveDeviceLookup,
} from './device-limit';

/**
 * «ما ينفعش أي أكاونت يتدخل على أكتر من two devices» — the decision, without
 * Prisma and without Better Auth.
 *
 * The two enforcement points (`databaseHooks.session.create.before`, which can
 * only refuse, and `createAuthBeforeHook`, which can explain) both call
 * `DeviceLimitGate.admits`, so everything that can disagree between them is in
 * this file and covered here.
 */

const CHROME_ANDROID = 'Chrome على Android';
const SAFARI_IOS = 'Safari على iOS';
const EDGE_WINDOWS = 'Edge على Windows';

/** A real Chrome-on-Android string, the commonest device on this platform. */
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/536.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

class FakeDevices implements ActiveDeviceLookup {
  constructor(public names: string[]) {}
  async activeDeviceNames(): Promise<string[]> {
    return this.names;
  }
}

function alwaysOn(): CachedFlag {
  return new CachedFlag(async () => true, true);
}

describe('admitsDevice — the whole decision, as a pure function', () => {
  it('admits while there is room', () => {
    expect(admitsDevice([], CHROME_ANDROID)).toBe(true);
    expect(admitsDevice([CHROME_ANDROID], SAFARI_IOS)).toBe(true);
  });

  it('refuses a THIRD distinct device', () => {
    expect(admitsDevice([CHROME_ANDROID, SAFARI_IOS], EDGE_WINDOWS)).toBe(false);
  });

  /**
   * The case that decides whether this control is usable at all.
   *
   * Sessions last 90 days and nothing signs a student out, so the phone they
   * open every morning accumulates a row per login — one student in the dev
   * cohort has 459 of them. If a familiar device had to find room like a new
   * one, the limit would refuse the person it is supposed to protect on their
   * third sign-in ever.
   */
  it('always admits a device that is already on the list, even at the limit', () => {
    expect(admitsDevice([CHROME_ANDROID, SAFARI_IOS], CHROME_ANDROID)).toBe(true);
  });

  it('counts distinct names, not rows — fifty logins from one phone are one device', () => {
    const fiftyLogins = Array.from({ length: 50 }, () => CHROME_ANDROID);
    expect(admitsDevice(fiftyLogins, SAFARI_IOS)).toBe(true);
    expect(admitsDevice([...fiftyLogins, SAFARI_IOS], EDGE_WINDOWS)).toBe(false);
  });

  it('the limit the platform owner asked for is two', () => {
    expect(MAX_DEVICES_PER_ACCOUNT).toBe(2);
  });
});

describe('DeviceLimitGate — the flag is the switch, and off is the default', () => {
  /**
   * The flag has been declared with zero readers since it was written. Wiring
   * it up must not change behaviour on any stack until an instructor turns it
   * on from the flags screen — three live platforms rebuild from this commit.
   */
  it('is declared off', () => {
    expect(DEVICE_LIMIT_FLAG_DEFAULT).toBe(false);
  });

  it('admits everything while the flag is off, without even asking the database', async () => {
    let asked = false;
    const devices: ActiveDeviceLookup = {
      async activeDeviceNames() {
        asked = true;
        return [CHROME_ANDROID, SAFARI_IOS];
      },
    };
    const gate = new DeviceLimitGate(new CachedFlag(async () => false, false), devices);

    expect(await gate.admits('user-1', ANDROID_UA)).toBe(true);
    expect(asked).toBe(false);
  });

  it('refuses the third device once the flag is on', async () => {
    const gate = new DeviceLimitGate(alwaysOn(), new FakeDevices([SAFARI_IOS, EDGE_WINDOWS]));
    expect(await gate.admits('user-1', ANDROID_UA)).toBe(false);
  });

  it('lets a known device back in at the limit', async () => {
    const gate = new DeviceLimitGate(alwaysOn(), new FakeDevices([CHROME_ANDROID, EDGE_WINDOWS]));
    expect(await gate.admits('user-1', ANDROID_UA)).toBe(true);
  });

  it('reads the device identity off the user agent the same way the device list does', async () => {
    const gate = new DeviceLimitGate(alwaysOn(), new FakeDevices([CHROME_ANDROID, SAFARI_IOS]));
    // Both of these parse to names already on the list, so both are admitted —
    // which is only true if this gate and `parseUserAgent` agree.
    expect(await gate.admits('user-1', ANDROID_UA)).toBe(true);
    expect(await gate.admits('user-1', IPHONE_UA)).toBe(true);
  });

  /**
   * FAIL OPEN, at every step, and this is the test that keeps it that way.
   *
   * The gate runs inside `databaseHooks.session.create.before`, whose only
   * vocabulary is "allow" or "refuse the session write". A device query that
   * times out would otherwise mean nobody on the stack can sign in, register
   * or come back from Google — and the message would be «Failed to create
   * session». Account sharing for the length of an incident is cheaper than
   * that by a wide margin.
   */
  it('admits when the device lookup fails', async () => {
    const devices: ActiveDeviceLookup = {
      async activeDeviceNames() {
        throw new Error('connection terminated');
      },
    };
    const gate = new DeviceLimitGate(alwaysOn(), devices);
    expect(await gate.admits('user-1', ANDROID_UA)).toBe(true);
  });

  it('admits when the flag read fails before it has ever succeeded', async () => {
    const flag = new CachedFlag(async () => {
      throw new Error('connection terminated');
    }, DEVICE_LIMIT_FLAG_DEFAULT);
    const gate = new DeviceLimitGate(flag, new FakeDevices([SAFARI_IOS, EDGE_WINDOWS]));
    expect(await gate.admits('user-1', ANDROID_UA)).toBe(true);
  });

  /**
   * A user agent Better Auth could not read arrives as `''` (it writes
   * `headers?.get("user-agent") || ""`), which `parseUserAgent` turns into one
   * shared «جهاز غير معروف». That collapses every unidentifiable client onto a
   * single slot — an UNDER-count, which admits where it might have refused,
   * and the right way round for a control that must never lock out a paying
   * student over a missing header.
   */
  it('treats an unreadable user agent as one shared device, not as a new one each time', async () => {
    const gate = new DeviceLimitGate(alwaysOn(), new FakeDevices(['جهاز غير معروف', SAFARI_IOS]));
    expect(await gate.admits('user-1', '')).toBe(true);
    expect(await gate.admits('user-1', null)).toBe(true);
  });
});

describe('CachedFlag — one read per TTL, on the sign-in path', () => {
  function clockedFlag(load: () => Promise<boolean>) {
    let now = 0;
    const flag = new CachedFlag(load, false, 30_000, () => now);
    return { flag, advance: (ms: number) => (now += ms) };
  }

  it('reads once and then serves the cached value', async () => {
    let reads = 0;
    const { flag } = clockedFlag(async () => {
      reads += 1;
      return true;
    });

    expect(await flag.enabled()).toBe(true);
    expect(await flag.enabled()).toBe(true);
    expect(await flag.enabled()).toBe(true);
    expect(reads).toBe(1);
  });

  it('re-reads once the TTL has passed, so switching the flag on takes effect', async () => {
    let value = false;
    const { flag, advance } = clockedFlag(async () => value);

    expect(await flag.enabled()).toBe(false);
    value = true;
    expect(await flag.enabled()).toBe(false); // still cached
    advance(30_000);
    expect(await flag.enabled()).toBe(true);
  });

  /**
   * A failed read keeps the last known value and does NOT mark itself fresh —
   * otherwise one transient error would pin a stale answer for a full TTL,
   * including right after an instructor has just switched the flag on.
   */
  it('keeps the last known value on a failed read, and retries on the very next call', async () => {
    let fail = false;
    let reads = 0;
    const { flag, advance } = clockedFlag(async () => {
      reads += 1;
      if (fail) throw new Error('down');
      return true;
    });

    expect(await flag.enabled()).toBe(true);
    expect(reads).toBe(1);

    advance(30_000);
    fail = true;
    expect(await flag.enabled()).toBe(true); // the read threw; last known value stands
    expect(reads).toBe(2);

    // A failed read must NOT mark itself fresh. If it did, one transient error
    // would pin a stale answer for a full TTL — including right after an
    // instructor switched the flag on and is watching for it to take effect.
    fail = false;
    expect(await flag.enabled()).toBe(true);
    expect(reads).toBe(3);
  });
});
