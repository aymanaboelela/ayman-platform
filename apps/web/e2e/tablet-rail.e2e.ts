import { expect, test } from '@playwright/test';
import { copy } from '@ayman/contracts';
import { registerAndOnboard, uniqueStudent } from './fixtures';

/**
 * الآيباد الرأسي: الريل بيبدأ مقفول، وإن الطالب فتحه بإيده يفضل مفتوح.
 *
 * ## الرقم
 *
 * الريل ٢٩٦ بكسل. آيباد رأسي عرضه ٨٢٠ = ٥٢٤ بكسل للمحتوى، عرض فون على تابلت.
 * بالريل مقفول بيبقى ٧٤٤.
 *
 * ## اللي بيتحرس، واللي التصليح ده كان ممكن ينكسر فيه
 *
 * التست التاني هو المهم. قفل الريل افتراضيًا على التابلت سهل — سطر CSS. الصعب
 * إن الطالب اللي **فتحه بإيده** مايرجعش يلاقيه مقفول، وده كان مستحيل على العقد
 * القديم: `localStorage.rail` كان بياخد `'collapsed'` بس والغياب معناه «مفتوح»،
 * فمفيش قيمة تقول «فاتحها بإيدي». لو العقد رجع اتنين تاني، التست ده هو اللي
 * بيقع — والباقي بيفضل أخضر.
 *
 * بيشتغل في مشروع الديسكتوب لأن الموبايل مقاسه مثبّت على فون: المقاس هنا
 * بيتحدّد بالإيد.
 */
const TABLET = { width: 820, height: 1180 };

test.describe('tablet rail', () => {
  test.skip(() => test.info().project.name !== 'desktop', 'المقاس بيتظبط بالإيد هنا');

  test('starts collapsed on an 820px portrait tablet', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);

    await page.setViewportSize(TABLET);
    await page.goto('/dashboard');

    // مفيش اختيار مخزّن — فالسمة مش موجودة والعرض هو اللي بيقرر.
    await expect(page.locator('html')).not.toHaveAttribute('data-rail', 'expanded');

    // المقياس الحقيقي: الريل بعرض الأيقونة، فالمحتوى واخد باقي الشاشة.
    const railBox = await page.locator('.rail').boundingBox();
    expect(railBox).not.toBeNull();
    if (!railBox) return;
    // ٧٦ بكسل هو `--rail-w-collapsed`، و٢٩٦ هو المفتوح. أي رقم تحت ١٥٠ معناه
    // مقفول من غير ما التست يتعلّق بالقيمة بالظبط.
    expect(railBox.width).toBeLessThan(150);
  });

  test('stays expanded across a reload once the student opens it', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);

    await page.setViewportSize(TABLET);
    await page.goto('/dashboard');

    // الزرار بيقول «افتح» لأنه مقفول فعلًا — وده كمان بيتحقق إن الحالة في
    // رياكت شايفة نفس اللي الـCSS رسمه، مش الافتراضي القديم.
    await page.getByRole('button', { name: copy.nav.expandRail }).click();
    await expect(page.locator('html')).toHaveAttribute('data-rail', 'expanded');

    /*
     * ⚠️ ده بيت القصيد. `expanded` لازم تتكتب في `localStorage` **و** سكريبت
     * الـprepaint لازم يختمها قبل أول رسمة — وإلا الصفحة بتفتح مقفولة تاني
     * لأن الافتراضي بتاع العرض بيغلب، والطالب بيفتحها كل مرة من جديد.
     */
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-rail', 'expanded');

    const railBox = await page.locator('.rail').boundingBox();
    expect(railBox).not.toBeNull();
    if (!railBox) return;
    expect(railBox.width).toBeGreaterThan(150);
  });

  test('is still expanded by default on a laptop', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);

    // ١٤٤٠ — مقاس مشروع الديسكتوب نفسه. الافتراضي هنا ما اتغيرش، والتست ده
    // موجود عشان قفل التابلت مايزحفش فوق.
    await page.goto('/dashboard');

    const railBox = await page.locator('.rail').boundingBox();
    expect(railBox).not.toBeNull();
    if (!railBox) return;
    expect(railBox.width).toBeGreaterThan(150);
  });
});
