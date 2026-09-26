import { cleanup, render, screen } from '@testing-library/react';
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
  url: null,
  viewPath: `/api/lessons/r/${id}/view`,
  downloadPath: `/api/lessons/r/${id}/download`,
});

afterEach(cleanup);

describe('مرفقات المحاضرة', () => {
  it('بتبان من غير ما الطالب يدوس', () => {
    render(<LessonMaterials resources={[resource('a', 'ملزمة الوحدة')]} />);

    // المحتوى نفسه، مش الزرار — زرار موجود وقسم مطوي هو بالظبط اللي اتشكى منه.
    expect(screen.getByText('ملزمة الوحدة')).toBeTruthy();
  });

  it('الزرار بيقول إنه مفتوح، عشان قارئ الشاشة يعرف نفس الحاجة', () => {
    render(<LessonMaterials resources={[resource('a', 'ملزمة')]} />);

    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true');
  });

  it('ولسه بيتقفل — اللي مش عايزه بيطويه', () => {
    render(<LessonMaterials resources={[resource('a', 'ملزمة')]} />);

    // الزرار مكانه. اللي اتغيّر هو الحالة الابتدائية، مش إن القسم بقى ثابت.
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('⚠️ ومحاضرة من غير مرفقات مابترسمش القسم خالص', () => {
    // ده الكيس اللي بيخلّي «مفتوح افتراضيًا» مش معناه «قسم زيادة على كل صفحة».
    const { container } = render(<LessonMaterials resources={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
