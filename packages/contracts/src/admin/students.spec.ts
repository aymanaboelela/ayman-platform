import { describe, expect, it } from 'vitest';
import {
  AdminRoleChangeSchema,
  AdminStudentBulkDeleteResultSchema,
  AdminStudentBulkDeleteSchema,
  AdminStudentPatchSchema,
  AdminStudentSetPasswordSchema,
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

  it('accepts a valid school stream', () => {
    expect(AdminStudentPatchSchema.safeParse({ schoolStream: 'languages' }).success).toBe(true);
  });

  it('accepts clearing schoolStream to null', () => {
    expect(AdminStudentPatchSchema.safeParse({ schoolStream: null }).success).toBe(true);
  });

  it('rejects a school stream outside the enum', () => {
    expect(AdminStudentPatchSchema.safeParse({ schoolStream: 'science' }).success).toBe(false);
  });

  it('normalises a phone typed with a leading zero to E.164', () => {
    const parsed = AdminStudentPatchSchema.parse({ phone: '01012345678' });
    expect(parsed.phone).toBe('+201012345678');
  });

  it('accepts a phone already in E.164', () => {
    expect(AdminStudentPatchSchema.safeParse({ phone: '+201012345678' }).success).toBe(true);
  });

  it('rejects a phone that is not a valid Egyptian number', () => {
    expect(AdminStudentPatchSchema.safeParse({ phone: '12345' }).success).toBe(false);
  });

  // Never nullable: every account keeps a login identity, so clearing it back
  // to `null` is not an operation this schema can express.
  it('rejects a null phone', () => {
    expect(AdminStudentPatchSchema.safeParse({ phone: null }).success).toBe(false);
  });

  it('accepts a valid email', () => {
    expect(AdminStudentPatchSchema.safeParse({ email: 'student@example.test' }).success).toBe(true);
  });

  it('accepts clearing email to null', () => {
    expect(AdminStudentPatchSchema.safeParse({ email: null }).success).toBe(true);
  });

  it('rejects a malformed email', () => {
    expect(AdminStudentPatchSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
  });

  /**
   * A synthesised `…@phone.invalid` address is an implementation detail of
   * the sign-up flow — `isPlaceholderEmail` guards every READ path, and this
   * is the one WRITE path an admin could otherwise type one into by hand.
   */
  it('rejects a synthesised placeholder address', () => {
    expect(
      AdminStudentPatchSchema.safeParse({ email: '201012345678@phone.invalid' }).success,
    ).toBe(false);
  });
});

describe('AdminStudentSetPasswordSchema', () => {
  it('accepts a password of the minimum length', () => {
    expect(AdminStudentSetPasswordSchema.safeParse({ newPassword: '12345678' }).success).toBe(true);
  });

  it('rejects a password shorter than 8 characters', () => {
    expect(AdminStudentSetPasswordSchema.safeParse({ newPassword: '1234567' }).success).toBe(false);
  });

  it('rejects a password longer than 128 characters', () => {
    expect(
      AdminStudentSetPasswordSchema.safeParse({ newPassword: 'a'.repeat(129) }).success,
    ).toBe(false);
  });

  it('rejects an unknown field', () => {
    expect(
      AdminStudentSetPasswordSchema.safeParse({ newPassword: '12345678', confirmPassword: '12345678' })
        .success,
    ).toBe(false);
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
