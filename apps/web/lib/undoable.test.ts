import { beforeEach, describe, expect, it, vi } from 'vitest';

const toastFn = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('sonner', () => ({
  toast: Object.assign(
    (...args: unknown[]) => toastFn(...args),
    { success: (...args: unknown[]) => toastSuccess(...args), error: (...args: unknown[]) => toastError(...args) },
  ),
}));

const { toastUndoable } = await import('./undoable');

describe('toastUndoable', () => {
  beforeEach(() => {
    toastFn.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it('runs perform before the toast appears', async () => {
    const order: string[] = [];
    await toastUndoable({
      messageAr: 'اتأرشف',
      perform: async () => {
        order.push('perform');
      },
      undo: async () => {
        order.push('undo');
      },
    });
    order.push('toast-shown-check');
    expect(order).toEqual(['perform', 'toast-shown-check']);
    expect(toastFn).toHaveBeenCalledTimes(1);
  });

  it('shows the toast with the Arabic undo action label', async () => {
    await toastUndoable({
      messageAr: 'اتأرشف',
      perform: async () => {},
      undo: async () => {},
    });

    const [message, options] = toastFn.mock.calls[0] as [string, { action: { label: string; onClick: () => void } }];
    expect(message).toBe('اتأرشف');
    expect(options.action.label.length).toBeGreaterThan(0);
  });

  it('clicking the action calls undo and shows a success toast', async () => {
    const undo = vi.fn(async () => {});
    await toastUndoable({ messageAr: 'اتأرشف', perform: async () => {}, undo });

    const [, options] = toastFn.mock.calls[0] as [string, { action: { onClick: () => void } }];
    options.action.onClick();
    await Promise.resolve();
    await Promise.resolve();

    expect(undo).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledTimes(1);
  });

  it('a rejecting undo shows the error toast and does not throw', async () => {
    const undo = vi.fn(async () => {
      throw new Error('boom');
    });
    await toastUndoable({ messageAr: 'اتأرشف', perform: async () => {}, undo });

    const [, options] = toastFn.mock.calls[0] as [string, { action: { onClick: () => void } }];
    expect(() => options.action.onClick()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(toastError).toHaveBeenCalledTimes(1);
  });
});
