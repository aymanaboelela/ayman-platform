import { describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts/copy/admin';
import { AdminApiError } from './admin-api';
import { roleChangeError } from './role-change-error';

const c = copy.admin.students;
const refused = (message: string) =>
  new AdminApiError(`POST /api/admin/students/x/role failed with 403: {}`, 403, { statusCode: 403, message });

/**
 * «POST /api/admin/students/…/role failed with 403: {"statusCode":403,…}» —
 * what a teacher read when he tried to add an assistant. Every refusal is a
 * 403; the words are what tell him what to do next.
 */
describe('roleChangeError', () => {
  it('sends a teacher who pressed the admin-only door to the team screen', () => {
    expect(roleChangeError(refused('Forbidden'))).toBe(c.roleChangeAdminOnly);
  });

  it('names each refusal the service can give', () => {
    expect(roleChangeError(refused('you cannot change your own role'))).toBe(c.roleChangeSelfError);
    expect(roleChangeError(refused('cannot demote the last remaining admin'))).toBe(c.roleChangeLastAdminError);
    expect(roleChangeError(refused('an admin is not managed from the team screen'))).toBe(c.roleChangeAdminTarget);
    expect(roleChangeError(refused('this account holds permissions you do not'))).toBe(c.roleChangeOutranked);
    expect(roleChangeError(refused('you cannot appoint someone with permissions you do not hold'))).toBe(
      c.roleChangeBeyondYou,
    );
  });

  it('never prints the raw request line', () => {
    const message = roleChangeError(new AdminApiError('POST /x failed with 500: {}', 500, null));
    expect(message).toBe(c.roleChangeFailed);
    expect(roleChangeError(new Error('boom'))).toBe(c.roleChangeFailed);
  });
});
