/**
 * Finds the first row where the audit chain stops verifying and says WHICH of
 * the two checks failed — the row's own content hash, or its link to the row
 * before it. `verifyChain` collapses both into one id, and the distinction is
 * the whole diagnosis: a content mismatch means a row was edited in place, a
 * link mismatch means a row was removed from the middle.
 *
 * Read-only. Prints; changes nothing.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { GENESIS_HASH, chainHash } from '../src/audit/chain';

// The owner URL, not the runtime one: this reads every audit row, and the
// runtime role is deliberately not allowed to.
const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  let cursor: bigint | undefined;
  let expectedPrev: string | null = null;
  let scanned = 0;

  for (;;) {
    const page = await prisma.auditLog.findMany({
      take: 500,
      ...(cursor === undefined ? {} : { skip: 1, cursor: { id: cursor } }),
      orderBy: { id: 'asc' },
    });
    if (page.length === 0) break;

    for (const row of page) {
      scanned++;
      const recomputed = chainHash(row.prevHash ?? GENESIS_HASH, {
        occurredAt: row.occurredAt.toISOString(),
        actorUserId: row.actorUserId,
        action: row.action,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        outcome: row.outcome,
        metadata: row.metadata ?? null,
      });

      const contentOk = recomputed === row.hash;
      const linkOk = row.prevHash === expectedPrev;

      if (!contentOk || !linkOk) {
        console.log(`\n  first break after ${scanned} rows — id ${row.id}\n`);
        console.log(`    content hash matches : ${contentOk ? 'YES' : 'NO'}`);
        console.log(`    link to previous ok  : ${linkOk ? 'YES' : 'NO'}`);
        console.log('');
        console.log(`    action        : ${row.action}`);
        console.log(`    resourceType  : ${row.resourceType}`);
        console.log(`    outcome       : ${row.outcome}`);
        console.log(`    occurredAt    : ${row.occurredAt.toISOString()}`);
        console.log(`    metadata      : ${JSON.stringify(row.metadata)?.slice(0, 160)}`);
        console.log('');
        console.log(`    stored hash   : ${row.hash}`);
        console.log(`    recomputed    : ${recomputed}`);
        console.log(`    stored prev   : ${row.prevHash}`);
        console.log(`    expected prev : ${expectedPrev}`);

        // How many rows further on are also broken, and in which way. One bad
        // row is an edit; a long unbroken run of link failures after a single
        // content failure is the signature of a rewrite that stopped partway.
        let contentBad = 0;
        let linkBad = 0;
        let prev = row.hash;
        const rest = await prisma.auditLog.findMany({
          where: { id: { gt: row.id } },
          orderBy: { id: 'asc' },
        });
        for (const r of rest) {
          const rc = chainHash(r.prevHash ?? GENESIS_HASH, {
            occurredAt: r.occurredAt.toISOString(),
            actorUserId: r.actorUserId,
            action: r.action,
            resourceType: r.resourceType,
            resourceId: r.resourceId,
            outcome: r.outcome,
            metadata: r.metadata ?? null,
          });
          if (rc !== r.hash) contentBad++;
          if (r.prevHash !== prev) linkBad++;
          prev = r.hash;
        }
        console.log('');
        console.log(`    of the ${rest.length} rows after it:`);
        console.log(`      content mismatches : ${contentBad}`);
        console.log(`      link mismatches    : ${linkBad}`);
        console.log('');
        return;
      }

      expectedPrev = row.hash;
    }
    cursor = page[page.length - 1]!.id;
  }

  console.log(`\n  chain verifies over all ${scanned} rows.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
