'use server';

import { z } from 'zod';
import {
  AdminWalletSchema,
  AdminWalletSearchSchema,
  type AdminWallet,
  type AdminWalletCreditInput,
  type AdminWalletDebitInput,
  type AdminWalletSearch,
} from '@ayman/contracts/admin/wallet';
import { AdminApiError, adminGet, adminSend } from '@/lib/admin-api';
import { revalidatePath } from '@/lib/revalidate-screen';

/**
 * «شحن المحفظة» — every write goes through the API with the admin's own
 * cookie; nothing here computes a balance. The failure codes the screens need
 * to say something specific about are passed through as `reason`.
 */
export type WalletActionResult =
  | { ok: true; wallet: AdminWallet }
  | { ok: false; reason: 'insufficient' | 'failed'; balanceCents?: number };

function failureOf(error: unknown): WalletActionResult {
  if (error instanceof AdminApiError) {
    const payload = (error.payload ?? {}) as { code?: unknown; details?: { balanceCents?: unknown } };
    if (payload.code === 'wallet_insufficient') {
      const balance = Number(payload.details?.balanceCents);
      return { ok: false, reason: 'insufficient', balanceCents: Number.isFinite(balance) ? balance : undefined };
    }
  }
  return { ok: false, reason: 'failed' };
}

export async function creditWalletAction(userId: string, input: AdminWalletCreditInput): Promise<WalletActionResult> {
  try {
    const wallet = await adminSend('POST', `/api/admin/wallets/${encodeURIComponent(userId)}/credit`, input, AdminWalletSchema);
    revalidatePath(`/admin/wallet/${userId}`);
    return { ok: true, wallet };
  } catch (error) {
    return failureOf(error);
  }
}

export async function debitWalletAction(userId: string, input: AdminWalletDebitInput): Promise<WalletActionResult> {
  try {
    const wallet = await adminSend('POST', `/api/admin/wallets/${encodeURIComponent(userId)}/debit`, input, AdminWalletSchema);
    revalidatePath(`/admin/wallet/${userId}`);
    return { ok: true, wallet };
  } catch (error) {
    return failureOf(error);
  }
}

/** The search box — a read, through the admin's own cookie. */
export async function searchWalletsAction(q: string): Promise<AdminWalletSearch | null> {
  try {
    return await adminGet(`/api/admin/wallets?q=${encodeURIComponent(q.slice(0, 120))}`, AdminWalletSearchSchema);
  } catch {
    return null;
  }
}

export type TopupActionResult = { ok: true; amountCents: number } | { ok: false; message: 'already-reviewed' | 'failed' };

const ApproveResultSchema = z.object({
  id: z.string(),
  status: z.literal('approved'),
  amountCents: z.number().int(),
  balanceCents: z.number().int(),
});

export async function approveTopupAction(id: string, amountCents: number | null): Promise<TopupActionResult> {
  try {
    const result = await adminSend(
      'POST',
      `/api/admin/wallet-topups/${encodeURIComponent(id)}/approve`,
      { amountCents },
      ApproveResultSchema,
    );
    revalidatePath('/admin/wallet/requests');
    return { ok: true, amountCents: result.amountCents };
  } catch (error) {
    return { ok: false, message: error instanceof AdminApiError && error.status === 409 ? 'already-reviewed' : 'failed' };
  }
}

export async function rejectTopupAction(id: string, reason: string): Promise<TopupActionResult> {
  try {
    await adminSend(
      'POST',
      `/api/admin/wallet-topups/${encodeURIComponent(id)}/reject`,
      { reason },
      z.object({ ok: z.literal(true) }),
    );
    revalidatePath('/admin/wallet/requests');
    return { ok: true, amountCents: 0 };
  } catch (error) {
    return { ok: false, message: error instanceof AdminApiError && error.status === 409 ? 'already-reviewed' : 'failed' };
  }
}
