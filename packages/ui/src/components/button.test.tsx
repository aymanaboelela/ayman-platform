import { describe, expect, it } from 'vitest';
import { Button } from './button';

/**
 * A function component can be called directly like any other function: it
 * just runs the body and returns the React element description (a plain
 * object with a `.props` field, via the automatic JSX runtime) — no DOM, no
 * react-dom, no test renderer required. That's enough to assert on the
 * `type` attribute Button decides to pass through to the underlying
 * <button>, which is the one thing this suite needs to guard.
 */
describe('Button', () => {
  it('defaults to type="button" so it never accidentally submits an enclosing form', () => {
    // A bare <button> defaults to type="submit"; once quiz forms have
    // several buttons (تسليم / تخطي / السابق), any Button that isn't meant
    // to submit must not silently do so.
    const el = Button({});
    expect(el.props.type).toBe('button');
  });

  it('still lets a caller opt into type="submit"', () => {
    const el = Button({ type: 'submit' });
    expect(el.props.type).toBe('submit');
  });
});
