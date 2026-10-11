/**
 * The derived names of a new stack — pure, so the form can show them while
 * the owner types and the server can generate the same ones.
 *
 * Kept out of `tenant-env.ts` because that module is `server-only` (it mints
 * secrets), and a client component that imported it for a slug helper would
 * fail the build rather than ship it — the right outcome, but not a useful one.
 */

export const TENANT_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}$/;

/**
 * `POSTGRES_DB`: letters, digits and `_`, not starting with a digit. It is put
 * into the connection string and `pg_isready -d` unquoted, so one hyphen is a
 * container that never turns healthy and looks like Postgres being down.
 */
export function databaseName(key: string): string {
  const base = key.replace(/-/g, '_');
  return /^[0-9]/.test(base) ? `t_${base}_platform` : `${base}_platform`;
}

/**
 * A suggested `TENANT_KEY` from the domain the owner just typed — the first
 * label, which is what Adel's and Sabry's keys look like next to their domains.
 * Only a suggestion: the form shows it and lets it be edited.
 */
export function suggestTenantKey(host: string): string {
  const label = host.trim().toLowerCase().replace(/^https?:\/\//, '').split(/[./]/)[0] ?? '';
  const slug = label.replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '').slice(0, 31);
  return TENANT_KEY_PATTERN.test(slug) ? slug : '';
}

/** What a pasted domain becomes before any rule runs on it. */
export function cleanHost(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}
