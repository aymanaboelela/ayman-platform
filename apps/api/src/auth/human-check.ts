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
 * Fails CLOSED. A siteverify that errors or times out refuses the sign-up:
 * letting it through would make the check exactly as strong as Cloudflare's
 * uptime, and the student's cost is one retry.
 */
export function createTurnstileCheck(secret: string, fetchImpl: typeof fetch = fetch): HumanCheck {
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
        const body = (await response.json()) as { success?: unknown };
        return body.success === true;
      } catch {
        return false;
      }
    },
  };
}
