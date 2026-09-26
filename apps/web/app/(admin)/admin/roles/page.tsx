import { GRANTABLE_ROLES, RoleGrantsReadSchema } from '@ayman/contracts/admin/roles';
import { copy } from '@ayman/contracts/copy/admin';
import { Card, CardBody } from '@ayman/ui';
import { adminGet, adminGetOrForbidden } from '@/lib/admin-api';
import { PermissionGrid } from './permission-grid';
import { StaffSection } from './staff-section';
import { getSession } from '@/lib/session';
import { z } from '@ayman/contracts/zod';

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
  const [roles, staff, session] = await Promise.all([
    /*
     * ⚠️ `OrForbidden` — و`role:read` **محجوبة عن المدرّس** في
     * `OWNER_WITHHELD`، فالقراءة دي بترد 403 على كل ستاك مدرّس، دايمًا.
     *
     * وde كان بيقتل الصفحة كلها: `Promise.all` من غير `catch` معناها إن رفض
     * واحد بياخد الشاشة معاه. اتقاس على الحي — `/admin/roles` رد 200 بصفحة
     * **فاضية** عند صبري وعادل، وجدول الصلاحيات وقسم الفريق الاتنين مابانوش.
     *
     * جدول الصلاحيات نفسه مالوش معنى للمدرّس أصلًا: هو بيفتح صلاحيات لرول،
     * وde قرار المشغّل. اللي يخصه هو قسم الفريق — فالجدول بيختفي والقسم
     * بيفضل، بدل ما الاتنين يروحوا.
     */
    Promise.all(
      GRANTABLE_ROLES.map((role) =>
        adminGetOrForbidden(`/api/admin/roles/${role}/permissions`, RoleGrantsReadSchema),
      ),
    ),
    /*
     * الفريق الحالي — من قايمة الطلبة بفلتر `role=staff`.
     *
     * مش endpoint جديد: القايمة أصلًا بترجّع الدور في كل صف وبتدوّر بالاسم
     * والموبايل والإيميل، فنسخة تانية من نفس الاستعلام كانت هتدرِفت عنها.
     *
     * `staff` معناها «أي حد مش طالب» — دور رابع يتضاف بكرة هيبان هنا من غير
     * ما حد يفتكر يعدّل الشاشة دي.
     */
    adminGet(
      '/api/admin/students?page=1&perPage=50&role=staff',
      z.object({
        rows: z.array(z.object({ id: z.string(), fullName: z.string(), phone: z.string() })),
      }),
    ),
    getSession(),
  ]);

  return (
    <>
      <h1 className="mb-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
      <p className="mb-6 max-w-[var(--w-prose)] text-fg-muted">{c.lead}</p>

      <div className="mb-8">
        <StaffSection
          members={staff.rows.map((r) => ({ id: r.id, name: r.fullName, phone: r.phone }))}
          currentUserId={session?.id ?? ''}
        />
      </div>

      <div className="space-y-6">
        {roles.filter((grants) => grants !== null).map((grants) => (
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
