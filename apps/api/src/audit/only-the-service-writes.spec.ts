import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * `AuditService.record` is the only thing allowed to insert into `audit_log`.
 *
 * Every row carries a hash over the row before it, so a row written any other
 * way has no link — and `verifyChain` walks the whole table, so ONE such row
 * makes verification fail from that point on, forever. The table is INSERT-only
 * for the runtime role by design (the REVOKE is in its migration), which means
 * the damage cannot be undone by the application that caused it.
 *
 * This is not hypothetical. `analytics.int-spec.ts` inserted a `student:ban`
 * row directly with `hash: '0'.repeat(64)` so a lookup elsewhere would find it,
 * and it was right that the lookup did not care. `verifyChain` did. Each run
 * added another unrepairable break, and it was invisible on CI because the spec
 * that verifies the chain and the spec that broke it run in different jobs
 * against different throwaway databases. Only a developer's long-lived database
 * saw both — and it had three specs failing and a pre-push hook that could not
 * pass.
 *
 * A source scan rather than a runtime one: the write is the thing to prevent,
 * and by the time a test could observe it the row is already permanent.
 */
const API_SRC = resolve(import.meta.dirname, '..');
const ALLOWED = ['audit/audit.service.ts', 'audit/only-the-service-writes.spec.ts'];

/**
 * Comments are stripped before scanning, so the prose explaining WHY a write is
 * forbidden cannot be mistaken for the write. `analytics.int-spec.ts` names the
 * old call in its own comment, and that sentence is the reason nobody puts it
 * back.
 */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'generated' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.ts$/.test(entry)) out.push(full);
  }
  return out;
}

describe('audit_log', () => {
  it('is written only by AuditService', () => {
    const offenders = walk(API_SRC)
      .filter((file) => /\bauditLog\s*\.\s*create(Many)?\b/.test(code(file)))
      .map((file) => relative(API_SRC, file))
      .filter((file) => !ALLOWED.includes(file));

    expect(offenders).toEqual([]);
  });

  it('never hard-codes a hash', () => {
    // The shape the analytics spec used. A literal hash is always either an
    // unchained row or a copy of one, and both break verification.
    const offenders = walk(API_SRC)
      .filter((file) => !ALLOWED.includes(relative(API_SRC, file)))
      .filter((file) => /hash:\s*(['"`]0['"`]\.repeat\(64\)|['"`][0-9a-f]{64}['"`])/.test(code(file)))
      .map((file) => relative(API_SRC, file));

    expect(offenders).toEqual([]);
  });
});
