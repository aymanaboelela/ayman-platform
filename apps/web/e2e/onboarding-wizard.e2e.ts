import { test, expect } from '@playwright/test';
import { copy } from '@ayman/contracts';
import { register, uniqueStudent } from './fixtures';

/**
 * Every query is scoped to the `main` landmark, never to the page.
 *
 * Two different things outside `main` collide with these labels. The header
 * is one. The bigger one is the route being left behind: this test arrives at
 * /onboarding through a client-side transition from /register, whose own form
 * has a `name` input carrying the same "الاسم الكامل" label, and React keeps
 * the previous route mounted while the new one commits. An unscoped
 * `getByLabel` matches both and fails strict mode — intermittently, since it
 * depends on which side of the commit the query lands.
 */
function form(page: import('@playwright/test').Page) {
  return page.getByRole('main');
}

test.describe('onboarding wizard', () => {
  test('prefills the name from the account and gates each step separately', async ({ page }) => {
    const student = uniqueStudent();
    await register(page, student);
    await expect(page).toHaveURL(/\/onboarding/);

    const main = form(page);
    const nameField = main.getByLabel(copy.onboarding.fullName);

    // The account already told us the name — the student should not have to
    // retype it — and it stays editable, because a provider's display name is
    // regularly a nickname.
    await expect(nameField).toHaveValue(student.name);
    await expect(nameField).toBeEditable();

    // Step 1 only. Step 2's field exists in the DOM (so it can be focused when
    // it errors) but must not be on screen.
    await expect(main.getByLabel(copy.onboarding.governorate)).toBeHidden();

    // Advancing with step 1 incomplete reports step 1 — and says nothing about
    // steps the student has not been shown.
    await main.getByRole('button', { name: copy.onboarding.next }).click();
    // Scoped to role=alert: `genderError` is the same string as the select's
    // own empty option, so matching on text alone also matches the option.
    await expect(
      main.getByRole('alert').filter({ hasText: copy.onboarding.genderError }),
    ).toBeVisible();
    await expect(main.getByLabel(copy.onboarding.governorate)).toBeHidden();

    await nameField.fill('طالب اختبار');
    await main.getByLabel(copy.onboarding.gender).selectOption('male');
    await main.getByLabel(copy.onboarding.phone).fill('01011122233');
    await main.getByRole('button', { name: copy.onboarding.next }).click();

    await expect(main.getByLabel(copy.onboarding.governorate)).toBeVisible();

    // Step 2 gates on BOTH its required fields, not just the first one: the
    // school stream (مدرسة عام ولا لغات) is required, so a filled governorate
    // is no longer enough to move on. Unlike `genderError`, this message is
    // not also the select's placeholder, so no role scoping is needed to tell
    // the alert apart from an option.
    await main.getByLabel(copy.onboarding.governorate).selectOption({ index: 1 });
    await main.getByRole('button', { name: copy.onboarding.next }).click();
    await expect(
      main.getByRole('alert').filter({ hasText: copy.onboarding.schoolStreamError }),
    ).toBeVisible();
    await expect(main.getByLabel(copy.onboarding.year)).toBeHidden();

    // Back must not validate and must not discard: a student correcting an
    // earlier answer cannot be blocked by the step they are leaving.
    await main.getByRole('button', { name: copy.onboarding.back }).click();
    await expect(nameField).toHaveValue('طالب اختبار');
  });

  test('shows who you are signing up as', async ({ page }) => {
    const student = uniqueStudent();
    await register(page, student);
    await expect(page).toHaveURL(/\/onboarding/);

    const main = form(page);
    await expect(main.getByText(`${copy.onboarding.identityGreeting} ${student.name}`)).toBeVisible();
    await expect(main.getByText(student.email)).toBeVisible();
    // An email/password account has no avatar, so this path must render the
    // initials fallback rather than a broken image.
    await expect(main.getByRole('img')).toHaveCount(0);
  });
});
