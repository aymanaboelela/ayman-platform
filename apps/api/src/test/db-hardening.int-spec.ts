import 'dotenv/config';
import { Client } from 'pg';

/** DATABASE_URL is the least-privilege runtime role — the one the server uses. */
const RUNTIME_URL = process.env.DATABASE_URL!;

describe('postgres hardening', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: RUNTIME_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it('connects as the runtime role, never as the owner', async () => {
    const { rows } = await client.query<{ current_user: string }>('SELECT current_user');
    expect(rows[0]!.current_user).toBe('ayman_runtime');
  });

  it('bounds runaway queries and abandoned transactions', async () => {
    // A single unbounded query on a shared pool takes the whole API down with it,
    // and an abandoned `BEGIN` holds locks that block every migration afterwards.
    const show = async (name: string) => {
      const { rows } = await client.query<Record<string, string>>(`SHOW ${name}`);
      return Object.values(rows[0]!)[0];
    };
    expect(await show('statement_timeout')).toBe('15s');
    expect(await show('idle_in_transaction_session_timeout')).toBe('30s');
    expect(await show('lock_timeout')).toBe('5s');
  });

  it('cannot execute DDL', async () => {
    // No DDL means a SQL-injection foothold cannot CREATE FUNCTION or DROP.
    await expect(client.query('CREATE TABLE app.injected_probe (id int)')).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('can append to the audit log', async () => {
    const { rows } = await client.query<{ ok: boolean }>(
      `SELECT has_table_privilege('ayman_runtime', 'app.audit_log', 'INSERT') AS ok`,
    );
    expect(rows[0]!.ok).toBe(true);
  });

  it('cannot delete, update, or truncate the audit log', async () => {
    // This REVOKE was already issued by Plan 6 Task 3's *_platform_config
    // migration (20260727024705_platform_config/migration.sql:144) — this
    // test VERIFIES it, it does not re-issue it. A second REVOKE migration
    // against an already-revoked privilege is a no-op at best and a
    // permanent `prisma migrate dev` drift report at worst.
    const { rows } = await client.query<{ priv: string; ok: boolean }>(
      `SELECT p AS priv, has_table_privilege('ayman_runtime', 'app.audit_log', p) AS ok
         FROM unnest(ARRAY['DELETE','UPDATE','TRUNCATE']) AS p`,
    );
    for (const row of rows) expect([row.priv, row.ok]).toEqual([row.priv, false]);

    // And prove it at the wire, not only in the catalogue.
    await expect(client.query('DELETE FROM app.audit_log WHERE true')).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('cannot update or delete attempt_events either (Plan 5)', async () => {
    // Same append-only discipline, verified for the OTHER ledger this
    // codebase already hardened (20260726150111_attempt_constraints).
    const { rows } = await client.query<{ priv: string; ok: boolean }>(
      `SELECT p AS priv, has_table_privilege('ayman_runtime', 'app.attempt_events', p) AS ok
         FROM unnest(ARRAY['UPDATE','DELETE']) AS p`,
    );
    for (const row of rows) expect([row.priv, row.ok]).toEqual([row.priv, false]);

    await expect(client.query('DELETE FROM app.attempt_events WHERE true')).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('still allows DELETE on ordinary tables', async () => {
    // A blanket revoke would have broken normal operation; the revoke must be
    // scoped to the append-only tables only.
    const { rows } = await client.query<{ ok: boolean }>(
      `SELECT has_table_privilege('ayman_runtime', 'app.student_profiles', 'DELETE') AS ok`,
    );
    expect(rows[0]!.ok).toBe(true);
  });

  it('grants PUBLIC nothing on the public schema', async () => {
    const { rows } = await client.query<{ ok: boolean }>(
      `SELECT has_schema_privilege('public', 'public', 'CREATE') AS ok`,
    );
    expect(rows[0]!.ok).toBe(false);
  });
});
