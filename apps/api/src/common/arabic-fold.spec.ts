import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { escapeLike, foldArabic, FOLD_FROM, FOLD_TO } from './arabic-fold';

/**
 * «امجد» لازم يلاقي «أمجد».
 *
 * ده كان البحث في قسم «الفريق»: المدرّس كتب الاسم من غير همزة، زي ما
 * المصريين أغلبهم بيكتبوا، والطالب متسجّل بالهمزة — فالبحث قال «مفيش حساب».
 */
describe('foldArabic', () => {
  it.each([
    ['أمجد', 'امجد'],
    ['إسلام', 'اسلام'],
    ['آية', 'ايه'],
    ['مصطفى', 'مصطفي'],
    ['فاطمة', 'فاطمه'],
    ['مُحَمَّد', 'محمد'],
    ['عـــلي', 'علي'],
    ['Ahmed', 'ahmed'],
  ])('folds %s to %s', (input, expected) => {
    expect(foldArabic(input)).toBe(expected);
  });

  it('makes the hamza-less spelling and the written one meet', () => {
    expect(foldArabic('أمجد سامي عبد الله')).toContain(foldArabic('امجد'));
    expect(foldArabic('امجد محمود على')).toContain(foldArabic('أمجد'));
  });

  it('pairs every letter it maps — a short FOLD_TO deletes on purpose, a wrong one would not', () => {
    // The first six are replacements; everything after is deleted. If a
    // seventh replacement were ever appended to FOLD_TO alone, it would
    // silently start mapping tatweel to a letter.
    expect(FOLD_TO).toHaveLength(6);
    expect(FOLD_FROM.slice(0, 6)).toBe('أإآٱىة');
  });
});

describe('escapeLike', () => {
  it('turns the LIKE wildcards into literal characters', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
  });
});

/**
 * الطي بيحصل في مكانين — هنا، وفي `translate()` جوّه Postgres على الاسم
 * المتخزّن. لو اختلفوا في حرف واحد، البحث بيفوّت نتايج من غير خطأ. فالتست ده
 * بيسأل Postgres نفسه، مش نسخة مننا من اللي Postgres بيعمله.
 *
 * مابيكتبش أي صف — `SELECT translate(...)` على قيم ثابتة.
 */
describe('foldArabic agrees with Postgres translate()', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.each(['أمجد سامي', 'إسلام آل ٱلعلا', 'مصطفى فاطمة', 'مُحَمَّد عـــلي', 'Ahmed ALI'])(
    'folds %s the same on both sides',
    async (name) => {
      const rows = await prisma.$queryRaw<{ folded: string }[]>`
        SELECT lower(translate(${name}, ${FOLD_FROM}, ${FOLD_TO})) AS folded
      `;
      expect(rows[0]?.folded).toBe(foldArabic(name));
    },
  );
});
