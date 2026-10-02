/**
 * الدفعة الخامسة — نفس الفكرة: عربي/لغات كموضوع أساسي. الزاوية هنا: كتاب
 * المادة الورقي، صفحة النتائج، وتسجيل الحساب — التلاتة فيتشرز حقيقية
 * (`book-order-button.tsx`/`book-order-panel.tsx`، `/results`، تسجيل حساب
 * من صفحة الكورس).
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

interface SeedArticle {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  relatedCourseSlug: string | null;
}

const ARTICLES: SeedArticle[] = [
  {
    slug: 'كتاب-برمجة-بكالوريا-عربي',
    title: 'كتاب برمجة بكالوريا عربي — أطلبه ورقي',
    excerpt:
      'كتاب مادة البرمجة وعلوم الحاسب لنسخة عربي: تقدر تطلبه ورقي من المنصة نفسها، غير ملف الـPDF اللي بتنزّله مجانًا.',
    body: `«أقرا من الشاشة بس ولا أقدر أطلب كتاب ورقي؟» — سؤال كل طالب بيحب يذاكر من ورق.

## فيه كتاب ورقي فعلًا؟

أيوه — زرار «اطلب الكتاب» موجود على صفحة كل كورس، غير ملف الـPDF اللي بتقدر تنزّله وتطبعه بنفسك مجانًا.

## طب الفرق بين الملف والكتاب الجاهز؟

- **PDF**: مجاني، تنزّله وتطبعه بنفسك.
- **الكتاب الجاهز**: يتطلب أونلاين ويوصلك، من غير ما تطبع بنفسك.

## الطلب بياخد وقت؟

الطلب بيتسجّل ومتابعته من حسابك — التفاصيل والتوقيت بيظهرولك وقت الطلب نفسه.

## أطلبه إزاي؟

من صفحة [منهج أولى بكالوريا عربي](/news/كورس-برمجة-اولى-بكالوريا-عربي-اونلاين) أو تانية بكالوريا عربي — زرار «اطلب الكتاب» بعد الاشتراك.`,
    relatedCourseSlug: 'programming-cs-year2-2027-general',
  },
  {
    slug: 'كتاب-برمجة-بكالوريا-لغات',
    title: 'كتاب برمجة بكالوريا لغات — أطلبه ورقي',
    excerpt:
      'كتاب مادة البرمجة وعلوم الحاسب لنسخة لغات بالإنجليزي: تقدر تطلبه ورقي من المنصة، غير ملف الـPDF المجاني.',
    body: `نفس السؤال بالإنجليزي: «أقدر أطلب كتاب ورقي؟»

## فيه كتاب ورقي؟

أيوه — زرار «اطلب الكتاب» على صفحة الكورس، بالإنجليزي بالكامل، غير الـPDF المجاني اللي بتنزّله بنفسك.

## الفرق؟

- **PDF**: مجاني، تطبعه بنفسك.
- **الكتاب الجاهز**: يوصلك من غير ما تطبع.

## أطلبه إزاي؟

من صفحة [منهج أولى بكالوريا لغات](/news/كورس-برمجة-اولى-بكالوريا-لغات-اونلاين) أو تانية بكالوريا لغات — زرار «اطلب الكتاب» بعد الاشتراك، والتفاصيل بتظهر وقت الطلب.`,
    relatedCourseSlug: 'programming-cs-year2-2027-languages',
  },
  {
    slug: 'نتيجة-برمجة-بكالوريا-عربي',
    title: 'نتيجة برمجة بكالوريا عربي — تتابعها فين',
    excerpt:
      'درجاتك في كويزات مادة البرمجة وعلوم الحاسب (نسخة عربي): صفحة «نتائجي» بتجمّع درجتك في كل درس في مكان واحد.',
    body: `«أعرف درجتي في كل درس من غير ما أدوّر كويز كويز؟» — صفحة «نتائجي» بترد على السؤال ده بالظبط.

## نتائجي فين؟

صفحة [نتائجي](/results) في حسابك — درجتك في كل كويز حليته، مجمّعة في مكان واحد، مش محتاج تفتح كل درس لوحده.

## والسؤال اللي غلطت فيه؟

مش بس درجة — كل سؤال غلطت فيه بيتسجّل في [دفتر غلطاتي](/news/دفتر-غلطاتي-برمجة-بكالوريا-عربي) تلقائيًا، وبتقدر تعيد الاختبار عليه لحد ما تثبّته.

## أراجع نقط ضعفي إزاي بالظبط؟

بص على الدروس اللي درجتك فيها أقل في «نتائجي»، وابدأ مذاكرتك منها — [طريقة المذاكرة الكاملة هنا](/news/مذاكرة-برمجة-بكالوريا-عربي-ازاي).

## أبدأ أحل كويزات إزاي؟

اشترك في [أولى بكالوريا عربي](/news/كورس-برمجة-اولى-بكالوريا-عربي-اونلاين) أو تانية بكالوريا عربي — كل كويز بتحله درجته بتتسجّل في نتائجك على طول.`,
    relatedCourseSlug: 'programming-cs-year2-2027-general',
  },
  {
    slug: 'نتيجة-برمجة-بكالوريا-لغات',
    title: 'نتيجة برمجة بكالوريا لغات — تتابعها فين',
    excerpt:
      'درجاتك في كويزات مادة البرمجة وعلوم الحاسب (نسخة لغات): صفحة «نتائجي» بتجمّع درجتك في كل درس في مكان واحد.',
    body: `نفس السؤال: «أعرف درجتي في كل درس من غير ما أدوّر كويز كويز؟»

## نتائجي فين؟

صفحة [نتائجي](/results) — درجتك في كل كويز، مجمّعة في مكان واحد.

## والأسئلة اللي غلطت فيها؟

بتتسجّل في [دفتر غلطاتي](/news/دفتر-غلطاتي-برمجة-بكالوريا-لغات) تلقائيًا، وبتقدر تعيد الاختبار عليها لحد ما تثبّتها.

## أراجع نقط ضعفي إزاي؟

بص على الدروس اللي درجتك فيها أقل — [طريقة المذاكرة الكاملة هنا](/news/مذاكرة-برمجة-بكالوريا-لغات-ازاي).

## أبدأ إزاي؟

اشترك في [أولى بكالوريا لغات](/news/كورس-برمجة-اولى-بكالوريا-لغات-اونلاين) أو تانية بكالوريا لغات — كل كويز بتحله بيتسجّل في نتائجك على طول.`,
    relatedCourseSlug: 'programming-cs-year2-2027-languages',
  },
  {
    slug: 'تسجيل-حساب-برمجة-بكالوريا-عربي',
    title: 'تسجيل حساب برمجة بكالوريا عربي — خطوة بخطوة',
    excerpt:
      'إزاي تعمل حساب على المنصة وتشترك في مادة البرمجة وعلوم الحاسب نسخة عربي: الخطوات، وأول محاضرة مجانية قبل ما تدفع.',
    body: `«الحساب بياخد وقت؟» — لأ، دقيقة وخلاص.

## الخطوات

1. ادخل على صفحة الكورس — [أولى بكالوريا عربي](/news/كورس-برمجة-اولى-بكالوريا-عربي-اونلاين) أو تانية بكالوريا عربي.
2. دوس «حساب جديد» واملا بياناتك.
3. دوس «تشغيل» على أول محاضرة — **مفتوحة من غير فلوس**، تتفرج وتقرر.
4. لو عجبك، اشترك بالخطة المناسبة — شهري أو ترم أو سنة.

## محتاج أدفع عشان أعمل حساب؟

لأ — الحساب مجاني، وأول محاضرة مفتوحة قبل أي دفع. [تفاصيل السعر والخطط هنا](/news/سعر-كورس-برمجة-بكالوريا-عربي).

## نسيت كلمة السر؟

تقدر تسترجعها من صفحة الدخول مباشرة.

## أبدأ دلوقتي؟

[افتح صفحة أولى بكالوريا عربي](/news/كورس-برمجة-اولى-بكالوريا-عربي-اونلاين) وابدأ بحساب جديد.`,
    relatedCourseSlug: 'programming-cs-year1-2027-general',
  },
  {
    slug: 'تسجيل-حساب-برمجة-بكالوريا-لغات',
    title: 'تسجيل حساب برمجة بكالوريا لغات — خطوة بخطوة',
    excerpt:
      'إزاي تعمل حساب على المنصة وتشترك في مادة البرمجة وعلوم الحاسب نسخة لغات: الخطوات، وأول محاضرة مجانية قبل ما تدفع.',
    body: `نفس الخطوات، دقيقة وخلاص.

## الخطوات

1. ادخل على صفحة الكورس — [أولى بكالوريا لغات](/news/كورس-برمجة-اولى-بكالوريا-لغات-اونلاين) أو تانية بكالوريا لغات.
2. دوس «حساب جديد» واملا بياناتك.
3. دوس «تشغيل» على أول محاضرة — مفتوحة من غير فلوس.
4. لو عجبك، اشترك بالخطة المناسبة.

## محتاج أدفع عشان أعمل حساب؟

لأ — الحساب مجاني، وأول محاضرة مفتوحة قبل أي دفع. [تفاصيل السعر هنا](/news/سعر-كورس-برمجة-بكالوريا-لغات).

## نسيت كلمة السر؟

تسترجعها من صفحة الدخول مباشرة.

## أبدأ دلوقتي؟

[افتح صفحة أولى بكالوريا لغات](/news/كورس-برمجة-اولى-بكالوريا-لغات-اونلاين) وابدأ بحساب جديد.`,
    relatedCourseSlug: 'programming-cs-year1-2027-languages',
  },
];

async function main() {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && !process.argv.includes('--yes-production')) {
    throw new Error(
      'refusing to touch production without --yes-production (articles will still land as drafts)',
    );
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const author = await prisma.user.findFirst({
      where: { role: { not: 'student' } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!author) {
      throw new Error('no admin account found — run the admin seed first');
    }

    const publish = process.argv.includes('--publish') && !isProduction;

    for (const article of ARTICLES) {
      const course = article.relatedCourseSlug
        ? await prisma.course.findUnique({ where: { slug: article.relatedCourseSlug }, select: { id: true } })
        : null;
      if (article.relatedCourseSlug && !course) {
        console.warn(`course slug not found, linking nothing: ${article.relatedCourseSlug}`);
      }

      await prisma.newsPost.upsert({
        where: { slug: article.slug },
        update: {
          title: article.title,
          excerpt: article.excerpt,
          body: article.body,
          relatedCourseId: course?.id ?? null,
          ...(publish ? { status: 'published' as const, publishedAt: new Date() } : {}),
        },
        create: {
          slug: article.slug,
          title: article.title,
          excerpt: article.excerpt,
          body: article.body,
          relatedCourseId: course?.id ?? null,
          authorId: author.id,
          ...(publish ? { status: 'published' as const, publishedAt: new Date() } : {}),
        },
      });
    }

    console.log(`seeded ${ARTICLES.length} article(s) as ${publish ? 'PUBLISHED' : 'drafts'}.`);
    if (!publish) {
      console.log('review them in the admin, then publish — they carry the instructor’s name.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
