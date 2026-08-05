/**
 * Seeds «نيوز» with the opening set of articles.
 *
 * ## What these are, and what they are deliberately not
 *
 * Evergreen teaching content about programming fundamentals. NOT ministry
 * news, exam dates or curriculum decisions — those go stale, get republished
 * wrong by aggregators, and a wrong date on a teacher's own site costs more
 * trust than the traffic is worth. Nothing below can be made false by a
 * decree: a loop is a loop.
 *
 * ## Why each one is shaped the way it is
 *
 * Every title is a QUESTION, because that is what a student types into Google
 * and into an assistant. «إيه هي الحلقة التكرارية» gets searched; «الحلقات»
 * does not. Each article then answers that question in its first paragraph
 * (the part a search engine quotes), teaches it with runnable Python, and ends
 * on the platform.
 *
 * ## Idempotent, and DRAFT by default
 *
 * Upserts by slug, so re-running repairs rather than duplicates. Everything is
 * created as a DRAFT: these were written by an assistant, and the instructor's
 * name goes on them. Publishing is a human act — do it from the admin, or pass
 * `--publish` here once the wording has actually been read.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

interface SeedArticle {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
}

/**
 * ⚠️ Arabic slugs on purpose. A percent-encoded UTF-8 path is handled fine by
 * every search engine, and an Arabic query matching an Arabic URL is a signal
 * a transliterated slug throws away.
 */
const ARTICLES: SeedArticle[] = [
  {
    slug: 'إيه-هو-المتغير-في-البرمجة',
    title: 'إيه هو المتغيّر في البرمجة؟',
    excerpt:
      'المتغيّر هو اسم بتحطّ فيه قيمة عشان تستعملها بعدين. شرح بالعربي بأمثلة كود بايثون شغّالة، وإيه الفرق بينه وبين الثابت.',
    body: `المتغيّر هو **اسم بتديه لقيمة** عشان تقدر ترجعلها وتستعملها في أي وقت. بدل ما تكتب الرقم ١٠٠ في عشر أماكن، تحطّه في متغيّر مرة واحدة وتستعمل الاسم.

\`\`\`python
score = 100
print(score)
\`\`\`

هنا \`score\` هو المتغيّر، و\`100\` هي القيمة اللي جوّاه.

## ليه أصلاً بنستخدم متغيّرات؟

- **عشان تغيّر في مكان واحد.** لو الدرجة النهائية اتغيّرت من ١٠٠ لـ ١٥٠، بتعدّل سطر واحد.
- **عشان الكود يبقى مفهوم.** \`price * 0.14\` مش واضحة؛ \`price * tax_rate\` واضحة على طول.
- **عشان تحفظ نتيجة حساب** وتستعملها أكتر من مرة من غير ما تعيد الحساب.

## القيمة بتتغيّر

الاسم نفسه بيفضل، والقيمة اللي جوّاه هي اللي بتتبدّل:

\`\`\`python
score = 100
score = score + 10
print(score)
\`\`\`

الناتج هيبقى \`110\`. السطر التاني بيقرا القيمة القديمة، يزوّد عليها ١٠، ويرجّع الناتج لنفس الاسم.

## اختيار الاسم مش تفصيلة

الاسم بيتقري أكتر ما بيتكتب. \`x\` مش بتقول حاجة، \`student_score\` بتقول كل حاجة. وقاعدة عملية: لو محتاج كومنت تشرح المتغيّر بيعمل إيه، غالبًا الاسم هو المشكلة.

## غلطة شائعة

في بايثون، الاسم لازم يتحدّد قبل ما تستعمله:

\`\`\`python
print(total)
total = 5
\`\`\`

ده بيدّي \`NameError\`، لأن السطر الأول بينادي على اسم لسه مش موجود. الترتيب مهم.

## الخلاصة

المتغيّر = اسم + قيمة. اسم كويس بيخلي الكود يشرح نفسه، والقيمة بتتغيّر براحتك من غير ما الاسم يتغيّر.`,
  },
  {
    slug: 'إيه-هي-الحلقة-التكرارية',
    title: 'إيه هي الحلقة التكرارية (Loop)؟',
    excerpt:
      'الحلقة بتخلّي الكمبيوتر يكرّر نفس الخطوات من غير ما تكتبها تاني. الفرق بين for وwhile بالعربي وبأمثلة عملية.',
    body: `الحلقة التكرارية بتخلّي الكمبيوتر **يكرّر نفس الخطوات** عدد من المرات، من غير ما تكتب الكود ده أكتر من مرة.

من غير حلقة، لو عايز تطبع الأرقام من ١ لـ ٥:

\`\`\`python
print(1)
print(2)
print(3)
print(4)
print(5)
\`\`\`

بالحلقة:

\`\`\`python
for i in range(1, 6):
    print(i)
\`\`\`

خمس سطور بقت سطرين — والأهم إن لو عايز توصل لـ ١٠٠٠، السطرين دول ما هيتغيّروش غير في رقم واحد.

## for ولا while؟

القاعدة العملية بسيطة:

- **\`for\`** لما تكون عارف بتلفّ على إيه — قايمة، نص، أو مدى أرقام.
- **\`while\`** لما تكون مش عارف هتلفّ كام مرة، وبتكرّر طول ما شرط معيّن صحّ.

\`\`\`python
password = ""
while password != "1234":
    password = input("اكتب الرقم السري: ")
\`\`\`

هنا مفيش عدد مرات معروف — بيفضل يسأل لحد ما الشرط يتحقّق.

## الحلقة اللانهائية

أشهر غلطة في \`while\`: الشرط ما بيتغيّرش أبدًا جوّه الحلقة.

\`\`\`python
i = 0
while i < 5:
    print(i)
\`\`\`

\`i\` فضلت صفر، فالشرط هيفضل صحّ للأبد والبرنامج هيعلّق. لازم حاجة جوّه الحلقة تحرّك الشرط ناحية النهاية:

\`\`\`python
i = 0
while i < 5:
    print(i)
    i = i + 1
\`\`\`

## المسافة البادئة مش شكل

في بايثون، اللي جوّه الحلقة بيتحدّد بالمسافة البادئة (indentation). السطر اللي مش مزاح جوّه، بيتنفّذ **مرة واحدة بعد** ما الحلقة تخلص، مش كل لفة. ودي غلطة بتعدّي من غير رسالة خطأ — الكود بيشتغل، بس نتيجته غلط.

## الخلاصة

الحلقة بتشيل التكرار من على دماغك. \`for\` لما العدد معروف، \`while\` لما الشرط هو اللي يحكم — وفي الحالتين لازم يبقى فيه طريق للنهاية.`,
  },
  {
    slug: 'إيه-هي-الدالة-function',
    title: 'إيه هي الدالة (Function) وإمتى تستخدمها؟',
    excerpt:
      'الدالة بتلمّ مجموعة خطوات تحت اسم واحد تناديه وقت ما تحب. شرح بالعربي للـ parameters والـ return بأمثلة بايثون.',
    body: `الدالة هي **مجموعة خطوات لمّيتها تحت اسم واحد**، وبتناديها وقت ما تحتاجها بدل ما تعيد كتابتها.

\`\`\`python
def greet(name):
    print("أهلاً يا " + name)

greet("أحمد")
greet("سارة")
\`\`\`

كتبت الخطوة مرة، ونادتها مرتين.

## المدخلات (Parameters)

\`name\` في المثال فوق اسمه **parameter** — مكان فاضي بتملاه وقت ما تنادي الدالة. الدالة الواحدة ممكن تاخد أكتر من مدخل:

\`\`\`python
def area(width, height):
    return width * height
\`\`\`

## الفرق بين print وreturn

دي أكتر نقطة بتلخبط في البداية:

- **\`print\`** بيعرض حاجة على الشاشة، وخلاص.
- **\`return\`** بيرجّع قيمة للكود اللي نادى الدالة، فتقدر تستعملها.

\`\`\`python
result = area(5, 3)
total = result + 10
\`\`\`

لو \`area\` كانت بتعمل \`print\` بدل \`return\`، ماكنتش هتقدر تحط الناتج في \`result\` ولا تجمع عليه — كنت هتشوف الرقم على الشاشة وبس.

## إمتى أعمل دالة؟

- لما تلاقي نفسك بتكرّر نفس الكود في أكتر من مكان.
- لما جزء من الكود له **مهمة واضحة** تقدر تسمّيها في كلمتين.
- لما تحب تختبر جزء لوحده من غير ما تشغّل البرنامج كله.

ولو الدالة بقت طويلة أوي لدرجة إنك مش قادر تسمّيها باسم واحد واضح، دي علامة إنها بتعمل أكتر من حاجة ومحتاجة تتقسّم.

## الخلاصة

الدالة بتحوّل الكود من قايمة خطوات طويلة لمجموعة أدوات ليها أسماء. المدخلات بتخلّيها مرنة، و\`return\` هي اللي بتخلّي ناتجها قابل للاستعمال.`,
  },
  {
    slug: 'الشرط-if-في-البرمجة',
    title: 'إزاي البرنامج بياخد قرار؟ الشرط if بالعربي',
    excerpt:
      'الشرط بيخلّي البرنامج ينفّذ حاجة في حالة وحاجة تانية في حالة تانية. شرح if وelif وelse بأمثلة كود بايثون.',
    body: `البرنامج من غير شروط بيمشي في خط واحد من أول سطر لآخر سطر. الشرط هو اللي بيخلّيه **يفرّق بين حالة وحالة**.

\`\`\`python
score = 75

if score >= 50:
    print("ناجح")
else:
    print("محتاج تحاول تاني")
\`\`\`

## أكتر من حالتين

لما الحالات تبقى أكتر من اتنين، بتستخدم \`elif\`:

\`\`\`python
if score >= 85:
    print("ممتاز")
elif score >= 70:
    print("جيد جدًا")
elif score >= 50:
    print("ناجح")
else:
    print("راسب")
\`\`\`

**الترتيب هنا مهم جدًا.** بايثون بتفحص الشروط من فوق لتحت وبتقف عند أول شرط يتحقّق. لو بدأت بـ \`score >= 50\`، كل الدرجات فوق الخمسين هتقع فيه والباقي مش هيتنفّذ أبدًا.

## علامة المقارنة مش علامة الإسناد

\`=\` بتحطّ قيمة، و\`==\` بتقارن. دي غلطة كلاسيكية:

\`\`\`python
if score = 50:
\`\`\`

ده خطأ في بايثون. الصح \`if score == 50:\`.

## ربط شروط ببعض

\`\`\`python
if score >= 50 and attendance >= 75:
    print("ناجح")
\`\`\`

- \`and\` — لازم الاتنين يتحقّقوا.
- \`or\` — يكفي واحد منهم.
- \`not\` — بتعكس الشرط.

## الخلاصة

الشرط هو نقطة القرار في البرنامج. \`if\` للحالة الأولى، \`elif\` للحالات اللي بعدها، \`else\` لأي حاجة تانية — وبيتفحصوا بالترتيب، فرتّبهم من الأخصّ للأعمّ.`,
  },
  {
    slug: 'إيه-هي-المصفوفة-array',
    title: 'إيه هي المصفوفة (Array) وإمتى تحتاجها؟',
    excerpt:
      'المصفوفة بتخزّن مجموعة قيم تحت اسم واحد بدل عشر متغيّرات. شرح الفهرسة والدوران عليها بالعربي بأمثلة بايثون.',
    body: `تخيّل إنك عايز تخزّن درجات ٣٠ طالب. هتعمل ٣٠ متغيّر؟ المصفوفة بتحلّ ده: **اسم واحد بيشيل مجموعة قيم مرتّبة**.

\`\`\`python
scores = [90, 75, 60, 88]
\`\`\`

## الفهرسة بتبدأ من صفر

أهم حاجة تفتكرها: أول عنصر رقمه **صفر**، مش واحد.

\`\`\`python
print(scores[0])
print(scores[3])
\`\`\`

الأول هيطبع \`90\`، والتاني \`88\`. ولو كتبت \`scores[4]\` هتاخد خطأ \`IndexError\`، لأن آخر فهرس في مصفوفة فيها ٤ عناصر هو \`3\`.

القاعدة: **آخر فهرس = عدد العناصر − ١**.

## الدوران على المصفوفة

هنا بتلمّ الحلقة مع المصفوفة، وده أكتر استخدام هتعمله في حياتك:

\`\`\`python
total = 0
for score in scores:
    total = total + score

print(total / len(scores))
\`\`\`

\`len(scores)\` بترجّع عدد العناصر، فالسطر الأخير بيحسب المتوسط.

## عمليات بتحتاجها كتير

\`\`\`python
scores.append(100)
scores.remove(60)
print(len(scores))
print(max(scores))
\`\`\`

## إمتى تستخدمها؟

لما يكون عندك **مجموعة حاجات من نفس النوع** عايز تتعامل معاها كوحدة واحدة — درجات، أسماء، قراءات. ولو كل قيمة ليها معنى مختلف تمامًا (اسم، سن، عنوان)، ساعتها متغيّرات منفصلة أو نوع بيانات تاني أنسب.

## الخلاصة

المصفوفة بتحوّل ٣٠ متغيّر لاسم واحد. ابدأ العدّ من صفر، خلّي بالك من آخر فهرس، واستعمل الحلقة عشان تمرّ عليها كلها.`,
  },
  {
    slug: 'الفرق-بين-الخوارزمية-والبرنامج',
    title: 'إيه الفرق بين الخوارزمية والبرنامج؟',
    excerpt:
      'الخوارزمية هي الخطة، والبرنامج هو تنفيذها بلغة برمجة. شرح الفرق بالعربي بمثال عملي، وليه الفرق ده مهم في الامتحان.',
    body: `الفرق ببساطة: **الخوارزمية هي الخطة، والبرنامج هو الخطة دي مكتوبة بلغة برمجة**.

الخوارزمية مش مرتبطة بلغة معيّنة. تقدر تكتبها بالعربي على ورقة.

## مثال: أكبر رقم في قايمة

الخوارزمية:

1. اعتبر أول رقم هو الأكبر مؤقتًا.
2. لفّ على باقي الأرقام واحد واحد.
3. لو لقيت رقم أكبر من اللي معاك، خلّيه هو الأكبر.
4. لما تخلص، اللي معاك هو الأكبر فعلاً.

نفس الخطوات دي كبرنامج:

\`\`\`python
numbers = [12, 45, 7, 88, 30]
largest = numbers[0]

for number in numbers:
    if number > largest:
        largest = number

print(largest)
\`\`\`

الخطوات الأربعة اتحوّلت لسبع سطور. لو كتبتها بلغة تانية، الكود هيتغيّر بالكامل — **بس الخطوات الأربعة هي هي**.

## ليه الفرق ده مهم؟

- **الخطأ بيتصلّح في مكانه الصح.** لو الخوارزمية غلط، مفيش تعديل في الكود هيصلّحها.
- **بتفكّر قبل ما تكتب.** أغلب الوقت الضايع في البرمجة سببه إن حد بدأ يكتب كود قبل ما يعرف الخطوات.
- **في الامتحان،** السؤال كتير بيطلب الخطوات أو الفلوشارت، مش الكود.

## علامات إن الخوارزمية كويسة

- ليها بداية ونهاية واضحة — بتخلص، مش بتفضل تلفّ.
- كل خطوة محدّدة، مفيهاش "يعني تقريبًا".
- بتشتغل على كل الحالات، مش على المثال اللي في دماغك بس. جرّبها على قايمة فاضية، أو قايمة فيها رقم واحد.

## الخلاصة

اكتب الخطوات الأول بالعربي، وبعدين ترجمها لكود. اللي بيبدأ بالكود بيقضّي وقته بيصلّح أعراض مشكلة في التفكير مش في الكتابة.`,
  },
];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed-news refuses to run against NODE_ENV=production');
  }

  const url = process.env.DIRECT_DATABASE_URL;
  if (!url) throw new Error('DIRECT_DATABASE_URL is required');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  try {
    // The articles are attributed to an admin — `authorId` is a real FK and
    // there is no "system" user to hide behind.
    const author = await prisma.user.findFirst({
      where: { role: 'admin' },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!author) {
      throw new Error('no admin account found — run the admin seed first');
    }

    const publish = process.argv.includes('--publish');


    for (const article of ARTICLES) {
      await prisma.newsPost.upsert({
        where: { slug: article.slug },
        /**
         * Only the CONTENT is updated on re-run.
         *
         * ⚠️ `status` is absent unless `--publish` was passed EXPLICITLY, and
         * that default matters: a plain re-seed must never publish something
         * the instructor deliberately pulled down, nor silently flip a live
         * article's state. `--publish` is an opt-in for local verification —
         * the script already refuses to run against production at all.
         */
        update: {
          title: article.title,
          excerpt: article.excerpt,
          body: article.body,
          ...(publish ? { status: 'published' as const, publishedAt: new Date() } : {}),
        },
        create: {
          slug: article.slug,
          title: article.title,
          excerpt: article.excerpt,
          body: article.body,
          authorId: author.id,
          ...(publish ? { status: 'published' as const, publishedAt: new Date() } : {}),
        },
      });
    }

    const total = await prisma.newsPost.count();
    console.log(
      `seeded ${ARTICLES.length} article(s) as ${publish ? 'PUBLISHED' : 'drafts'}; ${total} in total`,
    );
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
