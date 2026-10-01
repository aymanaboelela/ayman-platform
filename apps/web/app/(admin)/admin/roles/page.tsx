import { GRANTABLE_ROLES, RoleGrantsReadSchema } from '@ayman/contracts/admin/roles';
import { STAFF_ROLE_REASON_MIN } from '@ayman/contracts/admin/students';
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
  const [roles, staffResult, session] = await Promise.all([
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
    /*
     * ⚠️ نفس درس `GRANTABLE_ROLES` فوق، بس هنا على القراءة اللي الشاشة
     * الوحيدة المفيدة فيها لمدرّس هي بتاعتها: `Promise.all` من غير `catch`
     * معناها إن أي سبب — 500، أو مهلة، أو حتى شكل رد مش متوقع — بياخد
     * الشاشة كلها معاه لصفحة خطأ، بدل ما يفضل البحث والإضافة شغالين وبس
     * الليستة الحالية تبقى فاضية مع رسالة.
     */
    adminGet(
      '/api/admin/students?page=1&perPage=50&role=staff',
      z.object({
        rows: z.array(
          z.object({
            id: z.string(),
            fullName: z.string(),
            phone: z.string(),
            // ⚠️ الدور لازم يعدّي للشاشة. `role=staff` معناها «أي حد مش
            // طالب» — فحساب **أدمن** بيظهر في الليستة دي، وصلاحياته مش
            // بتتظبط من هنا. من غير الحقل ده الشاشة مابتعرفش تفرّق.
            role: z.string(),
            // عشان نعرف مين أقدم حساب — شوف `founderId` تحت.
            createdAt: z.string(),
          }),
        ),
      }),
    )
      .then((data) => ({ ok: true as const, data }))
      .catch((error: unknown) => {
        console.error('admin/roles: failed to load the team roster', error);
        return { ok: false as const };
      }),
    getSession(),
  ]);

  const staff = staffResult.ok ? staffResult.data : { rows: [] };

  /*
   * صاحب الستاك — أقدم حساب مش-طالب.
   *
   * السيرفر بيرفض أي تعديل على صلاحياته (`RolesController`)، والشاشة
   * مالهاش لازمة تعرض زرار بيرجع ٤٠٠ دايمًا.
   *
   * ⚠️ بيتحسب من نفس الليستة المعروضة، وهي `perPage=50`. لو الفريق بقى أكبر
   * من كده والأقدم وقع بره الصفحة، أسوأ حاجة تحصل إن الزرار يتعرض على حد
   * محمي ويرجع الخطأ — **مش** إن الحماية تتفك. الحارس في السيرفر.
   */
  const founderId = staff.rows.reduce<{ id: string; at: string } | null>(
    (oldest, row) => (!oldest || row.createdAt < oldest.at ? { id: row.id, at: row.createdAt } : oldest),
    null,
  )?.id;

  return (
    <>
      <h1 className="mb-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
      <p className="mb-6 max-w-[var(--w-prose)] text-fg-muted">{c.lead}</p>

      <div className="mb-8">
        <StaffSection
          members={staff.rows.map((r) => ({
            id: r.id,
            name: r.fullName,
            phone: r.phone,
            role: r.role,
          }))}
          currentUserId={session?.id ?? ''}
          reasonMin={STAFF_ROLE_REASON_MIN}
          founderId={founderId}
          loadFailed={!staffResult.ok}
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
