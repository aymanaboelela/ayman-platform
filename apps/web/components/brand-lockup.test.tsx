import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The brand on the five screens a student sees AFTER signing in — the student
 * topbar, the rail, the admin header, the admin sidebar and the auth column —
 * and the reason a second instructor's students met a `</>` monogram on all of
 * them, permanently.
 *
 * `getBrandAsset('mark')` is gated by `aymanOnly()`, so on any stack but his it
 * answers `undefined`. That was always the intent — his face must not appear on
 * somebody else's domain — but the branch it fell into had no second source, so
 * «الشكل البديل» stopped being a rare missing-file case and became the DEFAULT
 * render for every other deployment. The instructor's own uploaded logo now
 * fills it.
 *
 * ## The test environment IS Ayman's stack
 *
 * `TENANT_KEY` is unset here, and `lib/tenant.ts` treats "no key at all" as his
 * — fail-closed, deliberately. That is what makes the second test below worth
 * writing: it asserts the registered photograph still wins on his stack, byte
 * for byte, which is the promise the whole change is made under.
 */

/* `next/image` wants a loader and a config this harness has no reason to
   carry; only WHICH src was chosen is under test. */
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const { BrandLockup } = await import('./brand-lockup');
const { BrandMarkProvider } = await import('./brand-mark-provider');

afterEach(cleanup);

describe('BrandLockup — the instructor’s own mark', () => {
  it('draws the uploaded mark handed to it', () => {
    const { container } = render(<BrandLockup markKey="aa/logo.webp" />);
    const img = container.querySelector('img');

    expect(img, 'an uploaded logo must reach the signed-in surfaces').toBeTruthy();
    expect(img?.getAttribute('src')).toContain('aa/logo.webp');
  });

  /**
   * The key arrives ambiently rather than as a prop at six call sites — four
   * of which are `'use client'` under a layout that must not become `async`.
   * See `brand-mark-provider.tsx`.
   */
  it('reads the mark from the provider when no prop is given', () => {
    const { container } = render(
      <BrandMarkProvider markKey="bb/mark.webp">
        <BrandLockup />
      </BrandMarkProvider>,
    );

    expect(container.querySelector('img')?.getAttribute('src')).toContain('bb/mark.webp');
  });

  /**
   * ⚠️ ZERO PIXELS ON HIS STACK. `TENANT_KEY` is unset in this harness, so
   * `getBrandAsset('mark')` resolves his registered photograph exactly as it
   * did before — and his `logoDarkAssetId`/`logoLightAssetId` are both `null`
   * in production (read off `app.site_settings`), so the provider hands this
   * component `null` there and nothing changes.
   */
  it('leaves the registered photograph alone when nothing is uploaded', () => {
    const { container } = render(<BrandLockup />);
    const img = container.querySelector('img');

    expect(img?.getAttribute('src')).toBe('/brand/ayman-mark-2.webp');
    expect(container.querySelector('.brand__mark--photo')).toBeTruthy();
  });

  /** The upload is an explicit act and wins over the file written into the
   *  code — same order `<MediaSlot>` resolves in. */
  it('prefers the upload over the registry', () => {
    const { container } = render(<BrandLockup markKey="cc/new.webp" />);

    expect(container.querySelector('img')?.getAttribute('src')).toContain('cc/new.webp');
  });

  /**
   * An explicit `null` means "no upload", not "ask the provider".
   *
   * ⚠️ The distinction is one character wide — `markKey ?? ambientMark` reads
   * identically and is wrong: the day a tenant CLEARS their logo, the cleared
   * value would fall through to the ambient one and the old mark would go on
   * rendering. `undefined` is the only value that means "nobody said".
   */
  it('treats an explicit null as an answer, not as a question', () => {
    const { container } = render(
      <BrandMarkProvider markKey="bb/mark.webp">
        <BrandLockup markKey={null} />
      </BrandMarkProvider>,
    );

    /* Named, not negated. `?.` on a missing element makes `not.toContain` pass
       for a lockup that drew NOTHING — the one outcome this assertion must not
       accept — so it states what a cleared slot is supposed to fall through to
       instead. On this harness that is the registry, because `TENANT_KEY` is
       unset here and `lib/tenant.ts` reads "no key at all" as his stack. */
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/brand/ayman-mark-2.webp');
  });
});
