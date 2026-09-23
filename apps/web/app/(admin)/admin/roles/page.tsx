import { GRANTABLE_ROLES, RoleGrantsReadSchema } from '@ayman/contracts/admin/roles';
import { copy } from '@ayman/contracts/copy/admin';
import { Card, CardBody } from '@ayman/ui';
import { adminGet } from '@/lib/admin-api';
import { PermissionGrid } from './permission-grid';

const c = copy.admin.roles;

export const metadata = { title: c.title };

/**
 * «المساعد يقدر يعمل إيه».
 *
 * الـAPI ورا الشاشة دي (`/admin/roles/:role/permissions`) موجود من زمان
 * **ومكانش ليه شاشة** — فالرول كان بياخد اللي `ROLE_PERMISSIONS` بيديله وبس،
 * ومفيش طريقة تفتحله حاجة زيادة غير كتابة كود.
 *
 * `GRANTABLE_ROLES` فيه واحد النهارده (`owner`)، والصفحة بتلف عليه بدل ما
 * تسمّيه: تاني رول يتضاف بيظهر هنا لوحده.
 *
 * من غير كاش — اللي بيعدّل صلاحية لازم يشوف كتابته هو، مش حالة قديمة.
 */
export default async function RolesPage() {
  const roles = await Promise.all(
    GRANTABLE_ROLES.map((role) =>
      adminGet(`/api/admin/roles/${role}/permissions`, RoleGrantsReadSchema),
    ),
  );

  return (
    <>
      <h1 className="mb-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
      <p className="mb-6 max-w-[var(--w-prose)] text-fg-muted">{c.lead}</p>

      <div className="space-y-6">
        {roles.map((grants) => (
          <Card key={grants.role}>
            <CardBody>
              <PermissionGrid grants={grants} />
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
