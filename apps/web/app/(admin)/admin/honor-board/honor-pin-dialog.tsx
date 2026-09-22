'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Pencil, Plus, Search, TriangleAlert } from 'lucide-react';
import type {
  AdminHonorCourse,
  AdminHonorPinRow,
  AdminHonorStudent,
} from '@ayman/contracts/admin/honor-board';
import { HONOR_PIN_MAX_RANK } from '@ayman/contracts/admin/honor-board';
import { copy } from '@ayman/contracts/copy/admin';
import { copy as siteCopy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ayman/ui/components/dialog';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';
import { MediaKeyField } from '@/components/admin/media-key-field';
import { createHonorPinAction, patchHonorPinAction, searchHonorStudentsAction } from './actions';

const c = copy.admin.honorBoard;
const RANKS = siteCopy.landing.honorBoard.placeRanks;

/** اليوم المصري كـ`YYYY-MM-DD` — القيمة الافتراضية في خانة التاريخ.
 *  `en-CA` لأنه الـlocale الوحيد اللي تاريخه القصير هو الشكل ده حرفيًا،
 *  ونفس الفورماتر اللي السيرفر بيبوّب بيه الأدوار. */
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' });

/**
 * «ضيف طالب للوحة» و«عدّل التكريم» — ديالوج واحد.
 *
 * ## ليه واحد مش اتنين
 *
 * نفس الحقول بالحرف: تاريخ، مركز، كورس، سبب، صورة. الفرق الوحيد إن الإضافة
 * بتسأل عن الطالب والتعديل لأ — نقل تكريم من طالب لطالب مش تعديل، ده مسح
 * وإضافة، وعشان كده `AdminHonorPinPatchSchema` مافيهوش `userId` أصلاً.
 *
 * ## البحث Server Action مش fetch
 *
 * الراوت ورا `honor:read` وبياخد كوكي الجلسة وهيدر CSRF. نداء مباشر من
 * المتصفح كان لازم يركّب الاتنين بإيده، وده اللي كل كتابة في الشاشة دي
 * بتعدّيه على السيرفر عشانه.
 *
 * ## ⚠️ فيه سطر تحذير جوّه الديالوج
 *
 * الدوسة دي بتنشر اسم وصورة طالب قاصر على الصفحة الرئيسية لأي حد على النت.
 * السطر مش زينة — هو الحاجة الوحيدة في الشاشة اللي بتقول ده قبل ما يحصل.
 */
export function HonorPinDialog({
  pin,
  courses,
}: {
  /** `null` بيضيف. */
  pin: AdminHonorPinRow | null;
  courses: AdminHonorCourse[];
}) {
  const [open, setOpen] = useState(false);
  const [student, setStudent] = useState<AdminHonorStudent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoKey, setPhotoKey] = useState<string | null>(pin?.photoKey ?? null);
  const [rank, setRank] = useState(String(pin?.rank ?? 1));
  const [pending, start] = useTransition();

  const today = useMemo(() => dayKey.format(new Date()), []);

  /*
   * الفورم بيترجع لأصله كل ما الديالوج يتفتح.
   *
   * من غير ده، تفتح «ضيف» بعد ما تلغي واحدة، فتلاقي طالب مختار من المرة
   * اللي فاتت — وتحفظه.
   *
   * جوّه الهاندلر مش في `useEffect`: ده حدث (اتفتح)، مش مزامنة مع نظام
   * برّاني، و`setState` جوّه إيفيكت بيعمل رندر متسلسل — وde القاعدة اللي
   * `react-hooks/set-state-in-effect` بتمسكها.
   */
  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setStudent(null);
    setError(null);
    setPhotoKey(pin?.photoKey ?? null);
    setRank(String(pin?.rank ?? 1));
  }

  function submit(form: FormData) {
    const day = String(form.get('day') ?? '');
    const reason = String(form.get('reason') ?? '').trim();
    const courseId = String(form.get('courseId') ?? '');
    const payload = {
      day,
      rank: Number(rank),
      courseId: courseId === '' ? null : courseId,
      reason,
      photoKey,
    };

    start(async () => {
      const result = pin
        ? await patchHonorPinAction(pin.id, payload)
        : student
          ? await createHonorPinAction({ ...payload, userId: student.userId })
          : { ok: false as const, message: c.searchHint };
      if (result.ok) setOpen(false);
      else setError(result.message);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {pin ? (
          <Button type="button" variant="ghost" size="sm">
            <Pencil className="size-4" aria-hidden="true" />
            {c.edit}
          </Button>
        ) : (
          <Button type="button">
            <Plus className="size-4" aria-hidden="true" />
            {c.add}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent closeLabel={copy.admin.common.cancel} className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{pin ? c.editTitle : c.addTitle}</DialogTitle>
        </DialogHeader>

        {/* ⚠️ فوق الفورم، مش تحته: السطر ده لازم يتقري قبل الحفظ مش بعده. */}
        <p className="flex items-start gap-2 rounded-md border border-[color:var(--warn)] bg-[color-mix(in_oklch,var(--warn),transparent_92%)] p-3 text-[length:var(--fs-text-sm)] text-fg">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {c.publishWarning}
        </p>

        <form action={submit} className="space-y-4">
          {pin ? (
            <p className="text-[length:var(--fs-text-base)] font-semibold text-fg">
              {pin.studentName}
            </p>
          ) : student ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-line p-3">
              <div className="min-w-0">
                <p className="truncate text-[length:var(--fs-text-base)] font-semibold text-fg">
                  {student.fullName}
                </p>
                <p className="truncate text-[length:var(--fs-text-sm)] text-fg-muted">
                  {student.phone ?? ''}
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setStudent(null)}>
                {c.changeStudent}
              </Button>
            </div>
          ) : (
            <StudentSearch onPick={setStudent} />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="honor-day">{c.dayLabel}</Label>
              {/* `type="date"` — المتصفح بيدي منتقي تاريخ بلغة الجهاز، وده
                  أقل حاجة ممكن تتكتب غلط في خانة التاريخ. القيمة نفسها
                  `YYYY-MM-DD` وهي اللي العقد مستنيها بالحرف. */}
              <Input
                id="honor-day"
                name="day"
                type="date"
                required
                dir="ltr"
                defaultValue={pin?.day ?? today}
              />
              <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-subtle">{c.dayHint}</p>
            </div>

            <div>
              <Label htmlFor="honor-rank">{c.rankLabel}</Label>
              <Select id="honor-rank" value={rank} onChange={(e) => setRank(e.target.value)}>
                {Array.from({ length: HONOR_PIN_MAX_RANK }, (_, index) => (
                  <option key={index + 1} value={String(index + 1)}>
                    {RANKS[index] ?? String(index + 1)}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-subtle">{c.rankHint}</p>
            </div>
          </div>

          <div>
            <Label htmlFor="honor-course">{c.courseLabel}</Label>
            <Select id="honor-course" name="courseId" defaultValue={pin?.courseId ?? ''}>
              <option value="">{c.courseNone}</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title} — {course.label}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-subtle">{c.courseHint}</p>
          </div>

          <div>
            <Label htmlFor="honor-reason">{c.reasonLabel}</Label>
            <Input
              id="honor-reason"
              name="reason"
              required
              maxLength={120}
              placeholder={c.reasonPlaceholder}
              defaultValue={pin?.reason ?? ''}
            />
            <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-subtle">{c.reasonHint}</p>
          </div>

          {/* `shape="round"` — الكارت بيرسم الصورة في **دايرة**، وقصّة 16/9
              مركّبة على دايرة بتاخد التلت اللي في النص وترمي الوش. */}
          <MediaKeyField
            name="photoKey"
            id="honor-photo"
            label={c.photoLabel}
            hint={c.photoHint}
            shape="round"
            defaultValue={pin?.photoKey ?? null}
            onChange={setPhotoKey}
          />

          {error ? (
            <p role="alert" className="text-[length:var(--fs-text-sm)] text-[color:var(--err)]">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {c.cancel}
            </Button>
            {/* الحفظ مقفول لحد ما يبقى فيه طالب — الإضافة من غير طالب كانت
                هترد ٤٠٠ بعد ما الفورم يتملا كله. */}
            <Button type="submit" disabled={pending || (!pin && !student)}>
              {pending ? c.saving : c.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * «دوّر على الطالب» — بالاسم أو بالتليفون.
 *
 * ⚠️ بيدوّر بعد ما الكتابة تهدى ٢٥٠ ملّي، مش على كل حرف. الراوت ده ورا
 * الثروتل زي أي حاجة تانية، واسم زي «محمد» بيتكتب على ٥ ريكويستات لو مفيش
 * تأخير — وأول أربعة منهم إجابتهم مالهاش لازمة.
 *
 * والتليفون بيتعرض تحت الاسم عشان «محمد أحمد» على نفس الدفعة اتنين، والاسم
 * لوحده مش اختيار.
 */
function StudentSearch({ onPick }: { onPick: (student: AdminHonorStudent) => void }) {
  const [term, setTerm] = useState('');
  /*
   * النتيجة **ومعاها الكلمة اللي جابتها**، مش ليستة لوحدها.
   *
   * ده اللي بيخلّي «بندوّر…» حاجة متحسوبة مش ستيت تاني: طول ما المكتوب مش
   * هو اللي معانا نتيجته، إحنا بندوّر. ستيت `searching` منفصل كان لازم
   * `setState` جوّه الإيفيكت (`react-hooks/set-state-in-effect`)، وكان
   * بيفضل شغّال لو الكتابة اتمسحت قبل ما الرد يوصل.
   */
  const [results, setResults] = useState<{ q: string; rows: AdminHonorStudent[] } | null>(null);
  /* رقم الطلب. الرد البطيء بتاع «محم» بيوصل بعد رد «محمد» أحيانًا، وبيكتب
     مكانه نتايج قديمة — العداد ده بيرمي أي رد مش بتاع آخر كتابة. */
  const seq = useRef(0);
  const query = term.trim();
  const ready = query.length >= 2;
  const searching = ready && results?.q !== query;
  const rows = results?.q === query ? results.rows : [];

  useEffect(() => {
    const current = term.trim();
    if (current.length < 2) return;
    const mine = ++seq.current;
    const timer = setTimeout(() => {
      void searchHonorStudentsAction(current).then((students) => {
        if (mine !== seq.current) return;
        setResults({ q: current, rows: students });
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [term]);

  return (
    <div>
      <Label htmlFor="honor-student">{c.searchLabel}</Label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute inset-inline-start-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
          aria-hidden="true"
        />
        <Input
          id="honor-student"
          // مش `name` — القيمة دي مابتتبعتش مع الفورم، اللي بيتبعت هو
          // `userId` بتاع اللي اتختار.
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={c.searchPlaceholder}
          autoComplete="off"
          className="ps-9"
        />
      </div>

      {!ready ? (
        <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-subtle">{c.searchHint}</p>
      ) : searching ? (
        <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-subtle">{c.searching}</p>
      ) : rows.length === 0 ? (
        <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-subtle">{c.searchEmpty}</p>
      ) : (
        <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
          {rows.map((row) => (
            <li key={row.userId}>
              <button
                type="button"
                onClick={() => onPick(row)}
                className="flex w-full items-center justify-between gap-3 rounded-md border border-line p-2.5 text-start hover:bg-surface-3"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[length:var(--fs-text-sm)] font-medium text-fg">
                    {row.fullName}
                  </span>
                  <span className="block truncate text-[length:var(--fs-text-sm)] text-fg-muted">
                    {row.phone ?? ''}
                  </span>
                </span>
                {/* «اتكرّم قبل كده» — الرقم ده بيمنع إن نفس الطالب يتحط
                    مرتين على نفس الدور من غير ما حد ياخد باله. */}
                {row.pinCount > 0 ? (
                  <span className="shrink-0 text-[length:var(--fs-text-sm)] text-accent-text">
                    {formatCopy(c.searchPinned, { n: row.pinCount })}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
