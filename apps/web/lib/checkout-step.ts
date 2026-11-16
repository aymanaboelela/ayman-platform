/**
 * Which step the course checkout is on, said out loud for anything standing
 * beside it.
 *
 * `SubscribePanel` is the checkout; the first-visit guide's helper circle
 * explains each of its steps from OUTSIDE it (`components/guide`). The helper
 * must not reach into the panel's state and must not re-implement any of it,
 * so the panel announces the one fact the helper needs — the step, and
 * whether a transfer method has been picked — and knows nothing about who is
 * listening. With nobody listening this is one assignment and one event with
 * no handlers.
 *
 * A module of its own rather than an export on the panel: the panel is a
 * large client module already in open tabs, and a new export there is the
 * Turbopack trap in `docs/agents/pitfalls.md`.
 *
 * `current` is kept as well as dispatched because the listener usually mounts
 * AFTER the panel has announced — the guide's chunk is loaded lazily — and has
 * to be able to ask where things stand.
 */
export interface CheckoutStepDetail {
  /** `SubscribePanel`'s own `Step`, as a string — the panel owns the union. */
  step: string;
  /** A transfer rail is chosen and the numbered pay steps are on screen. */
  railChosen: boolean;
}

export const CHECKOUT_STEP_EVENT = 'checkout:step';

let current: CheckoutStepDetail | null = null;

/** `null` when the panel leaves the page. */
export function announceCheckoutStep(detail: CheckoutStepDetail | null): void {
  current = detail;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHECKOUT_STEP_EVENT));
}

export function currentCheckoutStep(): CheckoutStepDetail | null {
  return current;
}
