import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AdminEmpty } from './admin-empty';
import { SpotIllustration, type SpotName } from '@/components/dashboard/spot-illustration';

afterEach(cleanup);

const ALL: SpotName[] = [
  'courses',
  'exams',
  'scores',
  'topics',
  'preparing',
  'payments',
  'transfers',
  'orders',
  'homework',
  'codes',
  'people',
  'inbox',
];

describe('SpotIllustration', () => {
  /*
   * الجدول (`SPOTS`) بقى `Record<SpotName, …>`، فالتايب سكريبت بيرفض اسم مالوش
   * رسمة. اللي التايب مش شايفه هو العكس: اسم في الليستة دي اتشال من النوع.
   * والتست ده بيرسم كل واحد فعلًا — قبل الجدول كانت سلسلة `? :` بتنتهي
   * بـfallback، فاسم مالوش فرع كان بيرسم «النتايج» في صمت بدل ما يفشل.
   */
  it.each(ALL)('draws %s', (name) => {
    const { container } = render(<SpotIllustration name={name} />);
    const svg = container.querySelector('svg.spot');

    expect(svg).not.toBeNull();
    // مش إطار فاضي: كل رسمة جوّاها أشكال.
    expect(svg?.querySelectorAll('rect, circle, path').length).toBeGreaterThan(1);
  });

  it('is hidden from screen readers — the sentence under it says the same thing', () => {
    const { container } = render(<SpotIllustration name="payments" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('AdminEmpty', () => {
  it('draws the spot beside the words', () => {
    const { container } = render(
      <AdminEmpty spot="payments" title="مفيش طلبات دلوقتي" hint="أول ما طالب يبعت، هيظهر هنا." />,
    );

    expect(screen.getByText('مفيش طلبات دلوقتي')).toBeTruthy();
    expect(screen.getByText('أول ما طالب يبعت، هيظهر هنا.')).toBeTruthy();
    expect(container.querySelector('svg.spot')).not.toBeNull();
  });

  /*
   * الهينت والزرار الاتنين اختياريين، وده مقصود: «المدفوعات» الفاضية مفيهاش
   * حاجة المدرّس يعملها — الطلبة هُمّ اللي بيبعتوا، وزرار هناك بيوعد بحاجة مش
   * موجودة. لو الاتنين بقوا مطلوبين، الشاشات دي هتخترع نص عشان تملاهم.
   */
  it('renders a bare title with no hint and no action', () => {
    const { container } = render(<AdminEmpty spot="homework" title="مفيش ورق مستني" />);

    expect(screen.getByText('مفيش ورق مستني')).toBeTruthy();
    expect(container.querySelector('.admin-empty__hint')).toBeNull();
    expect(container.querySelector('.admin-empty__action')).toBeNull();
  });

  it('carries an action when the screen has something to create', () => {
    render(
      <AdminEmpty spot="codes" title="مفيش أكواد" action={<button type="button">كود جديد</button>} />,
    );

    expect(screen.getByRole('button', { name: 'كود جديد' })).toBeTruthy();
  });
});
