import { describe, expect, it } from 'vitest';
import { waMeHref } from '@ayman/contracts/whatsapp';

/**
 * Five surfaces build this link now — the footer, the links page, المساعد's
 * widget, the inbox thread and the student record — and every one of them is a
 * button somebody presses expecting a chat to open. The two ways it can fail
 * are both silent from the desk: a stray `+` lands on WhatsApp's «phone number
 * shared via url is invalid» page, and a missing number lands on its marketing
 * page. Neither throws, neither logs, and both look like a working button.
 */
describe('waMeHref', () => {
  it('drops the leading + and nothing else', () => {
    // The whole conversion. `https://wa.me/+2010…` is the failure mode this
    // function exists to make unrepeatable.
    expect(waMeHref('+201021196367')).toBe('https://wa.me/201021196367');
  });

  it('answers null rather than a numberless link', () => {
    // Absence, not a degraded link: `https://wa.me/` opens WhatsApp's own
    // marketing page, which this product shipped once from the footer. Callers
    // render nothing when this is null.
    expect(waMeHref(null)).toBeNull();
    expect(waMeHref(undefined)).toBeNull();
    expect(waMeHref('')).toBeNull();
    expect(waMeHref('   ')).toBeNull();
  });

  it('refuses anything that is not already E.164', () => {
    /*
     * This module has NO parser on purpose — it is imported by
     * `assistant-widget.tsx`, which is mounted on every route and whose header
     * is a standing argument against pulling libphonenumber onto that path.
     * Everything the product stores is normalised before it gets here, so the
     * check is a shape assertion rather than a fallback: a caller holding free
     * text (a parent's number typed at onboarding) runs
     * `normalizeEgyptianPhone` first — see `WhatsappButton`.
     */
    expect(waMeHref('01021196367')).toBeNull();
    expect(waMeHref('0102 119 6367')).toBeNull();
    expect(waMeHref('+0102119636')).toBeNull();
    expect(waMeHref('201021196367')).toBeNull();
    expect(waMeHref('not a phone')).toBeNull();
  });

  it('trims, because a stored value may carry whitespace', () => {
    expect(waMeHref('  +201021196367  ')).toBe('https://wa.me/201021196367');
  });

  it('is not Egypt-only', () => {
    // Deliberately: it formats a link, it does not validate a nationality.
    // `ContactSchema.whatsapp` is the field that decides which numbers may be
    // stored, and it is not restricted to +20 either.
    expect(waMeHref('+447700900123')).toBe('https://wa.me/447700900123');
  });
});
