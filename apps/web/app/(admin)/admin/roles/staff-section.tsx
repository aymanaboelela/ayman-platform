'use client';

import { useState, useTransition, type ChangeEvent } from 'react';

import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';

import { searchAccountsAction, setStaffRoleAction } from './actions';
import { MemberPermissions } from './member-permissions';

const c = copy.admin.roles.staff;
const member = copy.admin.roles.member;

export interface StaffMember {
  id: string;
  name: string;
  phone: string;
  /** `owner` للمساعد، `admin` لصاحب المنصة — شوف الكومنت على الزرار تحت. */
  role: string;
}

interface Found {
  id: string;
  name: string;
  phone: string;
  role: string;
}

/**
 * «مين في الفريق» و«ضيف واحد» — السؤالين اللي شبكة الصلاحيات تحتها مابتجاوبهمش.
 *
 * الجدول تحت بيقول **المساعد بيقدر يعمل إيه**. ماكانش فيه حتة تقول مين
 * المساعدين أصلًا، ولا طريقة تضيف واحد: ده كان محتاج حساب `admin`، ومفيش
 * واحد على ستاك مدرّس — اتقاس، `GET /admin/roles/owner/permissions` رد 403.
 *
 * ## ⚠️ مفيش زرار بيعمل أدمن، ومش لأن الشاشة بتخبّيه
 *
 * الأكشن بينده `staff-role` اللي سكيماه `z.enum(['owner', 'student'])`. حتى لو
 * حد بعت طلب بإيده بـ`admin`، السيرفر مش هيعرف يقراها. الشاشة مش هي الحارس.
 */
export function StaffSection({
  members,
  currentUserId,
  founderId,
}: {
  members: StaffMember[];
  currentUserId: string;
  /** أقدم حساب مش-طالب — صلاحياته مقفولة على السيرفر، شوف `page.tsx`. */
  founderId?: string;
}) {
  const [term, setTerm] = useState('');
  const [found, setFound] = useState<Found[] | null>(null);
  const [reason, setReason] = useState('');
  const [picked, setPicked] = useState<Found | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  /*
   * المساعد اللي لوحة صلاحياته مفتوحة — واحد بس.
   *
   * لوحة لكل واحد مفتوحة في نفس الوقت معناها كل واحدة بتجيب صلاحياتها من
   * السيرفر، وشاشة بتقرا منها قرار عن حساب واحد. الواحد المفتوح بيجيب طلب
   * واحد ساعة ما يتفتح.
   */
  const [openMember, setOpenMember] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const search = (value: string) => {
    setTerm(value);
    setPicked(null);
    if (value.trim().length < 2) {
      setFound(null);
      return;
    }
    startTransition(async () => {
      const res = await searchAccountsAction(value);
      if (res.ok) {
        // اللي في الفريق خلاص مش نتيجة — عرضه بيدي زرار «ضيفه» لحد هو فيه.
        setFound(res.rows.filter((r) => r.role === 'student'));
      } else {
        setMessage(res.message);
      }
    });
  };

  const apply = (userId: string, role: 'owner' | 'student', done: string) => {
    startTransition(async () => {
      const res = await setStaffRoleAction(userId, role, reason.trim() || '—');
      setMessage(res.ok ? done : res.message);
      if (res.ok) {
        setTerm('');
        setFound(null);
        setPicked(null);
        setReason('');
      }
    });
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[length:var(--fs-title-3)] font-semibold text-fg">{c.title}</h2>
        <p className="mt-1 max-w-[var(--w-prose)] text-fg-muted">{c.lead}</p>
      </div>

      {/* الفريق الحالي أولًا: «مين موجود» قبل «ضيف واحد» — الشاشة بتتفتح أكتر
          عشان تتراجع مش عشان يتضاف حد. */}
      {members.length === 0 ? (
        <p className="text-fg-muted">{c.empty}</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-fg">{m.name}</p>
                {/* ⚠️ `dir=ltr` مع عزل: رقم لاتيني جوّه سطر عربي بينقلب من غيره. */}
                <p dir="ltr" className="text-[length:var(--fs-text-sm)] text-fg-muted [unicode-bidi:isolate]">
                  {m.phone}
                </p>
              </div>
              <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
                {c.roleOwner}
              </span>
              {m.id === currentUserId ? (
                // `changeRole` بيرفض إنك تغيّر دورك إنت — فالزرار مايتعرضش
                // بدل ما يتعرض ويرجع خطأ.
                <span className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.you}</span>
              ) : (
                <>
                  {/*
                    * ⚠️ حساب الأدمن مالوش زرار صلاحيات، وده مش إخفاء تجميلي.
                    *
                    * `userHasPermission` بيرجّع `true` للأدمن **قبل** ما يبص
                    * على جدول القفل أصلًا، فأي قرار بيتكتب عليه مالوش أثر.
                    * والسيرفر بيرفض الحفظ عشان كده (`replaceForUser`).
                    *
                    * واللي كشف ده إن الليستة دي `role=staff` — يعني «أي حد
                    * مش طالب» — فحسابات الأدمن بتظهر فيها. على البرودكشن
                    * التلات حسابات كلها أدمن، فالزرار كان معروض على حاجة
                    * مستحيل تتحفظ: تدوس، تقفل قسم، تحفظ، وتاخد «مقدرناش
                    * نحفظ» من غير ما تعرف إن ده مش هيشتغل أبدًا.
                    */}
                  {m.role === 'admin' || m.id === founderId ? (
                    <span className="text-[length:var(--fs-text-sm)] text-fg-muted">
                      {member.adminHasEverything}
                    </span>
                  ) : (
                    <Button
                      variant="secondary"
                      aria-expanded={openMember === m.id}
                      onClick={() => setOpenMember((current) => (current === m.id ? null : m.id))}
                    >
                      {openMember === m.id ? member.close : member.open}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() => apply(m.id, 'student', c.removed)}
                  >
                    {pending ? c.removing : c.remove}
                  </Button>
                </>
              )}

              {/*
                * اللوحة تحت الصف بعرضه الكامل — مش مودال.
                *
                * ⚠️ مودال هنا كان بيكسر الشل: كل مودال Radix بيبعت التوب بار
                * والريل لأول الصفحة (`scroll-lock-unsticks-the-shell`). والقرار
                * ده كمان بيتاخد بالمقارنة — إنك تشوف باقي الفريق وإنت بتقفل
                * على واحد مفيد، والمودال بيخبّيهم.
                */}
              {openMember === m.id && m.role !== 'admin' && m.id !== founderId ? (
                <div className="w-full basis-full">
                  <MemberPermissions userId={m.id} name={m.name} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-lg border border-line p-4">
        <Label htmlFor="staff-search">{c.searchLabel}</Label>
        <Input
          id="staff-search"
          value={term}
          autoComplete="off"
          placeholder={c.searchPlaceholder}
          onChange={(event: ChangeEvent<HTMLInputElement>) => search(event.target.value)}
          className="mt-1.5"
        />

        {pending && found === null ? (
          <p className="mt-2 text-[length:var(--fs-text-sm)] text-fg-muted">{c.searching}</p>
        ) : null}

        {found !== null && found.length === 0 ? (
          <p className="mt-2 text-[length:var(--fs-text-sm)] text-fg-muted">{c.noResults}</p>
        ) : null}

        {found !== null && found.length > 0 ? (
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
            {found.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-fg">{r.name}</p>
                  <p dir="ltr" className="text-[length:var(--fs-text-sm)] text-fg-muted [unicode-bidi:isolate]">
                    {r.phone}
                  </p>
                </div>
                <Button
                  variant={picked?.id === r.id ? 'primary' : 'secondary'}
                  disabled={pending}
                  onClick={() => setPicked(r)}
                >
                  {c.add}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}

        {/* السبب بيظهر بعد ما يختار — سؤال قبل ما يبقى ليه معنى هو حقل بيتساب
            فاضي. وهو مطلوب على السيرفر، فالشاشة بتسأله في وقته. */}
        {picked ? (
          <div className="mt-3">
            <Label htmlFor="staff-reason">{c.reasonLabel}</Label>
            <Input
              id="staff-reason"
              value={reason}
              autoComplete="off"
              placeholder={c.reasonPlaceholder}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setReason(event.target.value)}
              className="mt-1.5"
            />
            <Button
              className="mt-3"
              disabled={pending || reason.trim().length < 3}
              onClick={() => apply(picked.id, 'owner', c.added)}
            >
              {pending ? c.adding : c.add}
            </Button>
          </div>
        ) : null}
      </div>

      {message ? <p aria-live="polite" className="text-fg-muted">{message}</p> : null}
    </section>
  );
}
