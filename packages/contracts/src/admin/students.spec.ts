import { describe, expect, it } from 'vitest';
import {
  AdminRoleChangeSchema,
  AdminStudentBulkDeleteResultSchema,
  AdminStudentBulkDeleteSchema,
  AdminStudentPatchSchema,
} from './students';

describe('AdminStudentPatchSchema', () => {
  it('rejects a role field riding along on a profile patch (A4)', () => {
    expect(AdminStudentPatchSchema.safeParse({ role: 'admin' }).success).toBe(false);
  });

  it('rejects an unknown key', () => {
    expect(AdminStudentPatchSchema.safeParse({ userId: 'x' }).success).toBe(false);
  });

  it('rejects an empty patch', () => {
    expect(AdminStudentPatchSchema.safeParse({}).success).toBe(false);
  });

  it('accepts clearing schoolName to null', () => {
    expect(AdminStudentPatchSchema.safeParse({ schoolName: null }).success).toBe(true);
  });

  it('accepts a partial fullName-only patch', () => {
    expect(AdminStudentPatchSchema.safeParse({ fullName: 'اسم جديد' }).success).toBe(true);
  });
});

describe('AdminRoleChangeSchema', () => {
  it('rejects a reason shorter than 8 characters', () => {
    expect(AdminRoleChangeSchema.safeParse({ role: 'admin', reason: 'قصير' }).success).toBe(false);
  });

  it('rejects a role outside the enum', () => {
    expect(AdminRoleChangeSchema.safeParse({ role: 'superadmin', reason: 'a valid reason' }).success).toBe(
      false,
    );
  });

  it('accepts a valid role change with a real reason', () => {
    expect(
      AdminRoleChangeSchema.safeParse({ role: 'admin', reason: 'ترقية بناءً على طلب الإدارة' }).success,
    ).toBe(true);
  });
});

describe('AdminStudentBulkDeleteSchema', () => {
  const REASON = 'حسابات مكررة اتسجلت بالغلط';

  /**
   * The bug this file exists to keep out.
   *
   * `userIds` was written as `z.array(z.uuid())`, which is true of the SEEDED
   * and e2e accounts — those rows are inserted by hand with UUID ids — and
   * false of every account created through the registration form, where
   * better-auth mints a 32-character nanoid. The schema passed every test
   * written against a fixture and answered a bare 400 for the actual users.
   */
  it('accepts a better-auth nanoid, not only a UUID', () => {
    const parsed = AdminStudentBulkDeleteSchema.safeParse({
      userIds: ['9vrJB5pO088EPb4hDZnMajJtPy48GIjL', '8926adca-39c4-4dd8-8368-00d2b45d2b3d'],
      reason: REASON,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an empty selection — a request that means nothing', () => {
    expect(AdminStudentBulkDeleteSchema.safeParse({ userIds: [], reason: REASON }).success).toBe(false);
  });

  it('rejects more than a hundred at a time', () => {
    const userIds = Array.from({ length: 101 }, (_, i) => `user-${i}`);
    expect(AdminStudentBulkDeleteSchema.safeParse({ userIds, reason: REASON }).success).toBe(false);
  });

  it('demands a reason long enough to mean something in the audit trail', () => {
    expect(AdminStudentBulkDeleteSchema.safeParse({ userIds: ['u1'], reason: 'مكرر' }).success).toBe(
      false,
    );
  });

  it('refuses an unknown field rather than ignoring it', () => {
    expect(
      AdminStudentBulkDeleteSchema.safeParse({ userIds: ['u1'], reason: REASON, force: true }).success,
    ).toBe(false);
  });
});

describe('AdminStudentBulkDeleteResultSchema', () => {
  it('parses a partial run, with the refusals named', () => {
    const parsed = AdminStudentBulkDeleteResultSchema.parse({
      deleted: ['9vrJB5pO088EPb4hDZnMajJtPy48GIjL'],
      failed: [{ userId: 'abc123', name: 'أدمن التطوير', reason: 'self' }],
    });
    expect(parsed.deleted).toHaveLength(1);
    expect(parsed.failed[0]?.reason).toBe('self');
  });

  it('rejects a refusal code the UI has no sentence for', () => {
    expect(
      AdminStudentBulkDeleteResultSchema.safeParse({
        deleted: [],
        failed: [{ userId: 'abc123', name: '', reason: 'because-i-said-so' }],
      }).success,
    ).toBe(false);
  });
});
