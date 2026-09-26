import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts';
import { formatCopy } from '@ayman/contracts/format';
import type { DashboardMonthOffer } from '@ayman/contracts/progress';
import { MonthNewsBand } from './month-news-band';

afterEach(cleanup);

const c = copy.dashboard.monthNews;

const TWO = { id: '43b617d0-ed92-4c60-9a8d-a18c2ee22df2', title: 'شهر ٢', lessonCount: 0, priceCents: 15000 };
const THREE = { id: '5b1e2c7a-0000-4000-8000-000000000003', title: 'شهر ٣', lessonCount: 5, priceCents: 12000 };

function offer(over: Partial<DashboardMonthOffer> = {}): DashboardMonthOffer {
  return {
    courseId: 'c1',
    courseSlug: 'programming-y2',
    courseTitle: 'كورس البرمجة',
    months: [TWO],
    pending: false,
    lapsed: false,
    ...over,
  };
}

/**
 * «شهر جديد اتفتح» — الشريط اللي فوق الداشبورد.
 *
 * ⚠️ مين مايشوفهوش مش بيتقرر هنا. الـAPI بيرجّع أراي فاضية للطالب اللي اشترك
 * ترم، أو اللي مادفعش بالشهر خالص — والتستات بتاعت ده في
 * `dashboard.service.spec.ts` لأن ده استعلام، مش رندر. اللي هنا هو اللي
 * الكومبوننت مسؤول عنه: إنه يختفي على أراي فاضية، وإن الباب اللي بيفتحه
 * صح.
 */
describe('MonthNewsBand', () => {
  it('renders nothing at all when there is no new month', () => {
    const { container } = render(<MonthNewsBand offers={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names the month, names its course, and links to the checkout with it chosen', () => {
    render(<MonthNewsBand offers={[offer()]} />);

    expect(
      screen.getByRole('heading', { name: formatCopy(c.titleOne, { month: 'شهر ٢' }) }),
    ).toBeTruthy();
    // طالب في كورسين بالشهور محتاج يعرف ده بتاع مين.
    expect(screen.getByText(formatCopy(c.course, { course: 'كورس البرمجة' }))).toBeTruthy();
    // شهر اتفتح قبل محاضراته بيقول كده، مش «٠ محاضرة».
    expect(screen.getByText(c.lessonsEmpty)).toBeTruthy();
    expect(screen.getByRole('link', { name: c.ctaOne })).toHaveAttribute(
      'href',
      `/courses/programming-y2/subscribe?month=${TWO.id}`,
    );
  });

  it('carries every open month it offers in one link, and totals them', () => {
    render(<MonthNewsBand offers={[offer({ months: [TWO, THREE] })]} />);

    expect(screen.getByRole('link', { name: c.ctaMany })).toHaveAttribute(
      'href',
      `/courses/programming-y2/subscribe?month=${TWO.id},${THREE.id}`,
    );
    // الإجمالي على الشريط، والتغيير بيحصل جوّه الشيك أوت — مفيش تجليخ هنا.
    expect(screen.getByText(/27/)).toBeTruthy();
  });

  it('gives each course its own row when two of them opened a month', () => {
    render(
      <MonthNewsBand
        offers={[
          offer(),
          offer({ courseId: 'c2', courseSlug: 'ai-y3', courseTitle: 'الذكاء الاصطناعي', months: [THREE] }),
        ]}
      />,
    );

    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getByText(formatCopy(c.course, { course: 'الذكاء الاصطناعي' }))).toBeTruthy();
    // العنوان العام لما يكون فيه أكتر من كورس — «شهر ٢ اتفتح» لوحدها كانت
    // هتقول شهر ٢ بتاع مين.
    expect(screen.getByRole('heading', { name: c.titleMany })).toBeTruthy();
  });

  /*
   * طلب مستنّي في المراجعة: الشيك أوت بيرفض التاني أصلًا، فالصف بيقول الحالة.
   * زرار بيودّي على «قيد المراجعة» أسوأ من جملة بتقول الحقيقة.
   */
  it('states the pending review instead of a button the checkout would refuse', () => {
    render(<MonthNewsBand offers={[offer({ pending: true })]} />);

    expect(screen.getByText(c.pending)).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  /*
   * ⚠️ قاعدة الصفحة: زرار أمبر واحد على الشاشة. لما يكون فيه امتحان شهر مفتوح،
   * `dashboard/page.tsx` بتوقّف `<NextUpBlock>` لأن الأمبر بقى على «ادخل
   * الامتحان» — والشريط ده بيهدّى لنفس السبب. بيهدّى وماينزلش: الباب الوحيد
   * للفلوس مايختفيش عشان فيه امتحان.
   */
  it('keeps its link but drops the accent while a monthly exam is open', () => {
    render(<MonthNewsBand offers={[offer()]} quiet />);

    const cta = screen.getByRole('link', { name: c.ctaOne });
    expect(cta).toHaveAttribute('data-quiet');
  });

  it('carries the accent when no exam is competing for it', () => {
    render(<MonthNewsBand offers={[offer()]} />);

    expect(screen.getByRole('link', { name: c.ctaOne })).not.toHaveAttribute('data-quiet');
  });

  /*
   * ⚠️ اشتراكه خلص: `months` بتبقى **كل** الشهور المفتوحة مش الجديد فيهم، فـ
   * «شهر ٢ اتفتح» كانت هتكون كذب. العنوان بيقول «اشتراكك خلص»، واللينك زي ما
   * هو — نفس الباب، معنى مختلف.
   */
  it('says the subscription ended instead of naming a new month', () => {
    render(<MonthNewsBand offers={[offer({ lapsed: true, months: [TWO, THREE] })]} />);

    expect(screen.getByRole('heading', { name: c.lapsedTitle })).toBeTruthy();
    expect(screen.getByText(c.lapsedLead)).toBeTruthy();
    expect(screen.queryByText(c.lead)).toBeNull();
    expect(screen.getByRole('link', { name: c.ctaMany })).toHaveAttribute(
      'href',
      `/courses/programming-y2/subscribe?month=${TWO.id},${THREE.id}`,
    );
  });

  /*
   * شاشة مخلوطة: كورس خلص وكورس لسه شغّال. العنوان مايقدرش يقول الاتنين، فبيقول
   * الجملة العامة، والصف اللي خلص بيقول حالته بنفسه. من غير الشيب ده الشاشة
   * كانت هتعرض على الطالب شهر على كورس هو مقفول عليه بالكامل ومش بتقول له.
   */
  it('marks the lapsed row when another course is still running', () => {
    render(
      <MonthNewsBand
        offers={[
          offer(),
          offer({ courseId: 'c2', courseSlug: 'ai-y3', courseTitle: 'الذكاء الاصطناعي', lapsed: true }),
        ]}
      />,
    );

    expect(screen.getByRole('heading', { name: c.titleMany })).toBeTruthy();
    // مرة واحدة بس — على الصف اللي خلص، مش على الاتنين.
    expect(screen.getAllByText(c.lapsedChip)).toHaveLength(1);
  });

  /* وكل الصفوف خلصت = العنوان بيقولها، والشيب على الصف بيبقى تكرار. */
  it('does not repeat the chip on every row when they have all lapsed', () => {
    render(
      <MonthNewsBand
        offers={[offer({ lapsed: true }), offer({ courseId: 'c2', courseSlug: 'ai-y3', lapsed: true })]}
      />,
    );

    expect(screen.getByRole('heading', { name: c.lapsedTitle })).toBeTruthy();
    expect(screen.queryByText(c.lapsedChip)).toBeNull();
  });
});
