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
