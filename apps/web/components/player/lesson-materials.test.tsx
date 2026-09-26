/* `fireEvent` مش `userEvent`: التاني مش في `package.json` ومحدش في الريبو
   بيستخدمه، فكان هيفشل في CI على import مش على سلوك. */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { PlayerResource } from '@ayman/contracts/progress';

import { LessonMaterials } from './lesson-materials';

/**
 * ملف المدرّس لازم يبان للطالب من غير ما يدوس.
 *
 * ## اللي كان
 *
 * القسم كان مقفول افتراضيًا، والحجة المكتوبة «PDF بيترسم نفسه تحت كل فيديو
 * صفحة محدش طلبها». وهي صح **لو** المرفقات بتتحط على كل محاضرة — بس مش ده
 * اللي بيحصل: الكومبوننت ده أصلًا مابيترسمش لما مفيش مرفقات (الكيس التالت).
 *
 * فالمقايضة مش «صفحة أطول» ضد «أقصر»، هي «الطالب يشوف الملف» ضد «يعرف إن فيه
 * ملف لو خطر في باله يدوس». والمدرّس رفعه عشان يتقرا.
 */
/* الشكل الحقيقي من `PlayerResourceSchema` — مش تقريب. فيكستشر بحقول مخترعة
   بيعدّي التايب تشيك بـ`as never` وبيفشل وقت التشغيل على حقل مش موجود. */
const resource = (id: string, title: string): PlayerResource => ({
  id,
  kind: 'document',
  title,
  description: null,
  filename: `${id}.pdf`,
  mime: 'application/pdf',
  sizeBytes: 1024,
  youtubeId: null,
  linkUrl: null,
  viewPath: `/api/lessons/r/${id}/view`,
  downloadPath: `/api/lessons/r/${id}/download`,
});

/*
 * ⚠️ زرار الطيّ بالتحديد، مش `getByRole('button')`.
 *
 * اللوحة المفتوحة جوّاها زراير بتاعتها (تحميل، فتح)، فالاستعلام العام فشل
 * بـ«عناصر متعددة» — وde كمان كان بيثبت إن القسم مفتوح وهو المفروض يتأكد
 * منه. `aria-controls` هو المقبض اللي بيسمّي الزرار ده لوحده، وهو نفس الحاجة
 * اللي قارئ الشاشة بيقراها.
 */
function toggle(container: HTMLElement): HTMLElement {
  const el = container.querySelector('button[aria-controls="lesson-materials"]');
  if (!el) throw new Error('زرار الطيّ مش موجود');
  return el as HTMLElement;
}

afterEach(cleanup);

describe('مرفقات المحاضرة', () => {
  it('بتبان من غير ما الطالب يدوس', () => {
    const { container } = render(<LessonMaterials resources={[resource('a', 'ملزمة الوحدة')]} />);

    /*
     * ⚠️ اللوحة المفتوحة، مش نص العنوان.
     *
     * أول نسخة كانت `getByText('ملزمة الوحدة')` وفشلت بـ«عناصر متعددة» —
     * العنوان بيتكتب مرتين، في الزرار وفي الليستة اللي تحته. الفشل ده كان
     * **بيثبت إن القسم مفتوح** وهو المفروض يتأكد منه، بس بيتقري كأنه عطل.
     *
     * اللي بيفرّق مفتوح من مقفول هو وجود الحاوية نفسها.
     */
    expect(container.querySelector('#lesson-materials')).not.toBeNull();
  });

  it('الزرار بيقول إنه مفتوح، عشان قارئ الشاشة يعرف نفس الحاجة', () => {
    const { container } = render(<LessonMaterials resources={[resource('a', 'ملزمة')]} />);

    expect(toggle(container).getAttribute('aria-expanded')).toBe('true');
  });

  it('ولسه بيتقفل — اللي مش عايزه بيطويه', () => {
    const { container } = render(<LessonMaterials resources={[resource('a', 'ملزمة')]} />);

    // دوسة واحدة لازم تطويه فعلًا — «الزرار موجود» مش إثبات إنه بيشتغل.
    fireEvent.click(toggle(container));
    expect(container.querySelector('#lesson-materials')).toBeNull();
  });

  it('⚠️ ومحاضرة من غير مرفقات مابترسمش القسم خالص', () => {
    // ده الكيس اللي بيخلّي «مفتوح افتراضيًا» مش معناه «قسم زيادة على كل صفحة».
    const { container } = render(<LessonMaterials resources={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
