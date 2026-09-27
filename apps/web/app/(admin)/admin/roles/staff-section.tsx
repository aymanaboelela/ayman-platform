'use client';

import { useEffect, useRef, useState, useTransition, type ChangeEvent } from 'react';

import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
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
  /** `admin` بيتعرض من غير أزرار — شوف `staff.roleAdmin`. */
  role: string;
}

interface Found {
  id: string;
  name: string;
  phone: string;
}

/**
 * البحث بيستنى المدرّس يقف عن الكتابة شوية قبل ما يسأل السيرفر.
 *
 * من غيره كل حرف طلب — اسم من عشرين حرف عشرين طلب في ثانيتين، على نفس
 * الهوية اللي الريت ليمتر بيعدّ عليها — والردود بترجع بترتيب مش مضمون.
 */
const SEARCH_DEBOUNCE_MS = 250;

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
  reasonMin,
}: {
  members: StaffMember[];
  currentUserId: string;
  /** `STAFF_ROLE_REASON_MIN` — بييجي من الصفحة عشان الكومبوننت مايسحبش Zod
   *  للمتصفح عشان رقم واحد. */
  reasonMin: number;
}) {
  const [term, setTerm] = useState('');
  const [found, setFound] = useState<Found[] | null>(null);
  const [searching, setSearching] = useState(false);
  /*
   * غلط البحث لوحده، تحت خانة البحث.
   *
   * ⚠️ كان بيتكتب في نفس `message` بتاع تغيير الدور، بنص تغيير الدور —
   * فالمدرّس كتب اسم وقرا «مقدرناش نغيّر الدور»، ومافيش حاجة تمسحها غير
   * تغيير دور ناجح.
   */
  const [searchError, setSearchError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [picked, setPicked] = useState<Found | null>(null);
  /** نتيجة آخر تغيير دور — بس. */
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  /** المساعد اللي بيتأكّد شيله دلوقتي، وسببه. */
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  /*
   * المساعد اللي لوحة صلاحياته مفتوحة — واحد بس.
   *
   * لوحة لكل واحد مفتوحة في نفس الوقت معناها كل واحدة بتجيب صلاحياتها من
   * السيرفر، وشاشة بتقرا منها قرار عن حساب واحد. الواحد المفتوح بيجيب طلب
   * واحد ساعة ما يتفتح.
   */
  const [openMember, setOpenMember] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /*
   * رقم آخر بحث اتطلب. الرد اللي رقمه مش ده رد قديم — المدرّس كمّل كتابة —
   * فبيتساب. من غيره «ام» ممكن يرجع بعد «امجد» ويكتب نتايجه فوقه.
   */
  const latest = useRef(0);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const search = (value: string) => {
    setTerm(value);
    setPicked(null);
    setSearchError(null);
    setMessage(null);
    if (timer.current) clearTimeout(timer.current);
    const ticket = ++latest.current;
    if (value.trim().length < 2) {
      setFound(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(() => {
      void searchAccountsAction(value).then((res) => {
        if (ticket !== latest.current) return;
        setSearching(false);
        if (res.ok) {
          // السيرفر بيرجّع طلبة بس (`role=student`) — اللي في الفريق خلاص
          // مش نتيجة، وده متفلتر هناك مش هنا.
          setFound(res.rows);
        } else {
          setFound(null);
          setSearchError(res.message);
        }
      });
    }, SEARCH_DEBOUNCE_MS);
  };

  const apply = (userId: string, role: 'owner' | 'student', why: string, done: string) => {
    startTransition(async () => {
      const res = await setStaffRoleAction(userId, role, why.trim());
      setMessage(res.ok ? { tone: 'ok', text: done } : { tone: 'error', text: res.message });
      if (res.ok) {
        setTerm('');
        setFound(null);
        setPicked(null);
        setReason('');
        setRemoving(null);
        setRemoveReason('');
      }
    });
  };

  const reasonHint = formatCopy(c.reasonHint, { min: reasonMin });

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
                <p className="font-medium text-fg [overflow-wrap:anywhere]">{m.name}</p>
                {/* ⚠️ `dir=ltr` مع عزل: رقم لاتيني جوّه سطر عربي بينقلب من غيره. */}
                <p dir="ltr" className="text-[length:var(--fs-text-sm)] text-fg-muted [unicode-bidi:isolate]">
                  {m.phone}
                </p>
              </div>
              <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
                {m.role === 'admin' ? c.roleAdmin : c.roleOwner}
              </span>
              {m.id === currentUserId ? (
                // `changeRole` بيرفض إنك تغيّر دورك إنت — فالزرار مايتعرضش
                // بدل ما يتعرض ويرجع خطأ.
                <span className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.you}</span>
              ) : m.role === 'admin' ? null : (
                // ⚠️ الأدمن من غير أزرار: القفل على الحساب مابيوصلوش (بياخد
                // `'*'` قبل الجدول)، والسيرفر بيرفض شيله من الباب ده
                // (`setStaffRole`). زرار هنا كان هيوعد بحاجة مش هتحصل.
                <>
                  <Button
                    variant="secondary"
                    aria-expanded={openMember === m.id}
                    onClick={() => setOpenMember((current) => (current === m.id ? null : m.id))}
                  >
                    {openMember === m.id ? member.close : member.open}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={pending}
                    aria-expanded={removing === m.id}
                    onClick={() => {
                      setRemoving((current) => (current === m.id ? null : m.id));
                      setRemoveReason('');
                    }}
                  >
                    {c.remove}
                  </Button>
                </>
              )}

              {/*
                * الشيل بيسأل عن السبب قبل ما يحصل — زي الإضافة بالظبط.
                *
                * ⚠️ الزرار كان بيشيل على طول وبيبعت «—» كسبب، والسيرفر بيطلب
                * `reasonMin` حروف — فالشيل ماكانش بيشتغل ولا مرة، وكان بيطبع
                * «مقدرناش نغيّر الدور». والسؤال هنا كمان هو التأكيد: ضغطة
                * واحدة غلط ماتشيلش حد من الفريق.
                */}
              {removing === m.id ? (
                <div className="w-full basis-full rounded-md border border-line-subtle bg-surface-2 p-3">
                  <Label htmlFor={`staff-remove-${m.id}`}>{c.reasonLabel}</Label>
                  <Input
                    id={`staff-remove-${m.id}`}
                    value={removeReason}
                    autoComplete="off"
                    placeholder={c.removeReasonPlaceholder}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setRemoveReason(event.target.value)}
                    className="mt-1.5"
                  />
                  <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">{reasonHint}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      disabled={pending || removeReason.trim().length < reasonMin}
                      onClick={() => apply(m.id, 'student', removeReason, c.removed)}
                    >
                      {pending ? c.removing : c.confirmRemove}
                    </Button>
                    <Button variant="ghost" disabled={pending} onClick={() => setRemoving(null)}>
                      {c.cancel}
                    </Button>
                  </div>
                </div>
              ) : null}

              {/*
                * اللوحة تحت الصف بعرضه الكامل — مش مودال.
                *
                * ⚠️ مودال هنا كان بيكسر الشل: كل مودال Radix بيبعت التوب بار
                * والريل لأول الصفحة (`scroll-lock-unsticks-the-shell`). والقرار
                * ده كمان بيتاخد بالمقارنة — إنك تشوف باقي الفريق وإنت بتقفل
                * على واحد مفيد، والمودال بيخبّيهم.
                */}
              {openMember === m.id ? (
                <div className="w-full basis-full">
                  <MemberPermissions userId={m.id} name={m.name} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {/* نتيجة تغيير الدور — تحت الفريق اللي اتغيّر، مش تحت خانة البحث. */}
      {message ? (
        <p
          aria-live="polite"
          className={message.tone === 'error' ? 'text-danger' : 'text-fg-muted'}
        >
          {message.text}
        </p>
      ) : null}

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

        {searching ? (
          <p aria-live="polite" className="mt-2 text-[length:var(--fs-text-sm)] text-fg-muted">
            {c.searching}
          </p>
        ) : null}

        {searchError ? (
          <p role="alert" className="mt-2 text-[length:var(--fs-text-sm)] text-danger">
            {searchError}
          </p>
        ) : null}

        {!searching && found !== null && found.length === 0 ? (
          <p className="mt-2 text-[length:var(--fs-text-sm)] text-fg-muted">{c.noResults}</p>
        ) : null}

        {found !== null && found.length > 0 ? (
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
            {found.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 p-3">
"                <div className="min-w-0 flex-1">
                  <p className="font-medium text-fg [overflow-wrap:anywhere]">{r.name}</p>
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
            <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">{reasonHint}</p>
            {/* `reasonMin` مش ٣: الزرار كان بيتفتح عند ٣ والسيرفر بيطلب ٨،
                فسبب من ٤ لـ٧ حروف كان بيرجع «مقدرناش نغيّر الدور». */}
            <Button
              className="mt-3"
              disabled={pending || reason.trim().length < reasonMin}
              onClick={() => apply(picked.id, 'owner', reason, c.added)}
            >
              {pending ? c.adding : c.add}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
