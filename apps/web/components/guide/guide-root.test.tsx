import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { guideCopy } from '@ayman/contracts/copy/guide';
import { formatCopy } from '@ayman/contracts/format';
import { announceCheckoutStep } from '@/lib/checkout-step';
import { GUIDE_STATE_KEY } from './guide-gate';
import { course, detail } from './guide-fixtures';
import { lineText, TEACHER_NAME } from './guide-parts';
import { initialGuideState, readGuideState, writeGuideState, type GuideState } from './guide-state';

const c = guideCopy;

let pathname = '/';
const router = { push: vi.fn(), replace: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => pathname }));
vi.mock('next/image', () => ({
  default: ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
    <img src={src} alt={alt} className={className} />
  ),
}));

const ONLY = course({ slug: 'python-y2', forLanguages: false });
vi.mock('./guide-data', () => ({
  loadViewer: () => Promise.resolve({ signedIn: false, saved: { year: null, systemId: null, stream: null } }),
  loadCatalog: () => Promise.resolve([ONLY]),
  loadTaxonomy: () => Promise.resolve(null),
  loadCourse: () => Promise.resolve(detail(ONLY, { terms: [] })),
  loadRails: () => Promise.resolve({ instapay: true, vodafoneCash: false }),
  saveYear: () => Promise.resolve(false),
  wizardHoldsYear: () => true,
}));

const { GuideRoot } = await import('./guide-root');

const onEnd = vi.fn();
const pillName = formatCopy(c.pill, { name: TEACHER_NAME });

function mount(surface: 'site' | 'app' | 'auth' = 'site') {
  return render(<GuideRoot surface={surface} face={null} onEnd={onEnd} />);
}

function seed(overrides: Partial<GuideState> = {}) {
  writeGuideState({ ...initialGuideState(), ...overrides });
}

beforeEach(() => {
  pathname = '/';
  onEnd.mockReset();
  router.push.mockReset();
  window.sessionStorage.clear();
  window.localStorage.clear();
  announceCheckoutStep(null);
});

afterEach(cleanup);

describe('the guide, once loaded', () => {
  it('draws the dialog for a guide that is open', async () => {
    seed();
    mount();
    expect(await screen.findByRole('dialog')).toHaveAccessibleName(c.welcome.title);
  });

  it('minimise leaves the pill, and the pill brings the dialog back where it was', async () => {
    seed({ step: 'course' });
    mount();
    await screen.findByRole('heading', { name: c.course.title });

    fireEvent.click(screen.getAllByRole('button', { name: c.minimise })[0]!);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const pill = screen.getByRole('button', { name: pillName });
    // Remembered for the session: a navigation or a reload keeps the pill.
    expect(readGuideState()).toMatchObject({ open: false, step: 'course' });
    expect(onEnd).not.toHaveBeenCalled();

    fireEvent.click(pill);
    await screen.findByRole('heading', { name: c.course.title });
    expect(readGuideState()).toMatchObject({ open: true, step: 'course' });
  });

  it('«بعدين» is minimise too — the pill stays for the session', async () => {
    seed();
    mount();
    fireEvent.click(await screen.findByRole('button', { name: c.later }));
    expect(await screen.findByRole('button', { name: pillName })).toBeTruthy();
    expect(readGuideState()).toMatchObject({ open: false });
  });

  it('close ends it: nothing stored, no pill, and the slot is handed back', async () => {
    seed({ step: 'course' });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: c.close }));

    await waitFor(() => expect(onEnd).toHaveBeenCalledTimes(1));
    expect(window.sessionStorage.getItem(GUIDE_STATE_KEY)).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: pillName })).toBeNull();
  });

  it('hands the slot back at once when there is no guide in progress', async () => {
    mount();
    await waitFor(() => expect(onEnd).toHaveBeenCalledTimes(1));
    expect(document.body.querySelector('.guide-scope')).toBeNull();
  });

  it('keeps the answers across a remount — a navigation to another route group', async () => {
    seed({ step: 'welcome' });
    const first = mount();
    fireEvent.click(await screen.findByRole('button', { name: c.welcome.start }));
    await screen.findByRole('heading', { name: c.course.title });
    first.unmount();

    mount();
    await screen.findByRole('heading', { name: c.course.title });
  });

  it.each([
    ['a lesson', 'app', '/courses/python-y2/lessons/l1'],
    ['a quiz attempt', 'app', '/quizzes/l1/attempt/a1'],
    ['another page of the shell', 'app', '/wallet'],
    ['the book shop', 'site', '/books'],
    ['a legal page', 'site', '/privacy'],
    ['the welcome scene', 'app', '/welcome'],
  ] as const)('draws nothing on %s, open or minimised', (_label, surface, path) => {
    pathname = path;
    for (const open of [true, false]) {
      seed({ open });
      const view = mount(surface);
      expect(document.body.querySelector('.guide-scope')).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
      // Still in progress: it comes back on a page where it may show.
      expect(readGuideState()).not.toBeNull();
      view.unmount();
    }
  });
});

describe('the helper circle', () => {
  it('stands beside the register form, never as a dialog', async () => {
    pathname = '/register';
    seed({ open: false, step: 'account' });
    mount('auth');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('complementary', { name: c.label })).toBeTruthy();
    expect(screen.getByText(lineText('register-intro'))).toBeTruthy();
  });

  it('even when the dialog was left OPEN — an auth page never gets the dialog', () => {
    pathname = '/register';
    seed({ open: true });
    mount('auth');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(lineText('register-intro'))).toBeTruthy();
  });

  it('says one line per field as it takes focus', () => {
    pathname = '/register';
    seed({ open: false });
    const form = document.createElement('form');
    form.innerHTML =
      '<input name="name" /><input name="phone" /><input name="email" /><input name="password" /><input name="confirmPassword" /><input name="captcha" />';
    document.body.append(form);
    mount('auth');

    const focus = (name: string) => act(() => form.querySelector<HTMLInputElement>(`[name="${name}"]`)!.focus());
    focus('name');
    expect(screen.getByText(lineText('register-name'))).toBeTruthy();
    focus('phone');
    expect(screen.getByText(lineText('register-phone'))).toBeTruthy();
    focus('email');
    expect(screen.getByText(lineText('register-email'))).toBeTruthy();
    focus('password');
    expect(screen.getByText(lineText('register-password'))).toBeTruthy();
    focus('confirmPassword');
    expect(screen.getByText(lineText('register-confirm'))).toBeTruthy();
    // A field it has no line for leaves the last line up.
    focus('captcha');
    expect(screen.getByText(lineText('register-confirm'))).toBeTruthy();
    form.remove();
  });

  it('has a line for the sign-in page and for the first screen after sign-up', () => {
    pathname = '/login';
    seed({ open: false });
    const login = mount('auth');
    expect(screen.getByText(lineText('login'))).toBeTruthy();
    login.unmount();

    pathname = '/onboarding';
    mount('app');
    expect(screen.getByText(lineText('after-signup'))).toBeTruthy();
  });

  it('stays beside the onboarding wizard — it is in the corner, not on the form', () => {
    pathname = '/onboarding';
    seed({ open: false });
    const form = document.createElement('form');
    form.innerHTML = '<input name="schoolName" />';
    document.body.append(form);
    mount('app');
    act(() => form.querySelector('input')!.focus());
    expect(screen.getByText(lineText('after-signup'))).toBeTruthy();
    expect(document.body.querySelector('.guide-dock--helper')!.getAttribute('data-surface')).toBe('app');
    form.remove();
  });

  it('× folds the caption, the circle stays, and the guide goes on', () => {
    pathname = '/register';
    seed({ open: false });
    mount('auth');
    const fold = document.body.querySelector<HTMLButtonElement>('.guide-bubble__tools button:last-child')!;
    fireEvent.click(fold);
    expect(screen.queryByText(lineText('register-intro'))).toBeNull();
    expect(document.body.querySelector('.guide-circle')).not.toBeNull();
    // Folded is not ended: still in progress, nothing handed back.
    expect(readGuideState()).not.toBeNull();
    expect(onEnd).not.toHaveBeenCalled();

    fireEvent.click(document.body.querySelector<HTMLButtonElement>('.guide-circle')!);
    expect(screen.getByText(lineText('register-intro'))).toBeTruthy();
  });

  const picked = { year: 'bacalorya:2', stream: 'general' as const, course: 'python-y2', plan: 'monthly', months: [] };

  it('follows the REAL checkout step by step, from outside it', () => {
    pathname = '/courses/python-y2/subscribe';
    seed({ open: false, step: 'pay', selection: picked });
    // The panel announced before the guide's chunk had loaded.
    announceCheckoutStep({ step: 'form', railChosen: false });
    const sender = document.createElement('input');
    sender.id = 'subscribe-sender-phone';
    const receipt = document.createElement('button');
    receipt.id = 'subscribe-screenshot-button';
    document.body.append(sender, receipt);
    mount();

    expect(screen.getByText(lineText('checkout-method'))).toBeTruthy();

    act(() => announceCheckoutStep({ step: 'form', railChosen: true }));
    expect(screen.getByText(lineText('checkout-transfer'))).toBeTruthy();

    act(() => sender.focus());
    expect(screen.getByText(lineText('checkout-sender'))).toBeTruthy();

    act(() => receipt.focus());
    expect(screen.getByText(lineText('checkout-receipt'))).toBeTruthy();

    // «تغيير طريقة التحويل» — back to the question.
    act(() => announceCheckoutStep({ step: 'form', railChosen: false }));
    expect(screen.getByText(lineText('checkout-method'))).toBeTruthy();

    sender.remove();
    receipt.remove();
  });

  it('is only beside the checkout of the course the guide chose', () => {
    pathname = '/courses/another-course/subscribe';
    seed({ open: false, step: 'pay', selection: picked });
    mount();
    expect(document.body.querySelector('.guide-scope')).toBeNull();
  });

  it('says the closing line when the claim is sent, and ends when the page is left', async () => {
    pathname = '/courses/python-y2/subscribe';
    seed({ open: false, step: 'pay', selection: picked });
    const view = mount();

    act(() => announceCheckoutStep({ step: 'success', railChosen: true }));
    expect(await screen.findByText(lineText('done'))).toBeTruthy();
    // Still on screen beside the confirmation…
    expect(readGuideState()).toMatchObject({ done: true });
    expect(onEnd).not.toHaveBeenCalled();

    // …and over once the student moves on.
    pathname = '/dashboard';
    view.rerender(<GuideRoot surface="site" face={null} onEnd={onEnd} />);
    await waitFor(() => expect(onEnd).toHaveBeenCalledTimes(1));
    expect(readGuideState()).toBeNull();
    expect(document.body.querySelector('.guide-scope')).toBeNull();
  });

  it('treats a claim already in review, and a wallet purchase, as finished too', async () => {
    pathname = '/courses/python-y2/subscribe';
    seed({ open: false, step: 'pay', selection: picked });
    mount();
    act(() => announceCheckoutStep({ step: 'pending', railChosen: false }));
    expect(await screen.findByText(lineText('checkout-pending'))).toBeTruthy();
    expect(readGuideState()).toMatchObject({ done: true });

    act(() => announceCheckoutStep({ step: 'walletSuccess', railChosen: false }));
    expect(await screen.findByText(lineText('done-open'))).toBeTruthy();
  });
});
