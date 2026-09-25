import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts';
import { BookOrderReceivedButton } from './book-order-received-button';

const apiPostVoid = vi.fn();
const refresh = vi.fn();

vi.mock('@/lib/api', () => ({ apiPostVoid: (...args: unknown[]) => apiPostVoid(...args) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  cleanup();
  apiPostVoid.mockReset();
  refresh.mockReset();
});

const c = copy.books.mine;

/**
 * «يطلعله بوب أب يأكد عليها — لو وافق يبقى خلاص استلم، لو لا يبقى يقفل».
 * Nothing is recorded by the first press; only the yes in the dialog does it.
 */
describe('BookOrderReceivedButton', () => {
  it('asks first, and records nothing on the first press', () => {
    render(<BookOrderReceivedButton orderId="o-1" />);

    fireEvent.click(screen.getByRole('button', { name: c.confirmReceived }));

    expect(screen.getByRole('dialog', { name: c.confirmReceivedAsk })).toBeTruthy();
    expect(apiPostVoid).not.toHaveBeenCalled();
  });

  it('«لسه» closes the question and records nothing', () => {
    render(<BookOrderReceivedButton orderId="o-1" />);
    fireEvent.click(screen.getByRole('button', { name: c.confirmReceived }));

    fireEvent.click(screen.getByRole('button', { name: c.confirmReceivedNo }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(apiPostVoid).not.toHaveBeenCalled();
  });

  it('the yes records the delivery and refreshes the card', async () => {
    apiPostVoid.mockResolvedValue(undefined);
    render(<BookOrderReceivedButton orderId="o-1" />);
    fireEvent.click(screen.getByRole('button', { name: c.confirmReceived }));

    fireEvent.click(screen.getByRole('button', { name: c.confirmReceivedYes }));

    await waitFor(() => expect(apiPostVoid).toHaveBeenCalledWith('/api/book-orders/o-1/received'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
