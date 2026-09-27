import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERMISSION_CATEGORIES, categoryOf } from './permission-categories';

/**
 * الكتالوج الحقيقي، متقري من `apps/api/src/auth/permissions.ts` نفسه.
 *
 * ⚠️ متقري مش متستورد، وده مقصود: `permissions.ts` ملف API، والكونتراكتس
 * مابتعتمدش على الـAPI — الاتجاه ده بيكسر البناء. القراية النصّية بتدّي نفس
 * الجارد من غير الاعتماد.
 */
function catalogue(): string[] {
  const path = join(import.meta.dirname, '..', '..', '..', '..', 'apps', 'api', 'src', 'auth', 'permissions.ts');
  const source = readFileSync(path, 'utf8');
  const start = source.indexOf('export const PERMISSIONS = [');
  const end = source.indexOf('] as const', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const body = source.slice(start, end);
  return [...new Set([...body.matchAll(/'([a-z-]+:[a-z-]+)'/g)].map((match) => match[1]!))];
}

describe('PERMISSION_CATEGORIES', () => {
  /*
   * ⚠️ ده الجارد اللي الفيتشر كلها قايمة عليه.
   *
   * صلاحية جديدة تتضاف للكتالوج ومحدش يحطها في قسم = صلاحية **مش ظاهرة على
   * الشاشة**، فمحدش يقدر يقفلها على مساعد. والشاشة شكلها طبيعي طول الوقت،
   * فمفيش حد ياخد باله — وده عكس السبب اللي الفيتشر اتعملت عشانه بالظبط.
   */
  it('covers every permission in the catalogue', () => {
    const uncategorised = catalogue().filter((permission) => categoryOf(permission) === undefined);

    expect(uncategorised).toEqual([]);
  });

  /* والعكس: قسم بيسمّي صلاحية مش موجودة = شيك بوكس بيكتب صف في الداتابيز
     مالوش أي أثر، والمدرّس بيقفله ويفتكر إنه قفل حاجة. */
  it('names no permission the catalogue does not have', () => {
    const known = new Set(catalogue());
    const invented = PERMISSION_CATEGORIES.flatMap((category) =>
      category.permissions.filter((permission) => !known.has(permission)),
    );

    expect(invented).toEqual([]);
  });

  it('puts each permission in exactly one category', () => {
    const seen = new Map<string, number>();
    for (const category of PERMISSION_CATEGORIES) {
      for (const permission of category.permissions) {
        seen.set(permission, (seen.get(permission) ?? 0) + 1);
      }
    }

    expect([...seen.entries()].filter(([, count]) => count > 1)).toEqual([]);
  });

  /* الفلوس هي القسم اللي الفيتشر اتطلبت عشانه بالنص — «مساعد يعرف يعمل حاجات
     كتير بس ميشوفش المصروفات». لو المصروفات خرجت منه، القفل بيبقى بلا معنى. */
  it('keeps the money permissions in الفلوس', () => {
    const finance = PERMISSION_CATEGORIES.find((category) => category.key === 'finance');

    expect(finance?.permissions).toContain('expense:read');
    expect(finance?.permissions).toContain('expense:write');
    expect(finance?.permissions).toContain('payment:read');
  });

  it('gives every category an Arabic title and a hint', () => {
    for (const category of PERMISSION_CATEGORIES) {
      expect(category.titleAr.trim().length).toBeGreaterThan(2);
      // السطر التاني بيوصف الأثر، مش بيترجم الكلمة — فمايكونش أقصر من العنوان.
      expect(category.hintAr.trim().length).toBeGreaterThan(category.titleAr.length);
    }
  });
});
