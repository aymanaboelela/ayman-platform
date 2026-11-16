import { useSyncExternalStore } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { guideCopy, type GuideVoiceKey } from '@ayman/contracts/copy/guide';
import { createVoicePlayer, type VoiceAudio, type VoicePlayer } from './guide-voice';
import type { HelperPlace } from './guide-gate';

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const { GuideHelper, checkoutLine, coveredBy, registerLine, statusKindOf } = await import('./guide-helper');

const c = guideCopy;
const flush = () => act(() => new Promise<void>((done) => setTimeout(done, 0)));

describe('the line for each real checkout step', () => {
  it.each([
    [null, null, 'checkout-start'],
    [{ step: 'checking', railChosen: false }, null, 'checkout-start'],
    [{ step: 'choose', railChosen: false }, null, 'checkout-start'],
    [{ step: 'chooseMonths', railChosen: false }, null, 'checkout-start'],
    [{ step: 'chooseTerm', railChosen: false }, null, 'checkout-start'],
    [{ step: 'form', railChosen: false }, null, 'checkout-method'],
    // A focus remembered from before the method was changed does not count.
    [{ step: 'form', railChosen: false }, 'receipt', 'checkout-method'],
    [{ step: 'form', railChosen: true }, null, 'checkout-transfer'],
    [{ step: 'form', railChosen: true }, 'sender', 'checkout-sender'],
    [{ step: 'form', railChosen: true }, 'receipt', 'checkout-receipt'],
    [{ step: 'submitting', railChosen: true }, 'receipt', 'checkout-receipt'],
    [{ step: 'pending', railChosen: false }, null, 'checkout-pending'],
    [{ step: 'success', railChosen: true }, 'receipt', 'done'],
    [{ step: 'walletSuccess', railChosen: false }, null, 'done-open'],
    // A step the panel grows later is explained as «still choosing», not wrongly.
    [{ step: 'somethingNew', railChosen: false }, null, 'checkout-start'],
  ] as const)('%o + %s → %s', (detail, focus, expected) => {
    expect(checkoutLine(detail, focus)).toBe(expected);
  });
});

describe('the line for each register field', () => {
  it('is keyed by the field’s name, and silent for anything else', () => {
    const named = (name: string) => Object.assign(document.createElement('input'), { name });
    expect(registerLine(named('name'))).toBe('register-name');
    expect(registerLine(named('phone'))).toBe('register-phone');
    expect(registerLine(named('email'))).toBe('register-email');
    expect(registerLine(named('password'))).toBe('register-password');
    expect(registerLine(named('confirmPassword'))).toBe('register-confirm');
    expect(registerLine(named('cf-turnstile-response'))).toBeNull();
    expect(registerLine(document.createElement('div'))).toBeNull();
    expect(registerLine(null)).toBeNull();
  });
});

describe('which fields have a live line', () => {
  const named = (name: string) => Object.assign(document.createElement('input'), { name });
  const withId = (id: string) => Object.assign(document.createElement('input'), { id });

  it('the register form’s name, phone, password and confirmation — not the optional email', () => {
    expect(statusKindOf('register', named('name'))).toBe('name');
    expect(statusKindOf('register', named('phone'))).toBe('phone');
    expect(statusKindOf('register', named('password'))).toBe('password');
    expect(statusKindOf('register', named('confirmPassword'))).toBe('confirm');
    expect(statusKindOf('register', named('email'))).toBeNull();
  });

  it('the checkout’s sender number, which the same validator checks', () => {
    expect(statusKindOf('checkout', withId('subscribe-sender-phone'))).toBe('phone');
    expect(statusKindOf('checkout', withId('subscribe-coupon'))).toBeNull();
  });

  it('nothing on the sign-in or onboarding pages', () => {
    expect(statusKindOf('login', named('password'))).toBeNull();
    expect(statusKindOf('onboarding', named('phone'))).toBeNull();
  });
});

describe('whether the helper is covering a field', () => {
  const helper = { top: 8, bottom: 72, left: 8, right: 352 };

  it('measures how far the page must move for the field to clear it', () => {
    expect(coveredBy({ top: 40, bottom: 84, left: 16, right: 344 }, helper)).toBe(32);
    expect(coveredBy({ top: 10, bottom: 54, left: 16, right: 344 }, helper)).toBe(62);
  });

  it('is zero for a field below it, above it, or beside it', () => {
    expect(coveredBy({ top: 72, bottom: 116, left: 16, right: 344 }, helper)).toBe(0);
    expect(coveredBy({ top: 200, bottom: 244, left: 16, right: 344 }, helper)).toBe(0);
    // The card in the left gutter and a field in the right-hand column.
    expect(coveredBy({ top: 20, bottom: 64, left: 700, right: 1100 }, { ...helper, right: 340 })).toBe(0);
  });
});

/** An audio element that records what was asked of it. */
function fakeAudio() {
  return {
    preload: 'auto',
    src: '',
    currentTime: 0,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    removeAttribute: vi.fn(),
  };
}

function Helper({ player, place }: { player: VoicePlayer; place: HelperPlace }) {
  const snapshot = useSyncExternalStore(player.subscribe, player.snapshot, player.snapshot);
  return (
    <GuideHelper
      place={place}
      surface={place === 'checkout' ? 'site' : place === 'onboarding' ? 'app' : 'auth'}
      face={null}
      voice={{ ...snapshot, player }}
      done={false}
      onDone={() => {}}
    />
  );
}

function setup(place: HelperPlace) {
  const audio = fakeAudio();
  const player = createVoicePlayer({
    createAudio: () => audio as unknown as VoiceAudio,
    storage: window.localStorage,
    keys: new Set(Object.keys(c.voice) as GuideVoiceKey[]),
  });
  render(<Helper player={player} place={place} />);
  return { audio, player };
}

/** A register form the way react-hook-form names its fields. */
function registerForm() {
  const form = document.createElement('form');
  form.innerHTML =
    '<input name="name" /><input name="phone" /><input name="email" /><input name="password" type="password" /><input name="confirmPassword" type="password" />';
  document.body.append(form);
  const field = (name: string) => form.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
  return { form, field };
}

/** Types into a field the way a browser reports it: the value, then `input`. */
function type(field: HTMLInputElement, value: string) {
  field.value = value;
  fireEvent.input(field);
}

const dock = () => document.body.querySelector<HTMLElement>('.guide-dock--helper')!;
const circle = () => document.body.querySelector<HTMLButtonElement>('.guide-circle')!;
const closeButton = () => document.body.querySelector<HTMLButtonElement>('.guide-bubble__tools button:last-child')!;
const statusLine = () => document.body.querySelector<HTMLElement>('.guide-status');

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('the helper’s voice', () => {
  it('is silent until the student touches the page', async () => {
    const { audio } = setup('login');
    await flush();
    expect(audio.play).not.toHaveBeenCalled();
  });

  it('speaks the waiting line on the first touch — even on a page whose line never changes', async () => {
    const { audio, player } = setup('login');
    fireEvent.pointerDown(document.body);
    await flush();
    expect(audio.src).toBe('/guide-voice/login.mp3');
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(player.snapshot().playing).toBe('login');

    // Only the first: later touches do not restart it.
    fireEvent.pointerDown(document.body);
    await flush();
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it('plays each field’s line by itself as the field takes focus, stopping the one before', async () => {
    const { field } = registerForm();
    const { audio, player } = setup('register');

    // A tap on the field: the gesture, then the focus it causes.
    fireEvent.pointerDown(field('name'));
    act(() => field('name').focus());
    // Spoken from inside the focus handler — no render, no effect in between.
    expect(player.snapshot().playing).toBe('register-name');
    await flush();
    expect(audio.src).toBe('/guide-voice/register-name.mp3');

    for (const [name, key] of [
      ['phone', 'register-phone'],
      ['email', 'register-email'],
      ['password', 'register-password'],
      ['confirmPassword', 'register-confirm'],
    ] as const) {
      const pausedBefore = audio.pause.mock.calls.length;
      act(() => field(name).focus());
      await flush();
      expect(audio.src).toBe(`/guide-voice/${key}.mp3`);
      expect(player.snapshot().playing).toBe(key);
      // The clip before it was stopped, not left playing underneath.
      expect(audio.pause.mock.calls.length).toBeGreaterThan(pausedBefore);
    }
  });

  it('does not restart a line it is already speaking', async () => {
    const { field } = registerForm();
    const { audio } = setup('register');
    fireEvent.pointerDown(field('name'));
    act(() => field('name').focus());
    await flush();
    // One `play()` for the field's line: the focus handler asked, and the
    // effect that followed the re-render asked for the same line.
    const forName = audio.play.mock.calls.length;
    act(() => field('phone').focus());
    act(() => field('name').focus());
    await flush();
    expect(audio.play.mock.calls.length).toBe(forName + 2);
  });

  it('plays nothing at all while muted — and stays muted on the next visit', async () => {
    const { field } = registerForm();
    const first = setup('register');
    fireEvent.pointerDown(field('name'));
    act(() => field('name').focus());
    await flush();
    expect(first.player.snapshot().playing).toBe('register-name');

    fireEvent.click(screen.getByRole('button', { name: c.mute }));
    expect(first.player.snapshot()).toEqual({ playing: null, muted: true });
    const played = first.audio.play.mock.calls.length;
    for (const name of ['phone', 'email', 'password', 'confirmPassword', 'name']) {
      act(() => field(name).focus());
    }
    await flush();
    expect(first.audio.play.mock.calls.length).toBe(played);
    // The text still follows the field.
    expect(screen.getByText(c.voice['register-name'])).toBeTruthy();

    cleanup();
    const next = setup('register');
    expect(next.player.snapshot().muted).toBe(true);
    fireEvent.pointerDown(field('phone'));
    act(() => field('phone').focus());
    await flush();
    expect(next.audio.play).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: c.unmute })).toHaveAttribute('aria-pressed', 'true');
  });

  it('lets its own play button start the clip — the first press must not start and stop it', async () => {
    const { audio, player } = setup('login');
    const play = screen.getByRole('button', { name: c.listen });
    fireEvent.pointerDown(play);
    fireEvent.click(play);
    await flush();
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(player.snapshot().playing).toBe('login');
  });

  it('follows the checkout’s steps by itself too', async () => {
    const { announceCheckoutStep } = await import('@/lib/checkout-step');
    announceCheckoutStep({ step: 'form', railChosen: false });
    const { audio } = setup('checkout');
    fireEvent.pointerDown(document.body);
    await flush();
    expect(audio.src).toBe('/guide-voice/checkout-method.mp3');
    act(() => announceCheckoutStep({ step: 'form', railChosen: true }));
    await flush();
    expect(audio.src).toBe('/guide-voice/checkout-transfer.mp3');
    announceCheckoutStep(null);
  });
});

describe('the × and the circle', () => {
  it('× folds the caption away and leaves the circle', () => {
    setup('register');
    expect(dock().dataset.open).toBe('');
    fireEvent.click(closeButton());

    expect(document.body.querySelector('.guide-bubble')).toBeNull();
    expect(circle()).toBeTruthy();
    expect(circle()).toHaveAttribute('aria-expanded', 'false');
    expect(dock().dataset.open).toBeUndefined();
  });

  it('has no control that removes the circle', () => {
    setup('register');
    const labels = [...dock().querySelectorAll('button')].map((button) => button.getAttribute('aria-label'));
    // Play, mute, fold — and the circle. Nothing that ends the guide.
    expect(labels.sort()).toEqual([c.helper.hide, c.helper.hide, c.listen, c.mute].sort());
    fireEvent.click(closeButton());
    fireEvent.click(circle());
    fireEvent.click(circle());
    expect(circle()).toBeTruthy();
  });

  it('stays folded when the field changes — a dot on the circle, not a pop-up', () => {
    const { field } = registerForm();
    setup('register');
    act(() => field('name').focus());
    fireEvent.click(closeButton());
    expect(document.body.querySelector('.guide-circle__dot')).toBeNull();

    act(() => field('phone').focus());
    expect(document.body.querySelector('.guide-bubble')).toBeNull();
    expect(document.body.querySelector('.guide-circle__dot')).not.toBeNull();
    expect(circle().getAttribute('aria-label')).toContain(c.helper.unread);
  });

  it('opens again from the circle, on the line for the field the student is on NOW', () => {
    const { field } = registerForm();
    setup('register');
    act(() => field('name').focus());
    fireEvent.click(closeButton());
    act(() => field('password').focus());

    fireEvent.click(circle());
    expect(screen.getByText(c.voice['register-password'])).toBeTruthy();
    expect(document.body.querySelector('.guide-circle__dot')).toBeNull();
    expect(circle()).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows the rest of a long line on a tap', () => {
    setup('login');
    const bubble = document.body.querySelector<HTMLElement>('.guide-bubble')!;
    expect(bubble.dataset.full).toBeUndefined();
    fireEvent.click(bubble.querySelector('.guide-bubble__lines')!);
    expect(bubble.dataset.full).toBe('');
  });
});

describe('the live line under the spoken one', () => {
  it('is a polite live region that exists before it has anything to say', () => {
    setup('register');
    expect(statusLine()).toHaveAttribute('aria-live', 'polite');
    expect(statusLine()!.textContent).toBe('');
  });

  it('follows what is typed, by the form’s real rules', () => {
    vi.useFakeTimers();
    const { field } = registerForm();
    setup('register');

    act(() => field('name').focus());
    type(field('name'), 'مريم');
    act(() => vi.advanceTimersByTime(300));
    expect(statusLine()!.textContent).toBe(c.status.nameLeft.two);
    type(field('name'), 'مريم أحمد علي');
    act(() => vi.advanceTimersByTime(300));
    expect(statusLine()!.textContent).toBe(c.status.nameOk);
    expect(statusLine()).toHaveAttribute('data-tone', 'ok');

    act(() => field('phone').focus());
    // A new field starts from what IT holds, not from the last field's line.
    expect(statusLine()!.textContent).toBe('');
    type(field('phone'), '0101234');
    act(() => vi.advanceTimersByTime(300));
    expect(statusLine()!.textContent).toBe(c.status.phoneLeft.few.replace('{count}', '4'));

    act(() => field('password').focus());
    type(field('password'), 'abc');
    act(() => vi.advanceTimersByTime(300));
    expect(statusLine()!.textContent).toBe(c.status.passwordLeft.few.replace('{count}', '5'));
    type(field('password'), 'correct-horse');
    act(() => vi.advanceTimersByTime(300));
    expect(statusLine()!.textContent).toBe(c.status.passwordOk);

    act(() => field('confirmPassword').focus());
    type(field('confirmPassword'), 'correct-hors');
    act(() => vi.advanceTimersByTime(300));
    expect(statusLine()!.textContent).toBe(c.status.confirmBad);
    type(field('confirmPassword'), 'correct-horse');
    act(() => vi.advanceTimersByTime(300));
    expect(statusLine()!.textContent).toBe(c.status.confirmOk);
  });

  it('waits for a pause in the typing instead of changing on every key', () => {
    vi.useFakeTimers();
    const { field } = registerForm();
    setup('register');
    act(() => field('phone').focus());

    for (const value of ['0', '01', '010', '0101']) {
      type(field('phone'), value);
      act(() => vi.advanceTimersByTime(100));
      expect(statusLine()!.textContent).toBe('');
    }
    act(() => vi.advanceTimersByTime(250));
    expect(statusLine()!.textContent).toBe(c.status.phoneLeft.few.replace('{count}', '7'));
  });

  it('says where a field stands the moment it is focused, if it was already filled', () => {
    const { field } = registerForm();
    field('name').value = 'مريم أحمد علي';
    setup('register');
    act(() => field('name').focus());
    expect(statusLine()!.textContent).toBe(c.status.nameOk);
  });

  it('has no line for the optional email', () => {
    vi.useFakeTimers();
    const { field } = registerForm();
    setup('register');
    act(() => field('email').focus());
    type(field('email'), 'someone@example.com');
    act(() => vi.advanceTimersByTime(300));
    expect(statusLine()!.textContent).toBe('');
  });

  it('never puts what was typed anywhere but the field', () => {
    vi.useFakeTimers();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { field } = registerForm();
    setup('register');

    const secret = 'Tr0ub4dor&3-secret';
    act(() => field('password').focus());
    type(field('password'), secret);
    act(() => vi.advanceTimersByTime(300));
    act(() => field('confirmPassword').focus());
    type(field('confirmPassword'), secret);
    act(() => vi.advanceTimersByTime(300));
    expect(statusLine()!.textContent).toBe(c.status.confirmOk);

    // Not in the helper's markup, not in storage, not on the network.
    expect(dock().outerHTML).not.toContain(secret);
    expect(dock().outerHTML).not.toContain('Tr0ub4dor');
    expect(JSON.stringify(setItem.mock.calls)).not.toContain('Tr0ub4dor');
    expect(fetchSpy).not.toHaveBeenCalled();
    setItem.mockRestore();
    vi.unstubAllGlobals();
  });

  it('follows the checkout’s sender number with the same rule', () => {
    vi.useFakeTimers();
    const sender = Object.assign(document.createElement('input'), { id: 'subscribe-sender-phone' });
    document.body.append(sender);
    setup('checkout');
    act(() => sender.focus());
    type(sender, '01012345678');
    act(() => vi.advanceTimersByTime(300));
    expect(statusLine()!.textContent).toBe(c.status.phoneOk);
  });
});

describe('the helper on the page', () => {
  it('says which page chrome it sits under, and what it stands beside', () => {
    setup('checkout');
    expect(dock().dataset.surface).toBe('site');
    expect(dock().dataset.place).toBe('checkout');
  });

  it('exposes the line as text in a polite live region, voice or no voice', () => {
    setup('login');
    expect(screen.getByText(c.voice.login)).toHaveAttribute('aria-live', 'polite');
  });

  it('removes every listener it added when it leaves', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    setup('register');
    const added = add.mock.calls.map(([type]) => type).sort();
    cleanup();
    expect(remove.mock.calls.map(([type]) => type).sort()).toEqual(added);
    // Two `focusin`: the line/status follower, and the keep-clear measure.
    expect(added).toEqual(['focusin', 'focusin', 'input', 'keydown', 'pointerdown']);
    add.mockRestore();
    remove.mockRestore();
  });
});
