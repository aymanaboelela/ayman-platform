/**
 * رد `/api/guardian/me` — العقد نفسه عايش في `@ayman/contracts/guardian-view`
 * عشان الـAPI والصفحة يتكلموا على نفس الشكل بالحرف، والتايب‌سكريبت يزعّق
 * لو واحد فيهم اتغيّر من غير التاني.
 */
export { GuardianViewSchema, type GuardianView } from '@ayman/contracts/guardian-view';
