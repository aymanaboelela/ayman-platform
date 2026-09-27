'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { PERMISSION_CATEGORIES } from '@ayman/contracts/admin/permission-categories';
import type { UserPermissionsRead } from '@ayman/contracts/admin/roles';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { Checkbox } from '@ayman/ui/components/checkbox';

import { getMemberPermissionsAction, setMemberPermissionsAction } from './actions';

const c = copy.admin.roles;

/** `payment:review` → «يراجع». الاسم التقني مايتعرضش، بس بيفضل في الـ`title`. */
function actionLabel(permission: string): string {
  const [resource = '', action = ''] = permission.split(':');
  const actions = c.action as Record<string, string | undefined>;
  const groups = c.group as Record<string, string | undefined>;
  return `${groups[resource] ?? resource} · ${actions[action] ?? action}`;
}

/**
 * «المساعد ده يشوف إيه» — القرار على الحساب، مش على الرول.
 *
 * ## ليه لوحة لكل حساب، والجدول اللي تحت موجود أصلًا
 *
 * الجدول بيفتح صلاحية لـ**كل** المساعدين. والسؤال اللي الفيتشر اتطلبت عشانه
 * كان «المساعد الجديد يصحّح بس، من غير ما يشوف الفلوس» — ومفيش شكل للجدول
 * يعمل ده، هو بيتكلم عن رول.
 *
 * ## القسم هو وحدة القرار، والصلاحية تحته
 *
 * تمن أقسام (`PERMISSION_CATEGORIES`)، كل واحد شيك بوكس واحد بيقفل القسم كله.
 * ٨٣ شيك بوكس مفرودين كانوا شاشة مالهاش قرار: محدش بيقرا منها إن فلان بيشوف
 * الفلوس ولا لأ. والتفاصيل لسه موجودة لو حد عايزها — بيفتح القسم.
 *
 * والعدّاد في العنوان («٧ من ١٠») هو اللي بيخلّي قسم مقفول نصّه باين من بره.
 * من غيره لازم تفتح التمنية واحد واحد عشان تعرف فيه إيه مقفول.
 *
 * ## ⚠️ الأساس مش معروض كحاجة مقفولة هنا
 *
 * في جدول الرول الأساس بيتعرض بمربعات مقفولة، لأنه مكتوب في الكود ومش
 * بيتغيّر. هنا **بيتغيّر**: القفل على الحساب بيشيل من الأساس كمان (ده كل
 * الفكرة — أساس `owner` هو «كل حاجة إلا المقالات»، ومن غير قفل مفيش مساعد
 * محدود). فمربع مقفول هنا كان هيبقى كذب.
 */
export function MemberPermissions({ userId, name }: { userId: string; name: string }) {
  const [data, setData] = useState<UserPermissionsRead | null>(null);
  const [failed, setFailed] = useState(false);
  const [held, setHeld] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    void getMemberPermissionsAction(userId).then((res) => {
      if (!alive) return;
      if (res.ok) {
        setData(res.data);
        setHeld(new Set(res.data.effective));
      } else {
        setFailed(true);
      }
    });
    // ⚠️ الحساب ممكن يتغيّر واللوحة مفتوحة (المدرّس بيقفل واحد ويفتح التاني).
    // من غير التنظيف ده رد الطلب القديم بيوصل بعد الجديد ويكتب فوقه.
    return () => {
      alive = false;
    };
  }, [userId]);

  /*
   * الكتالوج هو اللي بيحدد إيه اللي بيتعرض، مش اللي الحساب ماسكه.
   *
   * لو الليستة اتبنت من `effective` كانت الصلاحية المقفولة هتختفي من الشاشة
   * خالص — يعني تقفل حاجة ومش تلاقي طريقة ترجّعها.
   */
  const sections = useMemo(
    () =>
      PERMISSION_CATEGORIES.map((category) => {
        const permissions = category.permissions.filter(
          (permission) => data?.baseline.includes(permission) || data?.allowed.includes(permission),
        );
        return { ...category, permissions };
      }).filter((category) => category.permissions.length > 0),
    [data],
  );

  const toggleOne = (permission: string, on: boolean) => {
    setDirty(true);
    setHeld((current) => {
      const next = new Set(current);
      if (on) next.add(permission);
      else next.delete(permission);
      return next;
    });
  };

  const toggleSection = (permissions: readonly string[], on: boolean) => {
    setDirty(true);
    setHeld((current) => {
      const next = new Set(current);
      for (const permission of permissions) {
        if (on) next.add(permission);
        else next.delete(permission);
      }
      return next;
    });
  };

  /**
   * البريست — بيعلّم الشيك بوكسات وبس.
   *
   * ⚠️ مش بيحفظ. المدرّس بيشوف اللي اتعلّم ويعدّل قبل ما ينزل، عشان «كل حاجة
   * إلا الفلوس» تقريب مش قرار: فيه مساعد بيشحن كتب، والكتب في «الفلوس».
   */
  const preset = (keep: (key: string) => boolean) => {
    setDirty(true);
    setHeld(
      new Set(
        sections
          .filter((section) => keep(section.key))
          .flatMap((section) => section.permissions),
      ),
    );
  };

  const save = () => {
    start(async () => {
      const result = await setMemberPermissionsAction(userId, [...held]);
      if (result.ok) {
        toast.success(c.member.saved);
        setDirty(false);
      } else {
        toast.error(result.message);
      }
    });
  };

  if (failed) return <p className="p-3 text-fg-muted">{c.member.loadFailed}</p>;
  if (!data) return <p className="p-3 text-fg-muted">{c.member.loading}</p>;

  return (
    <div className="space-y-4 rounded-lg border border-line bg-surface-2 p-4">
      <div>
        <h3 className="text-[length:var(--fs-title-4)] font-medium text-fg">
          {formatCopy(c.member.title, { name })}
        </h3>
        <p className="mt-0.5 text-[length:var(--fs-text-sm)] text-fg-muted">{c.member.lead}</p>
      </div>

      <div>
        <p className="text-[length:var(--fs-text-sm)] font-medium text-fg">
          {c.member.presetTitle}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => preset((key) => key !== 'finance')}
          >
            {c.member.presetTeaching}
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => preset(() => true)}>
            {c.member.presetAll}
          </Button>
        </div>
        <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">
          {c.member.presetTeachingHint}
        </p>
      </div>

      <ul className="space-y-2">
        {sections.map((section) => {
          const on = section.permissions.filter((permission) => held.has(permission)).length;
          const all = section.permissions.length;
          const isOpen = open.has(section.key);
          return (
            <li key={section.key} className="rounded-md border border-line-subtle bg-surface p-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex min-w-0 flex-1 items-center gap-2">
                  <Checkbox
                    /* نصّه مفتوح = شرطة، لا صح ولا فاضي. القسم اللي نصّه
                       مقفول ماينفعش يقرا كأنه مفتوح كله. */
                    checked={on === all ? true : on > 0 ? 'indeterminate' : false}
                    disabled={pending}
                    onCheckedChange={(checked) =>
                      toggleSection(section.permissions, checked === true)
                    }
                  />
                  <span className="min-w-0">
                    <span className="font-medium text-fg">{section.titleAr}</span>
                    <span className="block text-[length:var(--fs-text-xs)] text-fg-muted">
                      {section.hintAr}
                    </span>
                  </span>
                </label>

                <span className="rounded-sm bg-surface-2 px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
                  {on === all
                    ? c.member.countAll
                    : on === 0
                      ? c.member.countNone
                      : formatCopy(c.member.count, { on, all })}
                </span>

                <Button
                  variant="ghost"
                  aria-expanded={isOpen}
                  onClick={() =>
                    setOpen((current) => {
                      const next = new Set(current);
                      if (next.has(section.key)) next.delete(section.key);
                      else next.add(section.key);
                      return next;
                    })
                  }
                >
                  {isOpen ? c.member.close : c.member.open}
                </Button>
              </div>

              {isOpen ? (
                <ul className="mt-3 grid gap-1.5 border-t border-line-subtle pt-3 sm:grid-cols-2">
                  {section.permissions.map((permission) => (
                    <li key={permission}>
                      <label
                        title={permission}
                        className="flex items-center gap-2 text-[length:var(--fs-text-sm)]"
                      >
                        <Checkbox
                          checked={held.has(permission)}
                          disabled={pending}
                          onCheckedChange={(checked) => toggleOne(permission, checked === true)}
                        />
                        {actionLabel(permission)}
                      </label>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={pending} onClick={save}>
          {pending ? c.member.saving : c.member.save}
        </Button>
        {dirty ? (
          <span aria-live="polite" className="text-[length:var(--fs-text-sm)] text-fg-muted">
            {c.member.dirty}
          </span>
        ) : null}
      </div>
    </div>
  );
}
