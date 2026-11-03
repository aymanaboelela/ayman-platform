/**
 * «مش روبوت» — Cloudflare Turnstile, on account creation only.
 *
 * Why sign-up and nothing else: every other abuse of the auth routes is
 * bounded by something already — sign-in by the identifier/account lockout,
 * the whole of `/api/auth/*` by the per-address limits in `auth.config.ts`.
 * Creating accounts is the one thing a script can do from ten thousand
 * addresses at once, and a per-address limit says nothing about that. Each
 * fake account is real rows, an argon2 hash, and — once it finishes
 * onboarding — a phone number in the next WhatsApp campaign.
 *
 * Written here rather than through better-auth's `captcha` plugin: that plugin
 * is only exported from the `better-auth/plugins` barrel, which drags every
 * other plugin into the API at boot, and a barrel import has already broken
 * this server at runtime once while every test passed.
 */

/** The header the register form sends the widget's token in. */
export const HUMAN_CHECK_HEADER = 'x-captcha-response';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface HumanCheck {
  /** True only when Cloudflare says the token is fresh, valid and unspent. */
  verify(token: string | null | undefined, remoteIp: string | null): Promise<boolean>;
}

/**
 * What a token must have been minted FOR, beyond being valid.
 *
 * Siteverify answers `success: true` for any unspent token from this site
 * key — including one solved on a different form, or on a page served from
 * some other host that embeds the same key. `action` is the label the widget
 * was rendered with (`render({ action })`), and `hostname` is where it was
 * solved. Pinning both means a token farmed on one form cannot be spent on
 * another. Absent fields are not checked, which is the sign-up form's
 * behaviour, unchanged.
 */
export interface HumanCheckExpectations {
  action?: string;
  hostname?: string;
}

/**
 * Fails CLOSED. A siteverify that errors or times out refuses the sign-up:
 * letting it through would make the check exactly as strong as Cloudflare's
 * uptime, and the student's cost is one retry.
 */
export function createTurnstileCheck(
  secret: string,
  fetchImpl: typeof fetch = fetch,
  expect: HumanCheckExpectations = {},
): HumanCheck {
  return {
    async verify(token, remoteIp) {
      if (!token || token.length > 2048) return false;
      try {
        const response = await fetchImpl(SITEVERIFY_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ secret, response: token, ...(remoteIp ? { remoteip: remoteIp } : {}) }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) return false;
        const body = (await response.json()) as { success?: unknown; action?: unknown; hostname?: unknown };
        if (body.success !== true) return false;
        if (expect.action !== undefined && body.action !== expect.action) return false;
        if (expect.hostname !== undefined && body.hostname !== expect.hostname) return false;
        return true;
      } catch {
        return false;
      }
    },
  };
}
