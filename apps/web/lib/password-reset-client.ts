import {
  PASSWORD_RESET_HUMAN_CHECK,
  PASSWORD_RESET_INVALID_CODE,
  PASSWORD_RESET_LIMITED,
} from '@ayman/contracts/password-reset';
import { CSRF_HEADER, readCsrfToken } from '@/lib/csrf';

/**
 * «نسيت كلمة السر» from the browser — the two POSTs, each folded into the
 * handful of outcomes the page draws.
 *
 * The folding is the point. The API already answers alike for a registered
 * number and a made-up one; this file is the second place that must not pull
 * them apart, so it never reads `message`, and every failure that is not one
 * of the named codes collapses to `failed`.
 */

export type RequestCodeResult =
  | { kind: 'accepted'; handle: string }
  | { kind: 'unavailable' }
  | { kind: 'limited'; retryAfterSeconds: number }
  | { kind: 'human_check' }
  | { kind: 'failed' };

export type ConfirmResetResult =
  | { kind: 'reset' }
  | { kind: 'google' }
  | { kind: 'invalid' }
  | { kind: 'limited' }
  | { kind: 'failed' };

interface ErrorBody {
  code?: unknown;
  details?: { retryAfterSeconds?: unknown };
}

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      // The guard asks only that the header is THERE (a cross-site form
      // cannot set one) — the same fallback the guardian form uses for a
      // visitor who has no CSRF cookie yet.
      [CSRF_HEADER]: readCsrfToken() || 'password-reset',
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  return { response, payload };
}

export async function requestResetCode(phoneNumber: string, captchaToken: string | null): Promise<RequestCodeResult> {
  try {
    const { response, payload } = await post(
      '/api/password-reset/request',
      { phoneNumber },
      captchaToken ? { 'x-captcha-response': captchaToken } : {},
    );
    if (response.ok) {
      const body = (payload ?? {}) as { status?: unknown; handle?: unknown };
      if (body.status === 'unavailable') return { kind: 'unavailable' };
      // The handle binds the code to THIS request — without it the next step
      // cannot succeed, so an `accepted` with none is treated as a failure.
      if (body.status === 'accepted' && typeof body.handle === 'string') return { kind: 'accepted', handle: body.handle };
      return { kind: 'failed' };
    }
    const error = (payload ?? {}) as ErrorBody;
    if (response.status === 429) {
      const seconds = error.details?.retryAfterSeconds;
      // A 429 from the global throttler carries no code; it is still a limit.
      return { kind: 'limited', retryAfterSeconds: typeof seconds === 'number' ? seconds : 60 };
    }
    if (error.code === PASSWORD_RESET_HUMAN_CHECK) return { kind: 'human_check' };
    if (error.code === PASSWORD_RESET_LIMITED) return { kind: 'limited', retryAfterSeconds: 60 };
    return { kind: 'failed' };
  } catch {
    return { kind: 'failed' };
  }
}

export async function confirmReset(input: {
  phoneNumber: string;
  handle: string;
  code: string;
  newPassword: string;
}): Promise<ConfirmResetResult> {
  try {
    const { response, payload } = await post('/api/password-reset/confirm', input);
    if (response.ok) {
      const status = (payload as { status?: unknown } | null)?.status;
      return status === 'reset' ? { kind: 'reset' } : status === 'google' ? { kind: 'google' } : { kind: 'failed' };
    }
    const error = (payload ?? {}) as ErrorBody;
    if (response.status === 429) return { kind: 'limited' };
    // A 400 for a malformed body is the client's own bug, not a fact about the
    // code — but to the student it is the same instruction: check the code.
    if (error.code === PASSWORD_RESET_INVALID_CODE || response.status === 400) return { kind: 'invalid' };
    return { kind: 'failed' };
  } catch {
    return { kind: 'failed' };
  }
}
