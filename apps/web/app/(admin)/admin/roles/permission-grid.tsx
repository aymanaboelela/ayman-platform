'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { RoleGrantsRead } from '@ayman/contracts/admin/roles';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { Checkbox } from '@ayman/ui/components/checkbox';
import { setRolePermissionsAction } from './actions';

const c = copy.admin.roles;

/** `payment:review` → «المدفوعات · يراجع». الاسم التقني بيفضل عنوان مساعد. */
function label(permission: string): { group: string; action: string } {
  const [resource = '', action = ''] = permission.split(':');
  const groups = c.group as Record<string, string | undefined>;
  const actions = c.action as Record<string, string | undefined>;
  return { group: groups[resource] ?? resource, action: actions[action] ?? action };
}

function byGroup(permissions: readonly string[]): [string, string[]][] {
  const map = new Map<string, string[]>();
  for (const permission of permissions) {
    const key = permission.split(':')[0] ?? permission;
    map.set(key, [...(map.get(key) ?? []), permission]);
  }
  return [...map.entries()].sort((a, b) => label(a[0] + ':').group.localeCompare(label(b[0] + ':').group, 'ar'));
}

/**
 * الصلاحيات اللي تقدر تفتحها للرول، متجمّعة بالمورد.
 *
 * ## ليه متجمّعة
 *
 * ٩١ صلاحية في قايمة واحدة قايمة محدش بيقراها لآخرها — واللي بيقرا الشاشة
 * دي بياخد قرار عن مين يوصل لفلوسه، مش بيتصفّح. التجميع بيخلّي «المدفوعات»
 * سطر واحد تحته أفعاله، فالسؤال يبقى «المساعد يشوف المدفوعات؟» مش «إيه
 * `payment:review`؟».
 *
 * ## والبايسلاين معروض ومقفول
 *
 * اللي الرول شايله دايمًا (`baseline`) بيتعرض فوق، بمربعات مقفولة. إخفاؤه
 * كان هيخلّي الشاشة تقرا كأن المساعد مالوش أي صلاحية لحد ما تفتحله — وهو
 * فعلًا بيدرّس ويصحّح من غير ما تلمس حاجة. والعرض من غير ما يكون مقفول كان
 * هيوعد بتحكّم مش موجود: البايسلاين مكتوب في الكود.
 *
 * ## الحفظ مجموعة كاملة مش فرق
 *
 * شكل الـAPI الموجود (`PUT`)، والسبب إن تبويبين مفتوحين على نفس الشاشة
 * بفرق كانوا هيكتبوا فوق بعض من غير ما حد يعرف. بالمجموعة الكاملة آخر حفظ
 * بيكسب، وده على الأقل شكل يقدر المستخدم يفهمه.
 */
export function PermissionGrid({ grants }: { grants: RoleGrantsRead }) {
  const [granted, setGranted] = useState<Set<string>>(new Set(grants.granted));
  const [pending, start] = useTransition();

  const toggle = (permission: string, on: boolean) => {
    setGranted((current) => {
      const next = new Set(current);
      if (on) next.add(permission);
      else next.delete(permission);
      return next;
    });
  };

  const save = () => {
    start(async () => {
      const result = await setRolePermissionsAction(grants.role, [...granted]);
      if (result.ok) toast.success(c.saved);
      else toast.error(result.message);
    });
  };

  return (
    <div className="space-y-6">
      {grants.baseline.length > 0 ? (
        <section>
          <h2 className="text-[length:var(--fs-title-4)] font-medium text-fg">
            {c.baselineTitle}
          </h2>
          <p className="mt-0.5 text-[length:var(--fs-text-sm)] text-fg-muted">
            {c.baselineHint}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {byGroup(grants.baseline).map(([group, permissions]) => (
              <span
                key={group}
                className="rounded-sm border border-line-subtle bg-surface-2 px-2 py-1 text-[length:var(--fs-text-xs)] text-fg-muted"
              >
                {label(`${group}:`).group}
                {' · '}
                {permissions.map((permission) => label(permission).action).join('، ')}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="text-[length:var(--fs-title-4)] font-medium text-fg">
          {c.grantableTitle}
        </h2>

        {grants.grantable.length === 0 ? (
          <p className="mt-2 text-fg-muted">{c.empty}</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {byGroup(grants.grantable).map(([group, permissions]) => (
              <div key={group} className="rounded-md border border-line-subtle p-3">
                <p className="text-[length:var(--fs-text-sm)] font-medium text-fg">
                  {label(`${group}:`).group}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {permissions.map((permission) => (
                    <li key={permission}>
                      <label className="flex items-center gap-2 text-[length:var(--fs-text-sm)]">
                        <Checkbox
                          checked={granted.has(permission)}
                          disabled={pending}
                          onCheckedChange={(checked) => toggle(permission, checked === true)}
                        />
                        {label(permission).action}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {grants.grantable.length > 0 ? (
        <Button type="button" disabled={pending} onClick={save}>
          {pending ? c.saving : c.save}
        </Button>
      ) : null}
    </div>
  );
}
