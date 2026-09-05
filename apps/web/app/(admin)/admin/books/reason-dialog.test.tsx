import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DeleteBookOrderSchema,
  RejectBookOrderSchema,
} from '@ayman/contracts/admin/book-orders';
import { copy } from '@ayman/contracts/copy/admin';
import type { ActionResult } from './actions';
import { ReasonDialog } from './reason-dialog';

// The dialog reports success and failure through toasts; nothing here asserts
// on them, and sonner's own <Toaster/> is mounted by the admin layout.
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const c = copy.admin.books;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderReject(
  onSubmit = vi.fn(async (_reason: string): Promise<ActionResult> => ({ ok: true })),
) {
  render(
    <ReasonDialog
      triggerLabel={c.reject}
      title={c.rejectDialogTitle}
      hint={c.rejectDialogHint}
      reasonLabel={c.rejectReasonLabel}
      placeholder={c.rejectReasonPlaceholder}
      submitLabel={c.rejectSubmit}
      submittingLabel={c.rejectSubmitting}
      failedMessage={c.rejectFailed}
      schema={RejectBookOrderSchema}
      onSubmit={onSubmit}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: c.reject }));
  return onSubmit;
}

function reasonBox(): HTMLTextAreaElement {
  return screen.getByLabelText(c.rejectReasonLabel) as HTMLTextAreaElement;
}

function submitButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: c.rejectSubmit }) as HTMLButtonElement;
}

/**
 * The reason is not optional and is not truncated — the two properties the
 * whole dialog exists for. `window.confirm` cannot take text, so this is what
 * stands between «ارفض الطلب» and a student being told nothing.
 *
 * Every assertion runs against the REAL contract schema (`RejectBookOrderSchema`
 * / `DeleteBookOrderSchema`), never a stand-in: the point of passing the schema
 * in is that the message an admin reads here is the message the API would have
 * sent, and a fake schema in the test would be testing the fake.
 */
describe('ReasonDialog — the reason is mandatory', () => {
  it('opens with the submit locked and the hint visible', () => {
    renderReject();
    expect(screen.getByText(c.rejectDialogHint)).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
  });

  it('keeps the submit locked for whitespace and for a one-character reason', () => {
    renderReject();
    fireEvent.change(reasonBox(), { target: { value: '   ' } });
    expect(submitButton()).toBeDisabled();
    fireEvent.change(reasonBox(), { target: { value: 'x' } });
    expect(submitButton()).toBeDisabled();
  });

  it('unlocks at three characters and sends the TRIMMED reason', async () => {
    const onSubmit = renderReject();
    fireEvent.change(reasonBox(), { target: { value: '  التحويل ما وصلش  ' } });
    expect(submitButton()).toBeEnabled();

    fireEvent.click(submitButton());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('التحويل ما وصلش'));
  });

  it('refuses a reason past 300 characters instead of silently cutting it', () => {
    const onSubmit = renderReject();
    const long = 'ط'.repeat(301);
    fireEvent.change(reasonBox(), { target: { value: long } });

    // The box KEEPS what was typed — no `maxLength`, nothing swallowed.
    expect(reasonBox().value).toHaveLength(301);
    expect(submitButton()).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the failure message and stays open when the action fails', async () => {
    const onSubmit = vi.fn(
      async (_reason: string): Promise<ActionResult> => ({ ok: false, message: c.rejectFailed }),
    );
    renderReject(onSubmit);
    fireEvent.change(reasonBox(), { target: { value: 'العنوان مش واضح' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(c.rejectFailed));
    // Still open, still holding what the admin wrote — retyping a rejection
    // reason because the network blinked is how an empty one gets sent.
    expect(reasonBox().value).toBe('العنوان مش واضح');
  });
});

describe('ReasonDialog — one dialog, two jobs', () => {
  it('validates a deletion by the delete contract, with the delete copy', async () => {
    const onSubmit = vi.fn(async (_reason: string): Promise<ActionResult> => ({ ok: true }));
    render(
      <ReasonDialog
        triggerLabel={c.remove}
        title={c.removeDialogTitle}
        hint={c.removeDialogHint}
        reasonLabel={c.removeReasonLabel}
        placeholder={c.removeReasonPlaceholder}
        submitLabel={c.removeSubmit}
        submittingLabel={c.removeSubmitting}
        failedMessage={c.removeFailed}
        schema={DeleteBookOrderSchema}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: c.remove }));

    // The hint is the safety of this one: it says the row is hidden, not erased.
    expect(screen.getByText(c.removeDialogHint)).toBeInTheDocument();

    const box = screen.getByLabelText(c.removeReasonLabel) as HTMLTextAreaElement;
    const submit = screen.getByRole('button', { name: c.removeSubmit }) as HTMLButtonElement;
    fireEvent.change(box, { target: { value: 'ط' } });
    expect(submit).toBeDisabled();

    fireEvent.change(box, { target: { value: 'طلب مكرر' } });
    fireEvent.click(submit);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('طلب مكرر'));
  });
});
