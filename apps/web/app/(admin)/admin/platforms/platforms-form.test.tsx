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
});
