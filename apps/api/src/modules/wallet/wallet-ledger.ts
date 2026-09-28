import { HttpException, HttpStatus } from '@nestjs/common';
import type { Prisma, WalletTransactionKind } from '../../generated/prisma/client';

/**
 * The ONLY code that moves a wallet's money. Pure functions over a caller's
 * transaction, not a service: the four places that move money (the wallet
 * desk, a course purchase, a wallet code, a refund off `/admin/finance`) each
 * already hold a transaction that must commit or roll back WITH the money, and
 * a service would need four modules to import one another to share it.
 *
 * ## The two statements that make it safe
 *
 * A credit is one upsert:
 *
 *     INSERT INTO wallets … ON CONFLICT (user_id)
 *       DO UPDATE SET balance_cents = wallets.balance_cents + $amount
 *       RETURNING balance_cents
 *
 * and a debit one conditional update:
 *
 *     UPDATE wallets SET balance_cents = balance_cents - $amount
 *      WHERE user_id = $user AND balance_cents >= $amount
 *      RETURNING balance_cents
 *
 * Each takes the wallet's row lock and holds it to commit, so two debits of
 * the same money serialise: the second one re-reads the balance the first one
 * left and finds zero rows if it no longer covers it. No read-then-write
 * window, no negative balance — and `wallets_balance_non_negative` refuses it
 * at the database even if a future caller forgets the `WHERE`.
 *
 * The ledger row goes in right after, carrying the balance the statement
 * returned. A deferred trigger checks at COMMIT that the cached balance equals
 * the SUM of the ledger, so the two can never be written apart.
 *
 * ## Idempotency lives in the caller's key
 *
 * `topupId`, `unlockCodeId` and `idempotencyKey` are each UNIQUE on the
 * ledger. A second credit for the same thing dies on the INSERT — after the
 * wallet was already updated in the same transaction, so the whole
 * transaction rolls back and the balance with it. The caller recognises the
 * violation (`isUniqueViolation` + a lookup by its own key) and answers with
 * the row that won.
 */

/** Everything that says what a movement WAS. `amountCents` is a positive
 *  magnitude — the direction comes from `creditWallet` vs `debitWallet`. */
export interface LedgerEntry {
  userId: string;
  kind: WalletTransactionKind;
  amountCents: number;
  countsAsIncome?: boolean;
  topupId?: string | null;
  unlockCodeId?: string | null;
  refundOfSubmissionId?: string | null;
  idempotencyKey?: string | null;
  actorUserId?: string | null;
  note?: string | null;
}

export interface LedgerRow {
  id: string;
  balanceAfterCents: number;
}

const CREDIT_KINDS: ReadonlySet<WalletTransactionKind> = new Set([
  'admin_credit',
  'code_topup',
  'transfer_topup',
  'refund',
]);

/**
 * «رصيدك مش كفاية» — the one refusal a student can reach by an ordinary
 * press. `details` carries the live balance and what was asked, so the
 * checkout can say how much is missing without reading the wallet again.
 */
export class WalletInsufficientError extends HttpException {
  constructor(balanceCents: number, requiredCents: number) {
    super(
      {
        code: 'wallet_insufficient',
        message: 'insufficient',
        details: { balanceCents, requiredCents },
      },
      HttpStatus.CONFLICT,
    );
  }
}

function assertAmount(amountCents: number): void {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    // A programming error, not a user one — every door validates with Zod
    // first. Thrown loudly so it can never become a silent zero-row.
    throw new Error(`wallet amount must be a positive integer, got ${amountCents}`);
  }
}

async function writeRow(
  tx: Prisma.TransactionClient,
  entry: LedgerEntry,
  signedAmount: number,
  balanceAfterCents: number,
): Promise<LedgerRow> {
  const row = await tx.walletTransaction.create({
    data: {
      userId: entry.userId,
      kind: entry.kind,
      amountCents: signedAmount,
      balanceAfterCents,
      countsAsIncome: entry.countsAsIncome ?? false,
      topupId: entry.topupId ?? null,
      unlockCodeId: entry.unlockCodeId ?? null,
      refundOfSubmissionId: entry.refundOfSubmissionId ?? null,
      idempotencyKey: entry.idempotencyKey ?? null,
      actorUserId: entry.actorUserId ?? null,
      note: entry.note ?? null,
    },
    select: { id: true, balanceAfterCents: true },
  });
  return row;
}

/** Money IN. Creates the wallet on the student's first movement. */
export async function creditWallet(
  tx: Prisma.TransactionClient,
  entry: LedgerEntry,
): Promise<LedgerRow> {
  assertAmount(entry.amountCents);
  if (!CREDIT_KINDS.has(entry.kind)) throw new Error(`${entry.kind} is not a credit`);

  const rows = await tx.$queryRaw<{ balance_cents: number }[]>`
    INSERT INTO "app"."wallets" ("user_id", "balance_cents", "created_at", "updated_at")
    VALUES (${entry.userId}, ${entry.amountCents}, now(), now())
    ON CONFLICT ("user_id") DO UPDATE
      SET "balance_cents" = "wallets"."balance_cents" + EXCLUDED."balance_cents",
          "updated_at" = now()
    RETURNING "balance_cents"
  `;
  const balance = rows[0]?.balance_cents;
  if (balance === undefined) throw new Error('wallet upsert returned no row');
  return writeRow(tx, entry, entry.amountCents, balance);
}

/**
 * Money OUT — refused with `WalletInsufficientError` when the balance does not
 * cover it. Nothing is written in that case; the caller's transaction is left
 * to roll back whatever else it did.
 */
export async function debitWallet(
  tx: Prisma.TransactionClient,
  entry: LedgerEntry,
): Promise<LedgerRow> {
  assertAmount(entry.amountCents);
  if (CREDIT_KINDS.has(entry.kind)) throw new Error(`${entry.kind} is not a debit`);

  const rows = await tx.$queryRaw<{ balance_cents: number }[]>`
    UPDATE "app"."wallets"
       SET "balance_cents" = "balance_cents" - ${entry.amountCents},
           "updated_at" = now()
     WHERE "user_id" = ${entry.userId}
       AND "balance_cents" >= ${entry.amountCents}
    RETURNING "balance_cents"
  `;
  const balance = rows[0]?.balance_cents;
  if (balance === undefined) {
    const current = await tx.wallet.findUnique({
      where: { userId: entry.userId },
      select: { balanceCents: true },
    });
    throw new WalletInsufficientError(current?.balanceCents ?? 0, entry.amountCents);
  }
  return writeRow(tx, entry, -entry.amountCents, balance);
}

/**
 * A unique violation — the «already done» signal described in the header.
 *
 * Deliberately NOT narrowed to a column by reading `meta.target`: its shape
 * differs between Prisma's engines and driver adapters, and a guard that
 * silently stops matching is worse than none. Every caller instead confirms by
 * looking up the row its own key names — if that row exists, this was the
 * duplicate; if not, the violation was something else and is rethrown.
 */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

/** The wallet's balance right now — `0` for a student who never had one. */
export async function walletBalance(
  client: Pick<Prisma.TransactionClient, 'wallet'>,
  userId: string,
): Promise<number> {
  const wallet = await client.wallet.findUnique({
    where: { userId },
    select: { balanceCents: true },
  });
  return wallet?.balanceCents ?? 0;
}
