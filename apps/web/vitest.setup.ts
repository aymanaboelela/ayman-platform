import '@testing-library/jest-dom/vitest';

// jsdom has no ResizeObserver. Radix's `useSize` (Checkbox/RadioGroup
// indicators) calls it unconditionally on mount, so any component test that
// renders one crashes without this — a no-op stub is enough since no test
// here asserts on measured size.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

// jsdom reports the HOST's core count as `navigator.hardwareConcurrency`, and
// `lib/weak-device.ts` treats 4 cores or fewer as a weak machine — which
// switches every effect, count-up and GSAP entrance to its still version. So
// the same test would animate on a 10-core Mac and go still on a 4-vCPU CI
// runner. Pin the hints to an ordinary laptop; a test about weak machines
// stubs `navigator` itself (see `lib/weak-device.test.ts`).
// Guarded: suites marked `@vitest-environment node` have no `window`.
if (typeof window !== 'undefined') {
  Object.defineProperty(window.navigator, 'hardwareConcurrency', { value: 8, configurable: true, enumerable: true });
  Object.defineProperty(window.navigator, 'deviceMemory', { value: 8, configurable: true, enumerable: true });
}
