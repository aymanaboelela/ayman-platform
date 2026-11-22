import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FEATURE_DECLARATIONS } from '@ayman/contracts/admin/entitlements';
import { copy } from '@ayman/contracts/copy/admin';
import { PlatformsForm } from './platforms-form';

const signEntitlementsAction = vi.fn();
vi.mock('./actions', () => ({ signEntitlementsAction: (...args: unknown[]) => signEntitlementsAction(...args) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  cleanup();
  signEntitlementsAction.mockReset();
});

/**
 * Two feature keys carry a dot, and a dot in a react-hook-form path is
 * nesting. Ticking «رفع الفيديو» used to write `{ video: { upload: true } }`,
 * fail validation with no field to show it on, and never call the action —
 * so neither of those two could ever be switched on for an instructor.
 */
describe('PlatformsForm', () => {
  it('signs with a dotted feature ticked, sent under its own flat key', async () => {
    signEntitlementsAction.mockResolvedValue({ ok: true, token: 'a.b.c', expiresAt: 1_900_000_000 });
    render(<PlatformsForm tenants={[{ key: 'sabry', name: 'م. محمد صبري' }]} features={FEATURE_DECLARATIONS} />);

    for (const key of ['video.upload', 'marketing.whatsapp', 'broadcast'] as const) {
      const declaration = FEATURE_DECLARATIONS.find((entry) => entry.key === key)!;
      fireEvent.click(screen.getByRole('checkbox', { name: declaration.nameAr }));
    }
    fireEvent.click(screen.getByRole('button', { name: copy.admin.platforms.sign }));

    await waitFor(() => expect(signEntitlementsAction).toHaveBeenCalledTimes(1));
    const sent = signEntitlementsAction.mock.calls[0]![0] as { features: Record<string, boolean> };
    expect(sent.features['video.upload']).toBe(true);
    expect(sent.features['marketing.whatsapp']).toBe(true);
    expect(sent.features.broadcast).toBe(true);
    expect(sent.features).not.toHaveProperty('video');
  });

  /**
   * The document states EVERY key, so the boxes have to start at what the
   * instructor's stack runs now. Starting at the declared defaults meant that
   * opening one feature re-closed whatever had been opened for them before:
   * on 2026-11-21 both live instructors had `video.upload` open, and a signing
   * that only ticked the new feature would have taken their uploads away.
   */
  describe('where the boxes start', () => {
    const box = (key: string) =>
      screen.getByRole('checkbox', { name: FEATURE_DECLARATIONS.find((entry) => entry.key === key)!.nameAr });
    const sabry = { key: 'sabry', name: 'م. محمد صبري', features: { 'video.upload': true, books: false } };
    const adel = { key: 'adel', name: 'م. محمد عادل', features: null };

    it("starts at the instructor's live document, and falls back to the default per missing key", () => {
      render(<PlatformsForm tenants={[sabry]} features={FEATURE_DECLARATIONS} />);

      // Open in the document, off by default.
      expect(box('video.upload')).toBeChecked();
      // Closed in the document, on by default.
      expect(box('books')).not.toBeChecked();
      // Not in the document at all: the declared default is what runs there.
      expect(box('homework')).toBeChecked();
      expect(box('broadcast')).not.toBeChecked();
      expect(screen.getByText(copy.admin.platforms.startsFromDocument)).toBeInTheDocument();
    });

    it('signs an untouched form as exactly what the stack already runs, plus the one box ticked', async () => {
      signEntitlementsAction.mockResolvedValue({ ok: true, token: 'a.b.c', expiresAt: 1_900_000_000 });
      render(<PlatformsForm tenants={[sabry]} features={FEATURE_DECLARATIONS} />);

      fireEvent.click(box('dailyEssay'));
      fireEvent.click(screen.getByRole('button', { name: copy.admin.platforms.sign }));

      await waitFor(() => expect(signEntitlementsAction).toHaveBeenCalledTimes(1));
      const sent = signEntitlementsAction.mock.calls[0]![0] as { features: Record<string, boolean> };
      expect(sent.features.dailyEssay).toBe(true);
      // The feature opened earlier survives a signing that never touched it.
      expect(sent.features['video.upload']).toBe(true);
      expect(sent.features.books).toBe(false);
    });

    it("resets to the other instructor's own state when the picker changes", () => {
      render(<PlatformsForm tenants={[sabry, adel]} features={FEATURE_DECLARATIONS} />);
      fireEvent.click(box('broadcast'));
      expect(box('broadcast')).toBeChecked();

      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'adel' } });

      // No live document on that stack: the defaults, not Sabry's ticks.
      expect(box('video.upload')).not.toBeChecked();
      expect(box('books')).toBeChecked();
      expect(box('broadcast')).not.toBeChecked();
      expect(screen.getByText(copy.admin.platforms.startsFromDefaults)).toBeInTheDocument();
    });
  });
});
