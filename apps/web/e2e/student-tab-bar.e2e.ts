import { expect, test } from '@playwright/test';
import { copy } from '@ayman/contracts';
import { registerAndOnboard, uniqueStudent } from './fixtures';

/**
 * الشريط السفلي — أربع وجهات على لمسة واحدة، على الفون بس.
 *
 * ## اللي بيتحرس هنا مش الشكل
 *
 * الفايدة كلها في «لمسة واحدة». التست الأساسي تحت بيفتح صفحة من الشريط من غير
 * ما يلمس القائمة خالص — ده اللي لو انكسر الفيتشر يبقى رجع صفر، وأي تست على
 * ألوان أو حدود كان هيفضل أخضر وهو راجع.
 *
 * وبيتحرس كمان إنه **مش** بيظهر على الديسكتوب (فيه ريل هناك)، ولا جوّه امتحان
 * ماشي (الشِل كله بينزل هناك، والتنقّل الدايم جنب ورقة بالوقت لمسة غلط واحدة من
 * الخروج منها).
 *
 * ⚠️ المقاسات بتتقاس على ٣٦٠ بكسل، وهي أضيق شاشة الجمهور ده بيستخدمها — نفس
 * الرقم اللي `student-shell.e2e.ts` بيقيس عليه التوب بار، ولنفس السبب: الجهاز
 * الافتراضي بتاع بلايرايت أوسع من ده، و`html { overflow-x: clip }` معناه إن
 * صف زايد عن الحرف بيتقطع في صمت ومفيش assertion بيشتكي.
 */
test.describe('student tab bar', () => {
  test('opens a destination in ONE tap, without the menu', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile', 'الشريط ده للفون بس');

    const student = uniqueStudent();
    await registerAndOnboard(page, student);

    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/dashboard');

    const bar = page.getByRole('navigation', { name: copy.nav.mainNav }).last();
    await expect(bar).toBeVisible();

    // اللمسة الواحدة. القائمة مالهاش دعوة — ولو الشريط باظ، ده اللي بيقع.
    await bar.getByRole('link', { name: copy.nav.results }).click();
    await expect(page).toHaveURL(/\/results$/);

    // «إنت هنا» بيتقال للسكرين ريدر كمان، مش بالستايل بس — ولينك واحد بس.
    const current = bar.locator('a[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveAttribute('href', '/results');
  });

  test('sits inside a 360px screen with four hittable tabs', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile', 'قياس على عرض فون');

    const student = uniqueStudent();
    await registerAndOnboard(page, student);

    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/dashboard');

    const tabs = page.locator('.tabbar__tab');
    await expect(tabs).toHaveCount(4);

    for (const tab of await tabs.all()) {
      const box = await tab.boundingBox();
      expect(box).not.toBeNull();
      if (!box) continue;
      // ٤٤ بكسل هو أقل هدف لمس في WCAG 2.5.5 وفي دليل آبل وجوجل، والتلاتة
      // بيتفقوا. الشريط بيطلب ٥٦ عشان الأيقونة والكلمة فوق بعض.
      expect(box.height).toBeGreaterThanOrEqual(44);
      // جوّه الشاشة، مش مقطوع على الحرف.
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(361);
    }
  });

  test('never covers the bottom of the page', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile', 'قياس على عرض فون');

    const student = uniqueStudent();
    await registerAndOnboard(page, student);

    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/dashboard');

    /*
     * المسافة تحت المحتوى (`.shell main { padding-block-end }`) هي اللي
     * بتمنع الشريط إنه يغطّي آخر حاجة في الصفحة. بتتقاس على الصفحة وهي
     * منزّلة لآخرها: فوق الشريط بيبقى فوق المحتوى طبيعي، وتحت بس هو اللي
     * ممكن يخبّي حاجة.
     */
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    const barBox = await page.locator('.tabbar').boundingBox();
    const mainBox = await page.locator('.shell main').boundingBox();
    expect(barBox).not.toBeNull();
    expect(mainBox).not.toBeNull();
    if (!barBox || !mainBox) return;

    // آخر المحتوى بيخلص فوق الشريط، مش تحته.
    expect(mainBox.y + mainBox.height).toBeLessThanOrEqual(barBox.y + 1);
  });

  test('is absent on a desktop viewport, where the rail carries these links', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'الريل بيرد على الديسكتوب');

    const student = uniqueStudent();
    await registerAndOnboard(page, student);

    await page.goto('/dashboard');

    // موجود في الـDOM و`md:hidden` بيخبّيه — فالمقياس هو إنه مش ظاهر، مش إنه
    // مش مرسوم.
    await expect(page.locator('.tabbar')).toBeHidden();
  });

  test('is gone while a timed attempt is running', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile', 'الشريط ده للفون بس');

    const student = uniqueStudent();
    await registerAndOnboard(page, student);

    /*
     * الشِل كله مش بيترسم على `/quizzes/:id/attempt/:id` — والشريط جوّاه، فبينزل
     * معاه. اللينك المباشر بيرجّع ٤٠٤/تحويل على امتحان مش موجود، وده كفاية:
     * اللي بيتحرس إن مفيش شريط على الراوت ده، مش إن الامتحان بيفتح.
     */
    await page.goto('/quizzes/nonexistent/attempt/nonexistent');

    await expect(page.locator('.tabbar')).toHaveCount(0);
  });
});
